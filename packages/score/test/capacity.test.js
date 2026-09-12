// capacidad-v2 against the committed pack: the limit comes from the official
// series and NDVI only gates it. capacidad-v1 (the NDVI estimator) lives in
// the same module with a different signature and is covered by its contrast
// table in the service, not here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { capacityFromOfficial, peaksFromHistory } from "../src/index.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const read = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const history = read("lote-history.json");
const official = read("rindes-oficiales.json");
const economics = read("lote-economics.json");

const econ = {
  ha: economics.ha,
  yield_ref_t_ha: economics.yield_ref_t_ha.value,
  price_usd_t: economics.price.usd_t,
  haircut: economics.haircut.value,
  fx_ars_per_usd: economics.price.fx_ars_per_usd,
};

test("pack files share the pack_version the service validates", () => {
  assert.equal(history.pack_version, economics.pack_version);
  assert.equal(official.pack_version, economics.pack_version);
});

test("the history file is read at full median precision, not the rounded peak", () => {
  const peaks = peaksFromHistory(history);
  assert.equal(peaks.length, history.campaigns.length);
  for (const [i, p] of peaks.entries()) {
    const src = history.campaigns[i];
    if (src.peak) assert.equal(p.ndvi_peak, src.peak.ndvi_stats.median);
  }
});

// --- capacidad-v2: the limit rests on the official series ------------------

test("v2 takes its worst year from the official series, not from NDVI", () => {
  const capacity = capacityFromOfficial(history, econ, official);
  const officialWorst = official.campaigns
    .filter((c) => c.rinde_dpto_kg_ha !== null)
    .reduce((a, b) => (b.rinde_dpto_kg_ha < a.rinde_dpto_kg_ha ? b : a));
  assert.equal(capacity.worst_year.campana, officialWorst.campana);
  assert.equal(capacity.worst_year.official_dpto_kg_ha, officialWorst.rinde_dpto_kg_ha);
  assert.equal(capacity.worst_year.source, "measured");
});

test("v2 publishes a limit well below the NDVI estimator's", () => {
  const v2 = capacityFromOfficial(history, econ, official);
  assert.equal(v2.pre_sowing_limit.status, "allowed");
  assert.ok(v2.pre_sowing_limit.usd > 0);
  // The NDVI estimator would have sized this around 70k; the official floor
  // supports far less.
  assert.ok(v2.pre_sowing_limit.usd < 55000);
});

test("v2 limit is ha * worst official yield * price * haircut", () => {
  const capacity = capacityFromOfficial(history, econ, official);
  const expected = Math.round(
    econ.ha * capacity.worst_year.yield_t_ha * econ.price_usd_t * econ.haircut,
  );
  assert.equal(capacity.pre_sowing_limit.usd, expected);
});

test("the lote/district ratio gates but never scales the limit", () => {
  const capacity = capacityFromOfficial(history, econ, official);
  const k = capacity.representativeness.lote_vs_district_median;
  assert.ok(k >= capacity.representativeness.band.min);
  assert.ok(k <= capacity.representativeness.band.max);
  // The limit must not carry k as a factor: dividing it out changes nothing.
  const expected = Math.round(
    econ.ha * capacity.worst_year.yield_t_ha * econ.price_usd_t * econ.haircut,
  );
  assert.equal(capacity.pre_sowing_limit.usd, expected);
});

test("the 2022/23 ratio outlier is visible but does not move the median", () => {
  // NDVI held while yield collapsed, so this campaign's ratio is extreme.
  // It must still be reported -- and the median must shrug it off.
  const capacity = capacityFromOfficial(history, econ, official);
  const drought = capacity.series.find((s) => s.campana === "2022/23");
  assert.ok(drought.lote_vs_district > 1.5, "the outlier must stay visible in the series");
  assert.ok(capacity.representativeness.lote_vs_district_cv > 0.2, "dispersion is real");
  assert.ok(capacity.representativeness.lote_vs_district_median < 1.15);
});

test("a lote that does not track its district gets no limit", () => {
  // Same official series; NDVI that swings the opposite way, so the median
  // ratio falls outside the band.
  const divergent = {
    campaigns: official.campaigns.map((c, i) => ({
      campana: c.campana,
      ndvi_peak: i % 2 === 0 ? 0.40 : 0.88,
      ndvi_norm: null,
      rain_dec_feb_mm: 300,
    })),
  };
  const capacity = capacityFromOfficial(divergent, econ, official);
  assert.equal(capacity.representativeness.representative, false);
  assert.ok(capacity.representativeness.lote_vs_district_median > 1.15);
  assert.equal(capacity.pre_sowing_limit.usd, null);
  assert.equal(capacity.pre_sowing_limit.status, "blocked_unrepresentative");
  assert.ok(capacity.representativeness.reasons.some((r) => r.includes("does not track")));
  // The number stays visible so the gap is auditable, same as v1.
  assert.ok(capacity.pre_sowing_limit.usd_if_representative > 0);
});

test("too few paired campaigns blocks the limit", () => {
  const thin = { campaigns: [{ campana: "2022/23", ndvi_peak: 0.77, ndvi_norm: null, rain_dec_feb_mm: 370 }] };
  const capacity = capacityFromOfficial(thin, econ, official);
  assert.equal(capacity.representativeness.representative, false);
  assert.equal(capacity.pre_sowing_limit.usd, null);
  assert.ok(capacity.representativeness.reasons.some((r) => r.includes("paired campaigns")));
});
