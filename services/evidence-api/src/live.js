// Live lot builder: from a GeoJSON polygon anywhere in Cordoba to a full pack
// (history, official yields, current-campaign scenarios) in ~20-40 s, with no
// raster download. NDVI statistics are computed server-side by Planetary
// Computer's data API over the polygon; rain from Open-Meteo; the department
// from the national Georef API; official yields from the MAGyP CSV (cached).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./pack.js";

const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const STATS_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
const OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive";
const GEOREF = "https://apis.datos.gob.ar/georef/api/ubicacion";
const MAGYP_CSV = "https://datos.magyp.gob.ar/dataset/8ae4865f-d2f2-45a2-9343-7a4a12728a90/resource/ba694aa3-99d2-4d7d-9936-60f88e36ad9a/download/soja-serie-1941-2024.csv";
const MAGYP_DATASET = "https://datos.magyp.gob.ar/dataset/soja-siembra-cosecha-produccion-rendimiento";
const CACHE_DIR = join(DATA_DIR, "cache");
const TZ = "America/Argentina/Cordoba";

export const HARVEST_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const MAX_CLOUD = 10;
const SCENES_PER_CAMPAIGN = 3;

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const campaignLabel = (y) => `${y - 1}/${String(y).slice(2)}`;
const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------------------------------------------------------------- geometry
export function ringOf(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates[0];
  if (geometry.type === "MultiPolygon") return geometry.coordinates[0][0];
  throw new Error("geometry must be a Polygon");
}

export function bboxOf(ring) {
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function centroidOf(ring) {
  // area-weighted centroid in lon/lat (fine at field scale)
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) { const b = bboxOf(ring); return { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 }; }
  return { lon: cx / (6 * a), lat: cy / (6 * a) };
}

export function areaHa(ring) {
  const lat0 = (centroidOf(ring).lat * Math.PI) / 180;
  const mx = 111320 * Math.cos(lat0), my = 110540;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    a += x0 * mx * (y1 * my) - x1 * mx * (y0 * my);
  }
  return round(Math.abs(a) / 2 / 10000, 1);
}

export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** P1..P5: centre plus four points inset 30 % from the bbox corners, nudged inside the polygon. */
export function samplingPoints(ring) {
  const [w, s, e, n] = bboxOf(ring);
  const c = centroidOf(ring);
  const candidates = [
    ["P3", "Centro", c.lat, c.lon],
    ["P1", "N-O", n - 0.3 * (n - s), w + 0.3 * (e - w)],
    ["P2", "N-E", n - 0.3 * (n - s), e - 0.3 * (e - w)],
    ["P4", "S-O", s + 0.3 * (n - s), w + 0.3 * (e - w)],
    ["P5", "S-E", s + 0.3 * (n - s), e - 0.3 * (e - w)],
  ];
  return candidates
    .map(([id, label, lat, lon]) => {
      let f = 0;
      while (!pointInRing(lon, lat, ring) && f < 8) { f++; lat = lat + (c.lat - lat) * 0.25; lon = lon + (c.lon - lon) * 0.25; }
      return { point_id: id, label, lat: round(lat, 5), lon: round(lon, 5) };
    })
    .sort((a, b) => a.point_id.localeCompare(b.point_id));
}

// ---------------------------------------------------------------- remote data
async function getJson(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

export async function searchScenes(bbox, start, end, maxCloud = MAX_CLOUD) {
  const body = {
    collections: ["sentinel-2-l2a"],
    bbox,
    datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
    query: { "eo:cloud_cover": { lt: maxCloud } },
    limit: 60,
  };
  const j = await getJson(STAC_SEARCH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const byDate = new Map();
  for (const f of j.features) {
    const date = f.properties.datetime.slice(0, 10);
    const item = { id: f.id, date, cloud: f.properties["eo:cloud_cover"] ?? 100, baseline: f.properties["s2:processing_baseline"] ?? "00.00" };
    const prev = byDate.get(date);
    if (!prev || item.cloud < prev.cloud) byDate.set(date, item);
  }
  return [...byDate.values()].sort((a, b) => a.cloud - b.cloud);
}

/** Offset-corrected NDVI statistics over the polygon, computed by Planetary Computer. */
export async function ndviStats(itemId, feature, baseline) {
  const offsetTerm = baseline >= "04.00" ? "-2000" : "";
  const params = new URLSearchParams({ collection: "sentinel-2-l2a", item: itemId, expression: `(B08-B04)/(B08+B04${offsetTerm})`, asset_as_band: "true" });
  params.append("p", "10"); params.append("p", "90");
  const j = await getJson(`${STATS_URL}?${params}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "FeatureCollection", features: [feature] }),
  });
  const stats = j.features[0].properties.statistics;
  const s = stats[Object.keys(stats)[0]];
  return { mean: round(s.mean, 4), median: round(s.median, 4), p10: round(s.percentile_10 ?? s.min, 4), p90: round(s.percentile_90 ?? s.max, 4), n_pixels: Math.round(s.count), offset_applied: offsetTerm ? -1000 : 0 };
}

export async function rainSum(lat, lon, start, end) {
  const p = new URLSearchParams({ latitude: lat, longitude: lon, start_date: start, end_date: end, daily: "precipitation_sum", timezone: TZ });
  const j = await getJson(`${OPEN_METEO}?${p}`);
  return round(j.daily.precipitation_sum.reduce((a, v) => a + (v ?? 0), 0), 1);
}

export function window7d(date) {
  const d = new Date(date + "T00:00:00Z");
  const s = new Date(d); s.setUTCDate(d.getUTCDate() - 6);
  return { start: s.toISOString().slice(0, 10), end: date };
}

export async function departmentFor(lat, lon) {
  const j = await getJson(`${GEOREF}?lat=${lat}&lon=${lon}`);
  const u = j.ubicacion;
  return { departamento: u.departamento?.nombre ?? null, departamento_id: u.departamento?.id ?? null, provincia: u.provincia?.nombre ?? null };
}

/**
 * Department shares of a lot, estimated from the centroid plus the sampling
 * points (six probes). A lot on a boundary comes back as two departments with
 * their share; a lot inside one department comes back as a single 100 % row.
 */
export async function departmentShares(points, centre) {
  const probes = [centre, ...points.map((p) => ({ lat: p.lat, lon: p.lon }))];
  const found = await Promise.all(probes.map((p) => departmentFor(p.lat, p.lon).catch(() => null)));
  const counts = new Map();
  for (const d of found) {
    if (!d?.departamento) continue;
    const prev = counts.get(d.departamento);
    counts.set(d.departamento, { ...d, n: (prev?.n ?? 0) + 1 });
  }
  const total = [...counts.values()].reduce((a, d) => a + d.n, 0);
  if (!total) throw new Error("could not resolve the department for the polygon");
  return [...counts.values()]
    .map((d) => ({ departamento: d.departamento, departamento_id: d.departamento_id, provincia: d.provincia, share: round(d.n / total, 2), probes: d.n }))
    .sort((a, b) => b.share - a.share);
}

/** Official series for a lot: one department, or the share-weighted blend when the lot straddles a boundary. */
export async function officialSeriesForShares(shares) {
  const series = await Promise.all(shares.map((s) => officialSeries(s.provincia, s.departamento)));
  if (shares.length === 1) return { ...series[0], departments: shares };
  const campaigns = series[0].campaigns.map((row, i) => {
    let acc = 0, w = 0, prov = null;
    shares.forEach((s, k) => {
      const v = series[k].campaigns[i].rinde_dpto_kg_ha;
      if (v != null) { acc += v * s.share; w += s.share; }
      prov = series[k].campaigns[i].rinde_prov_kg_ha ?? prov;
    });
    return { campana: row.campana, rinde_dpto_kg_ha: w ? round(acc / w, 1) : null, rinde_prov_kg_ha: prov };
  });
  return {
    ...series[0],
    departamento: shares.map((s) => `${s.departamento} ${Math.round(s.share * 100)} %`).join(" + "),
    departments: shares,
    campaigns,
    method_note: "the lot straddles a department boundary: shares estimated from the centroid and the five sampling points; the official series is the share-weighted blend of the departments' series",
  };
}

// ---------------------------------------------------------------- official yields (MAGyP CSV, cached)
let csvRows = null;

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const split = (line) => {
    const out = []; let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const header = split(lines[0]).map((h) => h.replace(/^﻿/, "").trim().toLowerCase());
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v.trim()])));
}

export async function loadMagypRows() {
  if (csvRows) return csvRows;
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, "soja-serie-magyp.csv");
  let text;
  if (existsSync(cached)) text = readFileSync(cached, "utf8");
  else {
    const r = await fetch(MAGYP_CSV);
    if (!r.ok) throw new Error(`MAGyP CSV ${r.status}`);
    text = (await r.text()).replace(/^﻿/, "");
    writeFileSync(cached, text, "utf8");
  }
  csvRows = parseCsv(text);
  return csvRows;
}

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const col = (row, names) => { for (const n of names) if (row[n] !== undefined) return row[n]; return undefined; };

/** { campaigns: [{ campana, rinde_dpto_kg_ha, rinde_prov_kg_ha }], source, license } for one department. */
export async function officialSeries(provincia, departamento) {
  const rows = await loadMagypRows();
  const prov = stripAccents(provincia).toLowerCase(), dpto = stripAccents(departamento).toLowerCase();
  const inProv = rows.filter((r) => stripAccents(col(r, ["provincia", "provincia_nombre"]) ?? "").toLowerCase() === prov);
  const campaigns = HARVEST_YEARS.map((y) => {
    const long = `${y - 1}/${y}`;
    const season = inProv.filter((r) => (col(r, ["campana", "campaña", "campania"]) ?? "") === long);
    const own = season.find((r) => stripAccents(col(r, ["departamento", "departamento_nombre"]) ?? "").toLowerCase() === dpto);
    const prodT = season.reduce((a, r) => a + (num(col(r, ["produccion_tm", "produccion"])) ?? 0), 0);
    const areaHa = season.reduce((a, r) => a + (num(col(r, ["superficie_cosechada_ha", "sup_cosechada"])) ?? 0), 0);
    return {
      campana: campaignLabel(y),
      rinde_dpto_kg_ha: own ? num(col(own, ["rendimiento_kgxha", "rendimiento"])) : null,
      rinde_prov_kg_ha: areaHa ? round((prodT / areaHa) * 1000, 1) : null,
    };
  });
  return { schema_version: 1, departamento, provincia, campaigns, source: "MAGyP, Estimaciones Agricolas, serie soja 1941-2024 (rendimiento_kgxha por departamento)", refs: [MAGYP_DATASET, MAGYP_CSV], license: "CC-BY 4.0" };
}

// ---------------------------------------------------------------- history + scenarios
export async function buildHistory(feature, bbox, centre, onProgress = () => {}) {
  // Las campañas son independientes entre si, asi que van en paralelo: antes eran ~35
  // requests en serie (7 campañas x busqueda + 3 escenas + lluvia) y el lote tardaba ~18 s.
  // Las escenas DENTRO de cada campaña siguen en serie a proposito, para no dispararle
  // 21 requests simultaneas a Planetary Computer y comerse un 429.
  const campaign = async (y) => {
    let start = `${y}-01-15`, end = `${y}-03-15`, widened = false;
    let items = await searchScenes(bbox, start, end);
    if (!items.length) { widened = true; start = `${y}-01-01`; end = `${y}-03-31`; items = await searchScenes(bbox, start, end); }
    const evaluated = [];
    for (const it of items.slice(0, SCENES_PER_CAMPAIGN)) {
      try {
        const st = await ndviStats(it.id, feature, it.baseline);
        evaluated.push({ date: it.date, scene_id: it.id, cloud_cover_pct: round(it.cloud, 4), processing_baseline: it.baseline, ...st });
      } catch (err) {
        evaluated.push({ date: it.date, scene_id: it.id, error: String(err.message).slice(0, 120) });
      }
    }
    const ok = evaluated.filter((s) => s.median !== undefined);
    const peak = ok.length ? ok.reduce((a, b) => (b.median > a.median ? b : a)) : null;
    const low = ok.length ? ok.reduce((a, b) => (b.median < a.median ? b : a)) : null;
    const row = { campaign: campaignLabel(y), harvest_year: y, window: { start, end, widened }, scenes_evaluated: evaluated, peak: null };
    if (peak) {
      row.peak = { date: peak.date, scene_id: peak.scene_id, cloud_cover_pct: peak.cloud_cover_pct, processing_baseline: peak.processing_baseline, ndvi_offset_applied: peak.offset_applied, ndvi: round(peak.median, 3), ndvi_stat: "median", ndvi_stats: { mean: peak.mean, median: peak.median, p10: peak.p10, p90: peak.p90, n_pixels: peak.n_pixels }, source: "measured" };
      row.min = { date: low.date, scene_id: low.scene_id, ndvi: round(low.median, 3), processing_baseline: low.processing_baseline, ndvi_stats: { mean: low.mean, median: low.median, p10: low.p10, p90: low.p90, n_pixels: low.n_pixels } };
      row.rain_dec_feb_mm = await rainSum(centre.lat, centre.lon, `${y - 1}-12-01`, `${y}-02-28`);
      row.rain_source = "measured";
    }
    onProgress(row);
    return row;
  };

  // Promise.all conserva el orden del array, no el de finalizacion: la serie sigue
  // ordenada por campaña aunque terminen desordenadas.
  const campaigns = await Promise.all(HARVEST_YEARS.map(campaign));
  return {
    schema_version: 1,
    generated_at_utc: new Date().toISOString().slice(0, 19) + "Z",
    method: {
      satellite: "Sentinel-2 L2A via Planetary Computer STAC; scene-level eo:cloud_cover < 10 %; one scene per date",
      ndvi: "computed server-side by Planetary Computer's statistics API over the polygon: (B08-B04)/(B08+B04-2000) for processing_baseline >= 04.00, (B08-B04)/(B08+B04) before; median over the polygon",
      peak: "max of the per-scene medians inside Jan 15 - Mar 15 (widened to Jan 1 - Mar 31 only when empty, flagged); min kept as the stress scene",
      rain: "Open-Meteo archive daily precipitation_sum at the polygon centroid; Dec 1 (previous year) .. Feb 28",
      caveat: "Up to three scenes per campaign. A cloudy February leaves a gap or a lower peak; gaps are shown, never filled.",
    },
    campaigns,
  };
}

/** presets in the shape of data/lote-sentinel-presets.json from the last campaign's peak (bueno) and minimum (malo). */
export async function buildPresets(history, centre, template) {
  const last = [...history.campaigns].reverse().find((c) => c.peak);
  if (!last) throw new Error("no campaign with a clean scene; cannot build scenarios");
  const mk = async (sc, label) => {
    const w = window7d(sc.date);
    const rain = await rainSum(centre.lat, centre.lon, w.start, w.end);
    return {
      label,
      date: sc.date,
      ndvi: round(sc.ndvi_stats.median, 3),
      ndvi_source: "measured",
      ndvi_stats: sc.ndvi_stats,
      rain_mm_7d: rain,
      rain_source: "measured",
      rain_window: w,
      rain_provider: "open-meteo archive",
      sentinel2: { collection: "sentinel-2-l2a", scene_id: sc.scene_id, cloud_cover_pct: sc.cloud_cover_pct ?? null, processing_baseline: sc.processing_baseline, stac: "https://planetarycomputer.microsoft.com/api/stac/v1" },
    };
  };
  const buena = await mk(last.peak, `Fecha buena - pico de la campana ${last.campaign}`);
  const mala = await mk(last.min, `Fecha mala - minimo de la campana ${last.campaign}`);
  return {
    ...template,
    presets: { fecha_buena: buena, fecha_mala: mala },
    aliases: { baseline: "fecha_buena", drought: "fecha_mala" },
    scenario_campaign: last.campaign,
  };
}
