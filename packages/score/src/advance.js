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
