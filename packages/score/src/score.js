// PreCrop score formula. Mirrors scripts/build_pack.py exactly; both are
// locked to the published pack metadata by tests (tests/test_pack.py in
// Python, test/golden.test.js here).

/** Fixed agronomic anchors for soy (see data/lote-sentinel-presets.json normalization). */
export const NDVI_FLOOR = 0.2;
export const NDVI_CEILING = 0.85;

/** Weights published in data/demo-scenarios.json scoring.weights. */
export const WEIGHTS = { ndvi_norm: 0.6, climate: 0.25, weeds_pct: -0.15 };

/** Thresholds published in data/demo-scenarios.json scoring.thresholds. */
export const THRESHOLDS = { verde_min: 70, amarillo_min: 50 };

/**
 * climate_table from data/lote-sentinel-presets.json. Strict less-than:
 * the FIRST rule where rain_mm_7d < max_mm wins; max_mm null is the else.
 */
export const CLIMATE_TABLE = [
  { max_mm: 5, climate: 25, label: "sequia" },
  { max_mm: 15, climate: 45, label: "seco" },
  { max_mm: 25, climate: 70, label: "aceptable" },
  { max_mm: 50, climate: 90, label: "optimo" },
  { max_mm: 80, climate: 85, label: "humedo" },
  { max_mm: null, climate: 60, label: "exceso" },
];

const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Round half away from zero to `d` decimals, matching Python round() for non-tie values. */
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** @param {number} ndvi published 3-decimal median NDVI */
export function ndviNorm(ndvi) {
  return clip(((ndvi - NDVI_FLOOR) / (NDVI_CEILING - NDVI_FLOOR)) * 100, 0, 100);
}

/** @param {number} rainMm7d */
export function climateFromRain(rainMm7d) {
  for (const rule of CLIMATE_TABLE) {
    if (rule.max_mm === null || rainMm7d < rule.max_mm) return rule.climate;
  }
  throw new Error("climate_table has no else rule");
}

/** @param {number} score */
export function band(score) {
  if (score >= THRESHOLDS.verde_min) return "verde";
  if (score >= THRESHOLDS.amarillo_min) return "amarillo";
  return "rojo";
}

/** Half-up integer basis points: floor(score * 100 + 0.5). Same in Python and JS. */
export function scoreBp(scoreExact) {
  return Math.floor(scoreExact * 100 + 0.5);
}

/**
 * Compute the score from raw inputs.
 * @param {{ ndvi: number, rain_mm_7d: number, weeds_pct: number }} inputs
 * @returns {{ ndvi_norm: number, climate: number, score_exact: number, score: number, score_bp: number, light: string }}
 */
export function computeScore({ ndvi, rain_mm_7d, weeds_pct }) {
  for (const [k, v] of Object.entries({ ndvi, rain_mm_7d, weeds_pct })) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError(`${k} must be a finite number`);
  }
  const n = round(ndviNorm(ndvi), 4);
  const c = climateFromRain(rain_mm_7d);
  const raw = WEIGHTS.ndvi_norm * n + WEIGHTS.climate * c + WEIGHTS.weeds_pct * weeds_pct;
  const scoreExact = round(raw, 4);
  return {
    ndvi_norm: n,
    climate: c,
    score_exact: scoreExact,
    score: round(scoreExact, 1),
    score_bp: scoreBp(scoreExact),
    light: band(scoreExact),
  };
}
