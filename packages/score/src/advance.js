// Suggested advance limit (cupo de anticipo sugerido), rule cupo-v1.
// This is a transparent, versioned rule, NOT a credit model: it estimates
// expected production from the crop condition index and applies the coop's
// haircut. Repayment is captured at delivery settlement, so nothing here
// predicts default.
import { WEIGHTS } from "./score.js";

export const ADVANCE_RULE_VERSION = "cupo-v1";

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** Plain-language contribution of each term to the condition index. */
export function explainFactors(result, inputs, sources = {}) {
  return [
    {
      name: "ndvi_norm",
      label: "Vigor del cultivo (satelite)",
      value: result.ndvi_norm,
      weight: WEIGHTS.ndvi_norm,
      contribution: round(WEIGHTS.ndvi_norm * result.ndvi_norm, 2),
      source: sources.ndvi ?? "measured",
      input: { ndvi: inputs.ndvi },
    },
    {
      name: "climate",
      label: "Lluvia de los ultimos 7 dias",
      value: result.climate,
      weight: WEIGHTS.climate,
      contribution: round(WEIGHTS.climate * result.climate, 2),
      source: sources.rain ?? "measured",
      input: { rain_mm_7d: inputs.rain_mm_7d },
    },
    {
      name: "weeds_pct",
      label: "Presion de malezas (fotos)",
      value: inputs.weeds_pct,
      weight: WEIGHTS.weeds_pct,
      contribution: round(WEIGHTS.weeds_pct * inputs.weeds_pct, 2),
      source: sources.weeds ?? "simulated",
      input: { weeds_pct: inputs.weeds_pct },
    },
  ];
}

/**
 * @param {{ score_exact: number, light: string }} result from computeScore
 * @param {{ ha: number, yield_ref_t_ha: number, price_usd_t: number, haircut: number, fx_ars_per_usd?: number, benchmark_flat_pct?: number }} econ
 */
export function advanceLimit(result, econ) {
  const condition = result.score_exact;
  const yieldEst = round(econ.yield_ref_t_ha * (condition / 100), 2);
  const tons = round(yieldEst * econ.ha, 1);
  const referenceValueUsd = round(econ.yield_ref_t_ha * econ.ha * econ.price_usd_t, 0);
  const estimatedValueUsd = round(tons * econ.price_usd_t, 0);
  const pctOfReference = round(econ.haircut * condition, 1); // haircut * condition/100 * 100
  const limitUsd = round(referenceValueUsd * (pctOfReference / 100), 0);
  const status = result.light === "rojo" ? "blocked" : result.light === "amarillo" ? "review" : "allowed";
  const fx = econ.fx_ars_per_usd ?? null;
  const benchmarkPct = econ.benchmark_flat_pct ?? 30;
  return {
    rule_version: ADVANCE_RULE_VERSION,
    condition_index: condition,
    light: result.light,
    production_estimate: {
      yield_t_ha: yieldEst,
      tons,
      value_usd: estimatedValueUsd,
      basis: "yield_ref_t_ha * condition_index / 100, linear rule",
    },
    advance_limit: {
      pct_of_reference_value: pctOfReference,
      usd: status === "blocked" ? 0 : limitUsd,
      ars: status === "blocked" || fx === null ? (status === "blocked" ? 0 : null) : round(limitUsd * fx, 0),
      new_disbursements: status,
      formula: "reference_value_usd * haircut * condition_index / 100; rojo blocks new disbursements",
    },
    benchmark: {
      flat_pct: benchmarkPct,
      usd: round(referenceValueUsd * (benchmarkPct / 100), 0),
      note: "what a coop advances today: a flat percentage for every member",
    },
    reference: {
      ha: econ.ha,
      yield_ref_t_ha: econ.yield_ref_t_ha,
      price_usd_t: econ.price_usd_t,
      fx_ars_per_usd: fx,
      haircut: econ.haircut,
      reference_value_usd: referenceValueUsd,
    },
  };
}

// ---------------------------------------------------------------------------
// cupo-v2: the same condition rule, anchored on the official floor.
//
// cupo-v1 sizes the advance against yield_ref_t_ha (3.2 t/ha), a reference
// figure for a lote in full condition. That produced a limit of roughly
// 50-56k USD while capacidad-v2 -- reading the worst year the district
// actually had -- puts the lote's floor at 29877 USD. Two rules, two
// answers, same lote: a credit committee finds that contradiction
// immediately.
//
// v2 keeps every term of the condition index, weeds from Vision included,
// and only swaps the BASE: instead of "what this lote yields at full
// condition", the advance is a share of "what this lote is worth in the
// worst campaign on record for its district". Capacity sets the ceiling,
// condition decides how much of it is released.
//
// The gate propagates: if capacity could not publish a floor (the lote does
// not track its district, or the series is too thin), there is no ceiling to
// draw against and v2 publishes nothing either. A limit with no floor behind
// it is exactly the number cupo-v1 was producing.
export const ADVANCE_V2_RULE_VERSION = "cupo-v2";

/**
 * @param {{ score_exact: number, light: string }} result from computeScore
 * @param {{ ha: number, price_usd_t: number, haircut: number, fx_ars_per_usd?: number, benchmark_flat_pct?: number, yield_ref_t_ha?: number }} econ
 * @param {{ yield_t_ha: number|null, campana: string|null, available: boolean, source?: string }} floor from capacidad-v2 worst_year
 */
export function advanceLimitFromFloor(result, econ, floor) {
  const condition = result.score_exact;
  const status = result.light === "rojo" ? "blocked" : result.light === "amarillo" ? "review" : "allowed";
  const fx = econ.fx_ars_per_usd ?? null;
  const available = Boolean(floor && floor.available && floor.yield_t_ha !== null);

  const floorValueUsd = available ? round(econ.ha * floor.yield_t_ha * econ.price_usd_t, 0) : null;
  const ceilingUsd = floorValueUsd === null ? null : round(floorValueUsd * econ.haircut, 0);
  const releasedUsd = ceilingUsd === null ? null : round(ceilingUsd * (condition / 100), 0);

  // "blocked" (rojo) is a measured zero: the lote is in bad condition, so
  // nothing new goes out. "no_capacity" is null: we do not know the floor,
  // which is a different statement and must not read as zero.
  const publishable = available && status !== "blocked";
  const limitUsd = available ? (status === "blocked" ? 0 : releasedUsd) : null;

  return {
    rule_version: ADVANCE_V2_RULE_VERSION,
    condition_index: condition,
    light: result.light,
    floor: {
      campana: floor?.campana ?? null,
      yield_t_ha: floor?.yield_t_ha ?? null,
      value_usd: floorValueUsd,
      source: floor?.source ?? "unavailable",
      available,
      basis: "worst campaign on record for the district, from the official series",
    },
    advance_limit: {
      usd: limitUsd,
      ars: limitUsd === null || fx === null ? null : round(limitUsd * fx, 0),
      ceiling_usd: ceilingUsd,
      pct_of_ceiling: publishable ? round(condition, 1) : 0,
      new_disbursements: available ? status : "blocked_no_capacity",
      formula: "ha * floor_yield_t_ha * price_usd_t * haircut * condition_index / 100; rojo blocks new disbursements",
      note: available
        ? "capacity sets the ceiling, condition releases a share of it"
        : "withheld: capacity could not establish a floor for this lote",
    },
    benchmark: {
      flat_pct: econ.benchmark_flat_pct ?? 30,
      usd: floorValueUsd === null ? null : round(floorValueUsd * ((econ.benchmark_flat_pct ?? 30) / 100), 0),
      note: "what a coop advances today: a flat percentage for every member",
    },
    reference: {
      ha: econ.ha,
      price_usd_t: econ.price_usd_t,
      haircut: econ.haircut,
      fx_ars_per_usd: fx,
      floor_value_usd: floorValueUsd,
    },
  };
}
