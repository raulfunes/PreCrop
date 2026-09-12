// Builds the evidence payload for a scenario exactly like scripts/build_pack.py,
// so that with the pinned inputs the hash equals data/evidence/<scenario>.json.
import {
  computeScore, hashPayload, CANON_VERSION, explainFactors,
  advanceLimit, advanceLimitFromFloor, capacityFromOfficial,
} from "@precrop/score";
import { economicsInputs } from "./pack.js";

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

  const sources = { ndvi: payload.ndvi_source, rain: payload.rain_source, weeds: weedsSource };
  const econ = pack.economics ? economicsInputs(pack.economics) : null;

  // The advance draws against the ceiling capacity established from the
  // official series, so the two rules cannot contradict each other. If
  // capacity could not establish a floor, the gate propagates and nothing
  // is published here either.
  const capacity = econ && pack.history && pack.official
    ? capacityFromOfficial(pack.history, econ, pack.official)
    : null;
  const floor = capacity
    ? {
        campana: capacity.worst_year?.campana ?? null,
        yield_t_ha: capacity.worst_year?.yield_t_ha ?? null,
        source: capacity.worst_year?.source ?? "unavailable",
        available: capacity.representativeness.representative && capacity.worst_year !== null,
      }
    : null;

  const advance = econ ? advanceLimitFromFloor(r, econ, floor) : null;
  // cupo-v1 kept visible, not deleted: it is the number the coop would have
  // advanced off a full-condition reference yield, and the gap against the
  // official floor is the point.
  const supersededAdvance = econ ? advanceLimit(r, econ) : null;

  return {
    scenario: scenarioKey,
    inputs,
    result: r,
    factors: explainFactors(r, inputs, sources),
    advance,
    superseded_advance: supersededAdvance && advance
      ? {
          rule_version: supersededAdvance.rule_version,
          usd: supersededAdvance.advance_limit.usd,
          basis: "yield_ref_t_ha at full condition, not anchored on the official floor",
          note: "superseded by cupo-v2; shown so the change in the number is auditable",
        }
      : null,
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
