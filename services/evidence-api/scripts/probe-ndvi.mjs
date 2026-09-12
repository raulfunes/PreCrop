// Probe the NDVI median of candidate polygons on given dates (Planetary Computer statistics).
// Usage: node scripts/probe-ndvi.mjs 2025-02-02 2025-01-23
import { searchScenes, ndviStats, bboxOf } from "../src/live.js";

const dates = process.argv.slice(2);
if (!dates.length) { console.error("usage: node scripts/probe-ndvi.mjs <YYYY-MM-DD> [...]"); process.exit(1); }

const candidates = {
  v5: [[-63.7254, -31.4225], [-63.7235, -31.4245], [-63.7146, -31.4245], [-63.7146, -31.4155], [-63.7254, -31.4155], [-63.7254, -31.4225]],
  v6: [[-63.7254, -31.4245], [-63.7146, -31.4245], [-63.7146, -31.4175], [-63.7165, -31.4155], [-63.7254, -31.4155], [-63.7254, -31.4245]],
  v7: [[-63.7254, -31.4230], [-63.7240, -31.4245], [-63.7146, -31.4245], [-63.7146, -31.4170], [-63.7160, -31.4155], [-63.7254, -31.4155], [-63.7254, -31.4230]],
  v8: [[-63.7254, -31.4245], [-63.7146, -31.4238], [-63.7146, -31.4155], [-63.7254, -31.4160], [-63.7254, -31.4245]],
  v9: [[-63.7254, -31.4232], [-63.7238, -31.4245], [-63.7150, -31.4242], [-63.7146, -31.4180], [-63.7158, -31.4155], [-63.7250, -31.4157], [-63.7254, -31.4232]],
};

const bbox = bboxOf([[-63.7330, -31.4290], [-63.7100, -31.4110]]);
for (const date of dates) {
  const items = await searchScenes(bbox, date, date, 100);
  if (!items.length) { console.log(date, "sin escena"); continue; }
  const item = items[0];
  const baseline = item.baseline;
  console.log(`\n== ${date} item ${item.id} nubes ${item.cloud}`);
  for (const [name, ring] of Object.entries(candidates)) {
    const feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
    try {
      const s = await ndviStats(item.id, feature, baseline);
      console.log(name.padEnd(11), "median", s.median, "mean", s.mean, "p10", s.p10, "p90", s.p90, "px", s.n_pixels);
    } catch (e) {
      console.log(name.padEnd(11), "error", e.message);
    }
  }
}
