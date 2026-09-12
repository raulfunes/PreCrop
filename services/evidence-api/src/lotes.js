// Lot registry: the committed demo pack plus lots created live from a polygon.
// Every lot is a pack with the same shape loadPack() returns, so /score,
// /capacity, /report and /disburse work unchanged with ?lote=<id>.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./pack.js";
import { ringOf, bboxOf, centroidOf, areaHa, samplingPoints, departmentFor, officialSeries, buildHistory, buildPresets } from "./live.js";

const LOTES_DIR = join(DATA_DIR, "lotes");
const registry = new Map();

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function registerDemo(pack) {
  registry.set(pack.presets.lote_id, { ...pack, lote: { id: pack.presets.lote_id, nombre: pack.presets.nombre, source: "committed pack", departamento: pack.official?.departamento ?? "Rio Segundo (declared)", ha: pack.presets.ha } });
  // lots built live in earlier runs
  if (existsSync(LOTES_DIR)) {
    for (const f of readdirSync(LOTES_DIR).filter((n) => n.endsWith(".json"))) {
      try {
        const saved = JSON.parse(readFileSync(join(LOTES_DIR, f), "utf8"));
        registry.set(saved.lote.id, hydrate(saved, pack));
      } catch { /* ignore broken file */ }
    }
  }
}

export function getLot(id, fallbackId) {
  return registry.get(id ?? fallbackId) ?? null;
}

export function listLots() {
  return [...registry.values()].map((p) => ({ ...p.lote, pack_version: p.pack_version, scenario_campaign: p.presets.scenario_campaign ?? "2024/25" }));
}

function hydrate(saved, demo) {
  // saved = { lote, presets, history, official, points, geometry }
  return {
    presets: saved.presets,
    scenarios: demo.scenarios,
    points: saved.points,
    economics: { ...demo.economics, ha: saved.lote.ha },
    history: saved.history,
    official: saved.official,
    pack_version: demo.pack_version,
    lote: saved.lote,
    geometry: saved.geometry,
  };
}

/**
 * Build a lot live from a polygon. ~20-40 s (network bound).
 * @param {{ name?: string, geometry: object }} input GeoJSON Polygon
 * @param {object} demo the committed pack (templates for economics/scenarios/points)
 */
export async function createLot(input, demo, onProgress = () => {}) {
  if (!input?.geometry) throw new Error("geometry (GeoJSON Polygon) is required");
  const ring = ringOf(input.geometry);
  if (ring.length < 4) throw new Error("polygon needs at least 3 vertices");
  const bbox = bboxOf(ring);
  const centre = centroidOf(ring);
  const ha = areaHa(ring);
  if (ha < 5 || ha > 2000) throw new Error(`polygon area ${ha} ha is outside 5-2000 ha`);
  const feature = { type: "Feature", properties: {}, geometry: input.geometry };

  onProgress({ step: "departamento" });
  const dept = await departmentFor(centre.lat, centre.lon);
  if (!dept.departamento) throw new Error("could not resolve the department for the polygon centroid");
  const name = input.name?.trim() || `Lote ${dept.departamento}`;
  const id = `${slug(name)}-${Date.now().toString(36).slice(-4)}`;

  onProgress({ step: "rindes oficiales", departamento: dept.departamento });
  const official = await officialSeries(dept.provincia, dept.departamento);
  official.lote_id = id;

  onProgress({ step: "historial" });
  const history = await buildHistory(feature, bbox, centre, (row) => onProgress({ step: "historial", campaign: row.campaign, peak: row.peak?.ndvi ?? null }));
  history.lote_id = id;

  onProgress({ step: "escenarios" });
  const presets = await buildPresets(history, centre, {
    schema_version: demo.presets.schema_version,
    pack_version: demo.pack_version,
    lote_id: id,
    nombre: name,
    ha,
    cultivo: "soja",
    center: { lat: round5(centre.lat), lon: round5(centre.lon) },
    bbox: bbox.map(round5),
    normalization: demo.presets.normalization,
    climate_table: demo.presets.climate_table,
    ndvi_method: demo.presets.ndvi_method,
    ndvi_published_stat: "median",
  });

  const points = { ...demo.points, lote_id: id, points: samplingPoints(ring) };
  const lote = { id, nombre: name, source: "live polygon", departamento: dept.departamento, departamento_id: dept.departamento_id, provincia: dept.provincia, ha, center: presets.center, created_at_utc: new Date().toISOString() };
  const saved = { lote, geometry: input.geometry, presets, history, official, points };
  mkdirSync(LOTES_DIR, { recursive: true });
  writeFileSync(join(LOTES_DIR, `${id}.json`), JSON.stringify(saved, null, 2) + "\n", "utf8");
  const pack = hydrate(saved, demo);
  registry.set(id, pack);
  return pack;
}

const round5 = (x) => Math.round(x * 1e5) / 1e5;
