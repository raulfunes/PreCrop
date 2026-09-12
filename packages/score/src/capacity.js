// Capacity rule capacidad-v1: what the lot produces in a bad year, how stable
// it is, and the pre-sowing advance quota against the WORST campaign the lot
// already had. Transparent linear rule, not a calibrated model; the contrast
// against official department yields is what backs it.
import { ndviNorm } from "./score.js";

export const CAPACITY_RULE_VERSION = "capacidad-v1";

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * @param {{ campaign: string, ndvi: number, rain_dec_feb_mm?: number, date?: string, scene_id?: string }[]} peaks one row per campaign
 * @param {{ ha: number, yield_ref_t_ha: number, price_usd_t: number, haircut: number, fx_ars_per_usd?: number }} econ
 * @param {{ [campaign: string]: number }} [officialYields] official t/ha per campaign, when available
 */
export function capacity(peaks, econ, officialYields = {}) {
  if (!Array.isArray(peaks) || peaks.length === 0) throw new Error("capacity: at least one campaign peak is required");
  const rows = peaks.map((p) => {
    const norm = round(ndviNorm(p.ndvi), 2);
    const yieldEst = round(econ.yield_ref_t_ha * (norm / 100), 2);
    const official = officialYields[p.campaign];
    return {
      campaign: p.campaign,
      date: p.date ?? null,
      scene_id: p.scene_id ?? null,
      ndvi: p.ndvi,
      ndvi_min_in_window: p.ndvi_min_in_window ?? null,
      ndvi_norm: norm,
      yield_est_t_ha: yieldEst,
      tons_est: round(yieldEst * econ.ha, 1),
      rain_dec_feb_mm: p.rain_dec_feb_mm ?? null,
      official_yield_t_ha: official ?? null,
      error_vs_official_pct: official ? round(((yieldEst - official) / official) * 100, 1) : null,
    };
  });

  const yields = rows.map((r) => r.yield_est_t_ha);
  const worst = rows.reduce((a, b) => (b.yield_est_t_ha < a.yield_est_t_ha ? b : a));
  const best = rows.reduce((a, b) => (b.yield_est_t_ha > a.yield_est_t_ha ? b : a));
  const mean = yields.reduce((a, b) => a + b, 0) / yields.length;
  const variance = yields.reduce((a, y) => a + (y - mean) ** 2, 0) / yields.length;
  const cv = mean > 0 ? round((Math.sqrt(variance) / mean) * 100, 1) : null;
  const stability = cv === null ? "unknown" : cv < 10 ? "alta" : cv < 20 ? "media" : "baja";

  const worstTons = round(worst.yield_est_t_ha * econ.ha, 1);
  const worstValueUsd = round(worstTons * econ.price_usd_t, 0);
  const quotaUsd = round(worstValueUsd * econ.haircut, 0);
  const fx = econ.fx_ars_per_usd ?? null;

  const withOfficial = rows.filter((r) => r.error_vs_official_pct !== null);
  const mae = withOfficial.length
    ? round(withOfficial.reduce((a, r) => a + Math.abs(r.error_vs_official_pct), 0) / withOfficial.length, 1)
    : null;

  return {
    rule_version: CAPACITY_RULE_VERSION,
    campaigns: rows,
    n_campaigns: rows.length,
    worst_campaign: { campaign: worst.campaign, yield_est_t_ha: worst.yield_est_t_ha, tons_est: worstTons, ndvi: worst.ndvi },
    best_campaign: { campaign: best.campaign, yield_est_t_ha: best.yield_est_t_ha },
    mean_yield_t_ha: round(mean, 2),
    stability: { cv_pct: cv, label: stability },
    pre_sowing_quota: {
      basis: "worst campaign the lot already had, not the best",
      tons: worstTons,
      value_usd: worstValueUsd,
      haircut: econ.haircut,
      usd: quotaUsd,
      ars: fx === null ? null : round(quotaUsd * fx, 0),
      pct_of_reference_value: round((quotaUsd / (econ.ha * econ.yield_ref_t_ha * econ.price_usd_t)) * 100, 1),
      formula: "ha * yield_est(worst campaign) * price_usd_t * haircut",
    },
    contrast_official: {
      campaigns_with_official: withOfficial.length,
      mean_abs_error_pct: mae,
      note: withOfficial.length ? "lot estimate vs official department yield, same campaigns" : "no official yields loaded yet (data/rindes-oficiales.json)",
    },
  };
}
