// Builds the evidence payload for a scenario exactly like scripts/build_pack.py,
// so that with the pinned inputs the hash equals data/evidence/<scenario>.json.
import { computeScore, hashPayload, CANON_VERSION } from "@precrop/score";

const NDVI_METHOD = "BOA=(DN-1000)/10000; NDVI=(B08-B04)/(B08+B04)";
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** "S2B_MSIL2A_20250202T140709_..." -> "2025-02-02T14:07:09Z" */
export function timestampFromSceneId(sceneId) {
  const m = /_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})_/.exec(sceneId);
  if (!m) throw new Error(`cannot parse timestamp from scene_id ${sceneId}`);
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/**
 * @param {string} scenarioKey bueno | mixto | malo
 * @param {{presets: object, scenarios: object, points: object}} pack
 * @param {{ weeds_pct?: number, weeds_source?: string }} [override] live Vision value
 */
export function buildEvidence(scenarioKey, pack, override = {}) {
  const sc = pack.scenarios.scenarios[scenarioKey];
  if (!sc) throw new Error(`unknown scenario '${scenarioKey}'`);
  const sat = pack.presets.presets[sc.satellite_preset];
  const pinnedWeeds = pack.points.scenarios[scenarioKey].weeds_pct_lote;
  const weeds = override.weeds_pct ?? pinnedWeeds;
  const weedsSource = override.weeds_pct === undefined ? "simulated" : (override.weeds_source ?? "estimated");

  const inputs = { ndvi: sat.ndvi, rain_mm_7d: sat.rain_mm_7d, weeds_pct: weeds };
  const r = computeScore(inputs);
  const st = sat.ndvi_stats;
  const s2 = sat.sentinel2;

  const payload = {
    cloud_cover_pct: round(s2.cloud_cover_pct, 4),
    climate: r.climate,
    collection: s2.collection,
    evidence_timestamp_utc: timestampFromSceneId(s2.scene_id),
    light: r.light,
    lote_id: pack.presets.lote_id,
    ndvi: sat.ndvi,
    ndvi_mean: round(st.mean, 3),
    ndvi_method: NDVI_METHOD,
    ndvi_p10: round(st.p10, 3),
    ndvi_p90: round(st.p90, 3),
    ndvi_norm: r.ndvi_norm,
    ndvi_source: sat.ndvi_source ?? "measured",
    ndvi_stat: "median",
    n_pixels: st.n_pixels,
    observed_date: sat.date,
    processing_baseline: s2.processing_baseline,
    rain_mm_7d: sat.rain_mm_7d,
    rain_source: sat.rain_source ?? "measured",
    rain_window_end: sat.rain_window.end,
    rain_window_start: sat.rain_window.start,
    scenario: scenarioKey,
    scene_id: s2.scene_id,
    score: r.score_exact,
    score_bp: r.score_bp,
    score_source: "computed_from_published_formula",
    weeds_pct: weeds,
    weeds_source: weedsSource,
  };

  return {
    scenario: scenarioKey,
    inputs,
    result: r,
    evidence: {
      canonicalization: CANON_VERSION,
      pack_version: pack.pack_version,
      content_sha256: hashPayload(payload),
      payload,
    },
  };
}

/** Text anchored on-chain. Fixed field order, pipe separated. */
export function memoText(evidence) {
  const p = evidence.payload;
  return [CANON_VERSION, p.lote_id, p.scenario, p.score_bp, p.evidence_timestamp_utc, evidence.content_sha256].join("|");
}
