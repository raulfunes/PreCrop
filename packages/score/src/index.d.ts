export type Light = "verde" | "amarillo" | "rojo";

export interface ScoreInputs {
  /** Published 3-decimal median NDVI, e.g. 0.782 */
  ndvi: number;
  /** Rain over the 7 days ending on the scene date, mm */
  rain_mm_7d: number;
  /** Weeds cover 0-100 (Vision output or pack fallback) */
  weeds_pct: number;
}

export interface ScoreResult {
  ndvi_norm: number;
  climate: number;
  score_exact: number;
  score: number;
  score_bp: number;
  light: Light;
}

export type Scalar = string | number | boolean | null;
export type Payload = Record<string, Scalar>;

export interface EvidenceReport {
  schema_version: number;
  pack_version: string;
  report_id: string;
  canonicalization: string;
  generated_at_utc: string;
  content_sha256: string;
  payload: Payload;
}

export const NDVI_FLOOR: number;
export const NDVI_CEILING: number;
export const WEIGHTS: { ndvi_norm: number; climate: number; weeds_pct: number };
export const THRESHOLDS: { verde_min: number; amarillo_min: number };
export const CLIMATE_TABLE: { max_mm: number | null; climate: number; label: string }[];
export const CANON_VERSION: string;

export function ndviNorm(ndvi: number): number;
export function climateFromRain(rainMm7d: number): number;
export function band(score: number): Light;
export function scoreBp(scoreExact: number): number;
export function computeScore(inputs: ScoreInputs): ScoreResult;
export function canonicalize(payload: Payload): string;
export function hashPayload(payload: Payload): string;
export function verifyReport(report: EvidenceReport): boolean;

export interface Economics {
  ha: number;
  yield_ref_t_ha: number;
  price_usd_t: number;
  haircut: number;
  fx_ars_per_usd?: number;
  benchmark_flat_pct?: number;
}

export interface Factor {
  name: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  source: string;
  input: Record<string, number>;
}

export interface AdvanceLimit {
  rule_version: string;
  condition_index: number;
  light: Light;
  production_estimate: { yield_t_ha: number; tons: number; value_usd: number; basis: string };
  advance_limit: {
    pct_of_reference_value: number;
    usd: number;
    ars: number | null;
    new_disbursements: "allowed" | "review" | "blocked";
    formula: string;
  };
  benchmark: { flat_pct: number; usd: number; note: string };
  reference: Economics & { reference_value_usd: number; fx_ars_per_usd: number | null };
}

export const ADVANCE_RULE_VERSION: string;
export function explainFactors(result: ScoreResult, inputs: ScoreInputs, sources?: Partial<Record<"ndvi" | "rain" | "weeds", string>>): Factor[];
export function advanceLimit(result: ScoreResult, econ: Economics): AdvanceLimit;

export interface HistoryCampaign {
  campana: string;
  ndvi_peak: number | null;
  ndvi_norm: number | null;
  rain_dec_feb_mm: number;
}
export interface LoteHistory {
  campaigns: HistoryCampaign[];
}
export interface OfficialCampaign {
  campana: string;
  rinde_dpto_kg_ha: number | null;
  rinde_prov_kg_ha: number | null;
}
export interface OfficialYields {
  campaigns: OfficialCampaign[];
}
export interface CapacitySeriesRow {
  campana: string;
  ndvi_peak: number | null;
  ndvi_norm: number | null;
  rain_dec_feb_mm: number | null;
  yield_est_t_ha: number | null;
  official_dpto_kg_ha: number | null;
  official_prov_kg_ha: number | null;
  status: "measured" | "gap";
}
export interface Capacity {
  rule_version: string;
  series: CapacitySeriesRow[];
  coverage: { campaigns_total: number; campaigns_measured: number; campaigns_with_gap: number };
  worst_year: {
    campana: string;
    yield_est_t_ha: number;
    ndvi_peak: number | null;
    official_dpto_kg_ha: number | null;
    basis: string;
  } | null;
  stability: { cv: number | null; basis: string; note: string };
  validation: {
    validated: boolean;
    worst_official_campana: string | null;
    worst_official_kg_ha: number | null;
    pearson_r: number | null;
    r2: number | null;
    min_r2: number;
    paired_campaigns: number;
    reasons: string[];
    basis: string;
  };
  pre_sowing_limit: {
    usd: number | null;
    ars: number | null;
    usd_if_validated: number | null;
    status: "allowed" | "blocked_unvalidated";
    formula: string;
    basis: string;
    note: string;
  };
  reference: Economics;
}

export const CAPACITY_RULE_VERSION: string;
export function capacityFromHistory(history: LoteHistory, econ: Economics, official?: OfficialYields | null): Capacity;

export interface CapacityV2SeriesRow {
  campana: string;
  official_dpto_kg_ha: number | null;
  ndvi_peak: number | null;
  ndvi_index: number | null;
  official_index: number | null;
  lote_vs_district: number | null;
  status: "paired" | "unpaired";
}
export interface CapacityV2 {
  rule_version: string;
  series: CapacityV2SeriesRow[];
  worst_year: {
    campana: string;
    official_dpto_kg_ha: number;
    yield_t_ha: number;
    source: string;
    basis: string;
  } | null;
  district_volatility: { cv: number | null; basis: string; note: string };
  representativeness: {
    representative: boolean;
    lote_vs_district_median: number | null;
    lote_vs_district_cv: number | null;
    band: { min: number; max: number };
    paired_campaigns: number;
    reasons: string[];
    basis: string;
    note: string;
  };
  pre_sowing_limit: {
    usd: number | null;
    ars: number | null;
    usd_if_representative: number | null;
    status: "allowed" | "blocked_unrepresentative";
    formula: string;
    basis: string;
    note: string;
  };
  reference: { ha: number; price_usd_t: number; haircut: number; fx_ars_per_usd: number | null };
}

export const CAPACITY_V2_RULE_VERSION: string;
export function capacityFromOfficial(history: LoteHistory, econ: Economics, official: OfficialYields): CapacityV2;

export interface AdvanceFloor {
  campana: string | null;
  yield_t_ha: number | null;
  source?: string;
  available: boolean;
}
export interface AdvanceLimitV2 {
  rule_version: string;
  condition_index: number;
  light: Light;
  floor: {
    campana: string | null;
    yield_t_ha: number | null;
    value_usd: number | null;
    source: string;
    available: boolean;
    basis: string;
  };
  advance_limit: {
    usd: number | null;
    ars: number | null;
    ceiling_usd: number | null;
    pct_of_ceiling: number;
    new_disbursements: "allowed" | "review" | "blocked" | "blocked_no_capacity";
    formula: string;
    note: string;
  };
  benchmark: { flat_pct: number; usd: number | null; note: string };
  reference: {
    ha: number;
    price_usd_t: number;
    haircut: number;
    fx_ars_per_usd: number | null;
    floor_value_usd: number | null;
  };
}

export const ADVANCE_V2_RULE_VERSION: string;
export function advanceLimitFromFloor(result: ScoreResult, econ: Economics, floor: AdvanceFloor | null): AdvanceLimitV2;
