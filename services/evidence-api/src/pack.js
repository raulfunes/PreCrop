// Loads the data pack from disk once. DATA_DIR overrides the default ../../data.
import { readFileSync } from "node:fs";
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
  const versions = new Set([presets.pack_version, scenarios.pack_version, points.pack_version, economics.pack_version]);
  if (versions.size !== 1) throw new Error(`pack_version mismatch across files: ${[...versions].join(", ")}`);
  return { presets, scenarios, points, economics, pack_version: presets.pack_version };
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
  return readFileSync(join(DATA_DIR, name), "utf8");
}
