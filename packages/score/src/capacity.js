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

// ---------------------------------------------------------------------------
// capacidad-v2: the limit rests on the official series, not on NDVI.
//
// capacidad-v1 above turns peak NDVI into tons with a linear rule and takes
// the minimum. Contrasted against the official MAGyP series for Rio Segundo,
// that estimator does not hold up: it puts the worst year on 2023/24 while
// the official worst year is 2022/23 (1170 kg/ha, the drought), and explains
// r2 0.43 of the official variance. Peak NDVI moves 17 pct across campaigns
// while real yield moves 214 pct, and in 2022/23 the canopy stayed green in
// February even though the crop never filled grain.
//
// The obvious repair -- keep the official series and let NDVI scale it by a
// lote/district ratio -- fails the same way, only less visibly: that ratio
// comes out at 2.36 for 2022/23. It does not correct the error, it absorbs
// it, and precisely in the campaign that sets the limit. Its median moves
// the limit 3.7 pct against a CV of 0.44, so it is noise.
//
// So NDVI stops multiplying anything. The worst year is the official worst
// year, a figure a committee can look up. NDVI answers a narrower question
// it is good at: is this lote representative of the district whose yield we
// are borrowing? One parameter, robust to the 2022/23 outlier by
// construction, gating the rule instead of scaling it.
//
// capacidad-v1 is kept, not deleted: the measured reason not to read yield
// off the satellite is part of the evidence a committee will ask for.
export const CAPACITY_V2_RULE_VERSION = "capacidad-v2";

// A lote tracking its district sits near 1. Outside this band the district
// yield is not a fair proxy and the limit is held back rather than borrowed.
const REPRESENTATIVE_BAND = { min: 0.85, max: 1.15 };
const MIN_PAIRED_CAMPAIGNS = 5;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sampleCv(values) {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return null;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  return round(Math.sqrt(variance) / mean, 4);
}

/** Peak NDVI per campaign out of data/lote-history.json, gaps included as null. */
export function peaksFromHistory(history) {
  return (history?.campaigns ?? []).map((c) => ({
    campana: c.campaign ?? c.campana ?? null,
    // Prefer the full-precision median over the rounded peak.ndvi.
    ndvi_peak: c.peak?.ndvi_stats?.median ?? c.peak?.ndvi ?? c.ndvi_peak ?? null,
    date: c.peak?.date ?? c.date ?? null,
    rain_dec_feb_mm: c.rain_dec_feb_mm ?? null,
  }));
}

/** Official departmental yield in kg/ha per campaign, out of data/rindes-oficiales.json. */
export function officialByCampaign(official) {
  const out = new Map();
  for (const c of official?.campaigns ?? []) {
    out.set(c.campana ?? c.campaign, c.rinde_dpto_kg_ha ?? null);
  }
  return out;
}

/**
 * @param {object} history data/lote-history.json
 * @param {{ ha: number, price_usd_t: number, haircut: number, fx_ars_per_usd?: number }} econ
 * @param {object} official data/rindes-oficiales.json
 */
export function capacityFromOfficial(history, econ, official) {
  const peaks = peaksFromHistory(history);
  const officialMap = officialByCampaign(official);

  const officialValues = [...officialMap.values()].filter((v) => v !== null);
  const ndviValues = peaks.map((p) => p.ndvi_peak).filter((v) => v !== null);
  const medianOfficial = median(officialValues);
  const medianNdvi = median(ndviValues);

  const campaigns = officialMap.size ? [...officialMap.keys()] : peaks.map((p) => p.campana);
  const series = campaigns.map((campana) => {
    const peak = peaks.find((p) => p.campana === campana) ?? null;
    const officialYield = officialMap.get(campana) ?? null;
    const paired = officialYield !== null && peak?.ndvi_peak != null;
    const ndviIndex = paired ? round(peak.ndvi_peak / medianNdvi, 4) : null;
    const officialIndex = paired ? round(officialYield / medianOfficial, 4) : null;
    return {
      campana,
      official_dpto_kg_ha: officialYield,
      ndvi_peak: peak?.ndvi_peak ?? null,
      ndvi_index: ndviIndex,
      official_index: officialIndex,
      lote_vs_district: paired && officialIndex !== 0 ? round(ndviIndex / officialIndex, 4) : null,
      status: paired ? "paired" : "unpaired",
    };
  });

  const ratios = series.map((s) => s.lote_vs_district).filter((v) => v !== null);
  const kMedian = ratios.length ? round(median(ratios), 4) : null;

  const withOfficial = series.filter((s) => s.official_dpto_kg_ha !== null);
  const worst = withOfficial.length
    ? withOfficial.reduce((a, b) => (b.official_dpto_kg_ha < a.official_dpto_kg_ha ? b : a))
    : null;

  const reasons = [];
  if (!official) reasons.push("no official yield series supplied");
  if (ratios.length < MIN_PAIRED_CAMPAIGNS) {
    reasons.push(`only ${ratios.length} paired campaigns, need ${MIN_PAIRED_CAMPAIGNS}`);
  }
  if (kMedian !== null && (kMedian < REPRESENTATIVE_BAND.min || kMedian > REPRESENTATIVE_BAND.max)) {
    reasons.push(
      `lote does not track its district (median ratio ${kMedian}, band ${REPRESENTATIVE_BAND.min}-${REPRESENTATIVE_BAND.max})`,
    );
  }
  if (!worst) reasons.push("no official campaign to set the worst year");

  const representative = reasons.length === 0;
  const worstYieldTHa = worst ? round(worst.official_dpto_kg_ha / 1000, 3) : null;
  const limitUsd = worstYieldTHa === null
    ? null
    : round(econ.ha * worstYieldTHa * econ.price_usd_t * econ.haircut, 0);
  const fx = econ.fx_ars_per_usd ?? null;

  return {
    rule_version: CAPACITY_V2_RULE_VERSION,
    series,
    worst_year: worst
      ? {
          campana: worst.campana,
          official_dpto_kg_ha: worst.official_dpto_kg_ha,
          yield_t_ha: worstYieldTHa,
          source: "measured",
          basis: "minimum of the official departmental series -- a published figure, not an estimate",
        }
      : null,
    district_volatility: {
      cv: sampleCv(officialValues),
      basis: "sample stdev / mean of the official departmental yields",
      note: "how hard this district swings between campaigns; the limit is set at its floor, not its average",
    },
    representativeness: {
      representative,
      lote_vs_district_median: kMedian,
      lote_vs_district_cv: sampleCv(ratios),
      band: REPRESENTATIVE_BAND,
      paired_campaigns: ratios.length,
      reasons,
      basis:
        "median of per-campaign NDVI index over official index; median, not mean, because 2022/23 is an outlier by construction (NDVI held while yield collapsed)",
      note:
        "this ratio GATES the rule, it never scales it -- its own dispersion is too high to multiply a limit by",
    },
    pre_sowing_limit: {
      usd: representative ? limitUsd : null,
      ars: representative && limitUsd !== null && fx !== null ? round(limitUsd * fx, 0) : null,
      usd_if_representative: limitUsd,
      status: representative ? "allowed" : "blocked_unrepresentative",
      formula: "ha * worst_official_yield_t_ha * price_usd_t * haircut",
      basis: "the worst year the DISTRICT actually had, as published; NDVI does not enter this arithmetic",
      note: representative
        ? "sized against the worst campaign on record for the district, with the lote confirmed to track it"
        : "withheld: the lote does not track its district closely enough to borrow its yield",
    },
    reference: {
      ha: econ.ha,
      price_usd_t: econ.price_usd_t,
      haircut: econ.haircut,
      fx_ars_per_usd: fx,
    },
  };
}
