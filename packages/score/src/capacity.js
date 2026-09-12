// Pre-sowing advance capacity, rule capacidad-v1.
//
// Capacity answers "how much can be advanced BEFORE sowing", sized against
// the worst year this lote already had. Condition (cupo-v1) answers "does
// the next disbursement go out". Different questions, different rules.
//
// This rule is deliberately NOT the same linear rule as cupo-v1. cupo-v1
// uses the full condition index (0.6*ndvi + 0.25*climate - 0.15*weeds);
// per campaign there is no weed history and the rain window is Dec-Feb
// rather than 7 days, so capacity runs on NDVI alone and says so.
//
// The rule REFUSES to publish a limit it cannot back. A linear NDVI->yield
// rule is not a calibrated model, so the estimate is validated against the
// official yield series before any number is handed to a credit committee:
// if the lote's worst year does not land on the official worst year, the
// estimator has not earned the right to size an advance, and the limit
// comes back null with the reason attached. Publishing an unvalidated
// pre-sowing limit is the one failure mode that actually costs a coop
// money.
import { ndviNorm } from "./score.js";

export const CAPACITY_RULE_VERSION = "capacidad-v1";

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// ponytail: r2 >= 0.7 is the team's provisional floor for "the estimator
// tracks reality", not an agronomic standard. It is a placeholder chosen to
// be strict enough to catch a series that explains less than half the
// variance. Ceiling: with 7 points, r2 is noisy and a single campaign moves
// it a lot. Next step: agree the floor with an agronomist, or replace the
// linear rule with one fitted on the official series and report its
// out-of-sample error instead.
const MIN_R2 = 0.7;

/** Pearson correlation. Returns null when either series is constant. */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Sample coefficient of variation: stdev / mean. */
function coefficientOfVariation(values) {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return null;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  return round(Math.sqrt(variance) / mean, 4);
}

/**
 * @param {{ campaigns: Array<{campana: string, ndvi_peak: number|null, ndvi_norm: number|null, rain_dec_feb_mm: number}> }} history
 * @param {{ ha: number, yield_ref_t_ha: number, price_usd_t: number, haircut: number, fx_ars_per_usd?: number }} econ
 * @param {{ campaigns: Array<{campana: string, rinde_dpto_kg_ha: number|null, rinde_prov_kg_ha: number|null}> }} [official]
 */
export function capacityFromHistory(history, econ, official = null) {
  const officialBy = new Map(
    (official?.campaigns ?? []).map((c) => [c.campana, c]),
  );

  const series = history.campaigns.map((c) => {
    const measured = c.ndvi_peak !== null && c.ndvi_peak !== undefined;
    // ndvi_norm is recomputed rather than trusted from the file so the rule
    // owns its own arithmetic and a stale JSON cannot quietly change it.
    const norm = measured ? round(ndviNorm(c.ndvi_peak), 4) : null;
    const off = officialBy.get(c.campana) ?? null;
    return {
      campana: c.campana,
      ndvi_peak: measured ? c.ndvi_peak : null,
      ndvi_norm: norm,
      rain_dec_feb_mm: c.rain_dec_feb_mm ?? null,
      yield_est_t_ha: measured ? round(econ.yield_ref_t_ha * (norm / 100), 2) : null,
      official_dpto_kg_ha: off?.rinde_dpto_kg_ha ?? null,
      official_prov_kg_ha: off?.rinde_prov_kg_ha ?? null,
      // A gap is a gap. Never 0: a cloudy February is missing evidence, not
      // a failed crop, and a zero here would invent the worst year.
      status: measured ? "measured" : "gap",
    };
  });

  const measured = series.filter((s) => s.status === "measured");
  const estimates = measured.map((s) => s.yield_est_t_ha);

  const worstEstimated = measured.length
    ? measured.reduce((a, b) => (b.yield_est_t_ha < a.yield_est_t_ha ? b : a))
    : null;

  const withOfficial = series.filter((s) => s.official_dpto_kg_ha !== null);
  const worstOfficial = withOfficial.length
    ? withOfficial.reduce((a, b) => (b.official_dpto_kg_ha < a.official_dpto_kg_ha ? b : a))
    : null;

  const paired = measured.filter((s) => s.official_dpto_kg_ha !== null);
  const r = paired.length >= 3
    ? pearson(paired.map((s) => s.ndvi_norm), paired.map((s) => s.official_dpto_kg_ha))
    : null;
  const r2 = r === null ? null : round(r * r, 4);

  const reasons = [];
  if (!official) reasons.push("no official yield series supplied for contrast");
  if (worstEstimated && worstOfficial && worstEstimated.campana !== worstOfficial.campana) {
    reasons.push(
      `worst estimated year (${worstEstimated.campana}) does not match worst official year (${worstOfficial.campana})`,
    );
  }
  if (r2 !== null && r2 < MIN_R2) {
    reasons.push(`estimate explains too little of the official variance (r2 ${r2} < ${MIN_R2})`);
  }
  if (r2 === null && official) reasons.push("not enough paired campaigns to correlate");
  if (series.some((s) => s.status === "gap")) {
    reasons.push("series has at least one campaign with no usable scene");
  }

  const validated = reasons.length === 0;

  const worstYieldTHa = worstEstimated ? worstEstimated.yield_est_t_ha : null;
  const limitUsd = worstYieldTHa === null
    ? null
    : round(econ.ha * worstYieldTHa * econ.price_usd_t * econ.haircut, 0);
  const fx = econ.fx_ars_per_usd ?? null;

  return {
    rule_version: CAPACITY_RULE_VERSION,
    series,
    coverage: {
      campaigns_total: series.length,
      campaigns_measured: measured.length,
      campaigns_with_gap: series.length - measured.length,
    },
    worst_year: worstEstimated
      ? {
          campana: worstEstimated.campana,
          yield_est_t_ha: worstEstimated.yield_est_t_ha,
          ndvi_peak: worstEstimated.ndvi_peak,
          official_dpto_kg_ha: worstEstimated.official_dpto_kg_ha,
          basis: "minimum of the estimated series; gaps excluded, never counted as zero",
        }
      : null,
    stability: {
      cv: coefficientOfVariation(estimates),
      basis: "sample stdev / mean of the estimated yields",
      note: "lower is steadier; a high cv means the lote's output swings between campaigns",
    },
    validation: {
      validated,
      worst_official_campana: worstOfficial ? worstOfficial.campana : null,
      worst_official_kg_ha: worstOfficial ? worstOfficial.official_dpto_kg_ha : null,
      pearson_r: r === null ? null : round(r, 4),
      r2,
      min_r2: MIN_R2,
      paired_campaigns: paired.length,
      reasons,
      basis:
        "the estimated series must land its worst year on the official worst year and track the official variance before a limit is published",
    },
    pre_sowing_limit: {
      // Held back, not zeroed: null means "not backed", which is a
      // different statement from "the lote supports nothing".
      usd: validated ? limitUsd : null,
      ars: validated && limitUsd !== null && fx !== null ? round(limitUsd * fx, 0) : null,
      usd_if_validated: limitUsd,
      status: validated ? "allowed" : "blocked_unvalidated",
      formula: "ha * worst_year_yield_t_ha * price_usd_t * haircut",
      basis:
        "yield_ref_t_ha * ndvi_norm / 100, linear rule (NDVI only; no weeds or 7d-rain history per campaign) -- NOT the cupo-v1 condition index",
      note: validated
        ? "sized against the worst year this lote already had"
        : "withheld: the NDVI estimator did not reproduce the official series, so this limit has no backing",
    },
    reference: {
      ha: econ.ha,
      yield_ref_t_ha: econ.yield_ref_t_ha,
      price_usd_t: econ.price_usd_t,
      haircut: econ.haircut,
      fx_ars_per_usd: fx,
    },
  };
}
