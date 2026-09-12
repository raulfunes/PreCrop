// capacidad-v1 against the committed pack: the rule must reproduce the
// history file, and -- more importantly -- must REFUSE to publish a limit
// it cannot back with the official yield series.
//
// Expected values live in data/lote-history.json and data/rindes-oficiales.json,
// not hardcoded here, so a refetch that moves the series moves the test with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { capacityFromHistory, capacityFromOfficial, CAPACITY_RULE_VERSION, ndviNorm } from "../src/index.js";

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

test("rule version is stamped on the output and on the history file", () => {
  const capacity = capacityFromHistory(history, econ, official);
  assert.equal(capacity.rule_version, CAPACITY_RULE_VERSION);
  assert.equal(history.rule_version, CAPACITY_RULE_VERSION);
});

for (const campaign of history.campaigns) {
  test(`campaign ${campaign.campana} reproduces its normalised NDVI`, () => {
    const capacity = capacityFromHistory(history, econ, official);
    const row = capacity.series.find((s) => s.campana === campaign.campana);
    assert.ok(row, "campaign must appear in the series");

    if (campaign.ndvi_peak === null) {
      assert.equal(row.status, "gap");
      assert.equal(row.yield_est_t_ha, null);
      return;
    }
    assert.equal(row.status, "measured");
    // The rule recomputes ndvi_norm and rounds it to 4 decimals like the
    // rest of the pack, so compare at that precision, not at float epsilon.
    assert.ok(Math.abs(row.ndvi_norm - ndviNorm(campaign.ndvi_peak)) < 1e-4);
    assert.ok(Math.abs(row.ndvi_norm - campaign.ndvi_norm) < 0.01);
    assert.equal(row.yield_est_t_ha, Math.round(econ.yield_ref_t_ha * (row.ndvi_norm / 100) * 100) / 100);
  });
}

test("worst year is the minimum of the measured series", () => {
  const capacity = capacityFromHistory(history, econ, official);
  const measured = capacity.series.filter((s) => s.status === "measured");
  const minimum = Math.min(...measured.map((s) => s.yield_est_t_ha));
  assert.equal(capacity.worst_year.yield_est_t_ha, minimum);
});

test("a gap never becomes a zero worst year", () => {
  const withGap = {
    campaigns: [
      { campana: "2018/19", ndvi_peak: 0.70, ndvi_norm: 76.92, rain_dec_feb_mm: 400 },
      { campana: "2019/20", ndvi_peak: null, ndvi_norm: null, rain_dec_feb_mm: 300 },
      { campana: "2020/21", ndvi_peak: 0.60, ndvi_norm: 61.54, rain_dec_feb_mm: 350 },
    ],
  };
  const capacity = capacityFromHistory(withGap, econ, null);
  assert.equal(capacity.coverage.campaigns_with_gap, 1);
  assert.ok(capacity.worst_year.yield_est_t_ha > 0, "gap must not sink the worst year to zero");
  assert.equal(capacity.worst_year.campana, "2020/21");
});

test("the committed series does NOT validate against official yields", () => {
  // This is the real state of the data, not a placeholder: peak NDVI puts
  // the worst year on a different campaign than the official series does.
  // If this test ever starts failing, the estimator changed -- check
  // whether it genuinely improved before relaxing anything.
  const capacity = capacityFromHistory(history, econ, official);
  assert.equal(capacity.validation.validated, false);
  assert.ok(capacity.validation.reasons.length > 0);
  assert.notEqual(capacity.worst_year.campana, capacity.validation.worst_official_campana);
});

test("an unvalidated limit is withheld, not zeroed", () => {
  const capacity = capacityFromHistory(history, econ, official);
  assert.equal(capacity.pre_sowing_limit.status, "blocked_unvalidated");
  assert.equal(capacity.pre_sowing_limit.usd, null);
  assert.equal(capacity.pre_sowing_limit.ars, null);
  // The number is still computed and exposed so the gap between "what the
  // rule would have said" and "what is backed" is visible, not hidden.
  assert.ok(capacity.pre_sowing_limit.usd_if_validated > 0);
});

test("a validated series does publish a limit", () => {
  // Synthetic series whose worst year matches the official worst year and
  // tracks it closely -- proves the gate opens when the evidence is there.
  const synthetic = {
    campaigns: [
      { campana: "A", ndvi_peak: 0.85, ndvi_norm: 100, rain_dec_feb_mm: 500 },
      { campana: "B", ndvi_peak: 0.70, ndvi_norm: 76.92, rain_dec_feb_mm: 400 },
      { campana: "C", ndvi_peak: 0.55, ndvi_norm: 53.85, rain_dec_feb_mm: 300 },
      { campana: "D", ndvi_peak: 0.40, ndvi_norm: 30.77, rain_dec_feb_mm: 200 },
    ],
  };
  const syntheticOfficial = {
    campaigns: [
      { campana: "A", rinde_dpto_kg_ha: 3600, rinde_prov_kg_ha: 3500 },
      { campana: "B", rinde_dpto_kg_ha: 2800, rinde_prov_kg_ha: 2700 },
      { campana: "C", rinde_dpto_kg_ha: 2000, rinde_prov_kg_ha: 1900 },
      { campana: "D", rinde_dpto_kg_ha: 1100, rinde_prov_kg_ha: 1000 },
    ],
  };
  const capacity = capacityFromHistory(synthetic, econ, syntheticOfficial);
  assert.equal(capacity.validation.validated, true, capacity.validation.reasons.join("; "));
  assert.equal(capacity.worst_year.campana, "D");
  assert.equal(capacity.pre_sowing_limit.status, "allowed");
  assert.ok(capacity.pre_sowing_limit.usd > 0);
  // ha * worst yield * price * haircut
  const expected = Math.round(econ.ha * capacity.worst_year.yield_est_t_ha * econ.price_usd_t * econ.haircut);
  assert.equal(capacity.pre_sowing_limit.usd, expected);
});

test("stability is reported as a coefficient of variation", () => {
  const capacity = capacityFromHistory(history, econ, official);
  assert.ok(capacity.stability.cv > 0 && capacity.stability.cv < 1);
});

test("without an official series the limit is never published", () => {
  const capacity = capacityFromHistory(history, econ, null);
  assert.equal(capacity.validation.validated, false);
  assert.equal(capacity.pre_sowing_limit.usd, null);
  assert.ok(capacity.validation.reasons.some((r) => r.includes("no official")));
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

test("v2 publishes a limit where v1 withheld one", () => {
  const v2 = capacityFromOfficial(history, econ, official);
  const v1 = capacityFromHistory(history, econ, official);
  assert.equal(v1.pre_sowing_limit.usd, null);
  assert.equal(v2.pre_sowing_limit.status, "allowed");
  assert.ok(v2.pre_sowing_limit.usd > 0);
  // And it is far below what the NDVI estimator would have published.
  assert.ok(v2.pre_sowing_limit.usd < v1.pre_sowing_limit.usd_if_validated / 2);
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
  assert.ok(drought.lote_vs_district > 2, "the outlier must stay visible in the series");
  assert.ok(capacity.representativeness.lote_vs_district_cv > 0.3, "dispersion is real");
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
