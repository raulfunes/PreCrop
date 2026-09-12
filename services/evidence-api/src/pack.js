// Loads the data pack from disk once. DATA_DIR overrides the default ../../data.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(HERE, "..", "..", "..", "data"));

/** Files Front, Vision and Chain may fetch through GET /pack/<name>. */
export const PUBLIC_FILES = [
  "lote-sentinel-presets.json",
  "demo-scenarios.json",
  "photo-point-presets.json",
  "lote.geojson",
  "lote-economics.json",
  "lote-history.json",
  "rindes-oficiales.json",
  "evidence/bueno.json",
  "evidence/mixto.json",
  "evidence/malo.json",
];

const readJson = (name) => JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));

export function loadPack() {
  const presets = readJson("lote-sentinel-presets.json");
  const scenarios = readJson("demo-scenarios.json");
  const points = readJson("photo-point-presets.json");
  const economics = readJson("lote-economics.json");
  // Optional files: the per-campaign history (scripts/build_history.py) and the
  // official department yields (scripts/build_rindes_oficiales.py). The service
  // still boots without them -- /score falls back and /capacity answers 503 --
  // but when present they must agree on pack_version like everything else.
  const history = existsSync(join(DATA_DIR, "lote-history.json")) ? readJson("lote-history.json") : null;
  const official = existsSync(join(DATA_DIR, "rindes-oficiales.json")) ? readJson("rindes-oficiales.json") : null;
  const versions = new Set([
    presets.pack_version, scenarios.pack_version, points.pack_version, economics.pack_version,
    ...(history ? [history.pack_version] : []),
    ...(official ? [official.pack_version] : []),
  ]);
  if (versions.size !== 1) throw new Error(`pack_version mismatch across files: ${[...versions].join(", ")}`);
  return { presets, scenarios, points, economics, history, official, pack_version: presets.pack_version };
}

/** One row per campaign with a valid peak, in the shape capacity() expects. */
export function historyPeaks(history) {
  if (!history) return [];
  return history.campaigns
    .filter((c) => c.peak)
    .map((c) => ({
      campaign: c.campaign,
      date: c.peak.date,
      scene_id: c.peak.scene_id,
      ndvi: c.peak.ndvi,
      ndvi_min_in_window: c.scenes_evaluated.length ? Math.min(...c.scenes_evaluated.map((s) => s.median)) : null,
      rain_dec_feb_mm: c.rain_dec_feb_mm ?? null,
    }));

}

/** Flat numbers for the advance rule, read from lote-economics.json (each value carries its own source there). */
export function economicsInputs(economics) {
  return {
    ha: economics.ha,
    yield_ref_t_ha: economics.yield_ref_t_ha.value,
    price_usd_t: economics.price.usd_t,
    fx_ars_per_usd: economics.price.fx_ars_per_usd,
    haircut: economics.haircut.value,
    benchmark_flat_pct: economics.benchmark.flat_advance_pct,
  };
}

export function readPublicFile(name) {
  if (!PUBLIC_FILES.includes(name)) return null;
  const path = join(DATA_DIR, name);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
