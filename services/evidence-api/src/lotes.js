// Lot registry: the committed demo pack plus lots created live from a polygon.
// Every lot is a pack with the same shape loadPack() returns, so /score,
// /capacity, /report and /disburse work unchanged with ?lote=<id>.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./pack.js";
import { ringOf, bboxOf, centroidOf, areaHa, samplingPoints, departmentShares, officialSeriesForShares, buildHistory, buildPresets } from "./live.js";

const LOTES_DIR = join(DATA_DIR, "lotes");
const registry = new Map();

// Mock del armado de lotes (data/lotes-mock.json). Activo por defecto: construir un lote
// de verdad son ~5 s de red (Georef + MAGyP + siete campañas de NDVI) y en la demo eso es
// una pausa muerta. Con el mock, el historial y la serie oficial se clonan del lote demo y
// solo se recalcula lo que sale del poligono: superficie, centro, bbox y puntos.
// LOTES_MOCK=0 vuelve a construirlo con datos reales.
const lotesMock = JSON.parse(readFileSync(join(DATA_DIR, "lotes-mock.json"), "utf8"));
const lotesMockOn = process.env.LOTES_MOCK !== "0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/**
 * The demo lot goes through the same path as a live polygon: its department is
 * resolved from the centroid and the official series comes from the MAGyP CSV.
 * The committed data/rindes-oficiales.json stays as the offline fallback.
 */
export async function resolveDemoDepartment(pack) {
  const shares = await departmentShares(pack.points.points, pack.presets.center);
  const series = await officialSeriesForShares(shares);
  const entry = registry.get(pack.presets.lote_id);
  const committed = pack.official?.departamento ?? pack.official?.campaigns?.[0]?.departamento ?? null;
  entry.official = { ...series, lote_id: pack.presets.lote_id, committed_department: committed };
  entry.lote.departamento = series.departamento;
  entry.lote.departments = shares;
  entry.lote.provincia = shares[0].provincia;
  return { departamento: series.departamento, committed, worst: series.campaigns.filter((x) => x.rinde_dpto_kg_ha != null).reduce((a, b) => (b.rinde_dpto_kg_ha < a.rinde_dpto_kg_ha ? b : a)) };
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

  const pts = samplingPoints(ring);

  if (lotesMockOn) {
    const { min, max } = lotesMock.delay_ms;
    await sleep(min + Math.random() * (max - min));
    const name = input.name?.trim() || `Lote ${demo.official?.departamento ?? "demo"}`;
    const id = `${slug(name)}-${Date.now().toString(36).slice(-4)}`;
    const centerR = { lat: round5(centre.lat), lon: round5(centre.lon) };
    const saved = {
      // Lo unico que sale del poligono dibujado: superficie, centro, bbox y puntos.
      lote: {
        id, nombre: name, source: "mock (historial y serie oficial del lote demo)",
        departamento: demo.official?.departamento ?? demo.presets.lote_id,
        departments: [], provincia: demo.presets.provincia ?? null,
        ha, center: centerR, created_at_utc: new Date().toISOString(),
        mock: true, mock_note: lotesMock.department_note,
      },
      geometry: input.geometry,
      presets: { ...demo.presets, lote_id: id, nombre: name, ha, center: centerR, bbox: bbox.map(round5) },
      history: { ...demo.history, lote_id: id },
      official: { ...demo.official, lote_id: id },
      points: { ...demo.points, lote_id: id, points: pts },
    };
    mkdirSync(LOTES_DIR, { recursive: true });
    writeFileSync(join(LOTES_DIR, `${id}.json`), JSON.stringify(saved, null, 2) + "\n", "utf8");
    const pack = hydrate(saved, demo);
    registry.set(id, pack);
    onProgress({ step: "mock", lote_id: id, ha });
    return pack;
  }

  // El historial NDVI no necesita saber el departamento, asi que las dos cadenas van a la
  // vez: Georef -> MAGyP por un lado, Planetary Computer por el otro. El total pasa de ser
  // la suma a ser la mas lenta de las dos.
  onProgress({ step: "departamento" });
  const [{ shares, official }, history] = await Promise.all([
    (async () => {
      const shares = await departmentShares(pts, centre);
      onProgress({ step: "rindes oficiales", departamentos: shares });
      return { shares, official: await officialSeriesForShares(shares) };
    })(),
    (async () => {
      onProgress({ step: "historial" });
      return buildHistory(feature, bbox, centre, (row) => onProgress({ step: "historial", campaign: row.campaign, peak: row.peak?.ndvi ?? null }));
    })(),
  ]);

  const dept = shares[0];
  const name = input.name?.trim() || `Lote ${dept.departamento}`;
  const id = `${slug(name)}-${Date.now().toString(36).slice(-4)}`;
  official.lote_id = id;
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

  const points = { ...demo.points, lote_id: id, points: pts };
  const lote = { id, nombre: name, source: "live polygon", departamento: official.departamento, departments: shares, provincia: dept.provincia, ha, center: presets.center, created_at_utc: new Date().toISOString() };
  const saved = { lote, geometry: input.geometry, presets, history, official, points };
  mkdirSync(LOTES_DIR, { recursive: true });
  writeFileSync(join(LOTES_DIR, `${id}.json`), JSON.stringify(saved, null, 2) + "\n", "utf8");
  const pack = hydrate(saved, demo);
  registry.set(id, pack);
  return pack;
}

const round5 = (x) => Math.round(x * 1e5) / 1e5;
