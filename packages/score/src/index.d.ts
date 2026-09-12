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
