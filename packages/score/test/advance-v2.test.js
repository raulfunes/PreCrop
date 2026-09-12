// cupo-v2: the advance draws against the ceiling capacity established from
// the official series, so condition and capacity cannot contradict each
// other. Weeds from Vision still move the number -- they now move a number
// with a floor behind it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeScore, advanceLimit, advanceLimitFromFloor,
  capacityFromOfficial, ADVANCE_V2_RULE_VERSION,
} from "../src/index.js";

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
  benchmark_flat_pct: economics.benchmark.flat_advance_pct,
};

const capacity = capacityFromOfficial(history, econ, official);
const floor = {
  campana: capacity.worst_year.campana,
  yield_t_ha: capacity.worst_year.yield_t_ha,
  source: capacity.worst_year.source,
  available: capacity.representativeness.representative,
};

const scoreWith = (weeds) => computeScore({ ndvi: 0.7741, rain_mm_7d: 20, weeds_pct: weeds });

test("the ceiling equals the pre-sowing limit capacity published", () => {
  const a = advanceLimitFromFloor(scoreWith(12), econ, floor);
  assert.equal(a.rule_version, ADVANCE_V2_RULE_VERSION);
  assert.equal(a.advance_limit.ceiling_usd, capacity.pre_sowing_limit.usd);
});

test("the advance never exceeds the ceiling", () => {
  for (const weeds of [0, 12, 40, 55, 65, 90]) {
    const a = advanceLimitFromFloor(scoreWith(weeds), econ, floor);
    assert.ok(a.advance_limit.usd <= a.advance_limit.ceiling_usd);
  }
});

test("v2 resolves the contradiction with cupo-v1", () => {
  const r = scoreWith(12);
  const v1 = advanceLimit(r, econ);
  const v2 = advanceLimitFromFloor(r, econ, floor);
  // v1 advanced well above what the district's worst year supports.
  assert.ok(v1.advance_limit.usd > capacity.pre_sowing_limit.usd);
  assert.ok(v2.advance_limit.usd <= capacity.pre_sowing_limit.usd);
});

test("weeds from Vision still move the limit", () => {
  const clean = advanceLimitFromFloor(scoreWith(12), econ, floor);
  const weedy = advanceLimitFromFloor(scoreWith(65), econ, floor);
  assert.ok(weedy.advance_limit.usd < clean.advance_limit.usd);
});

test("rojo blocks new disbursements with a measured zero", () => {
  const r = computeScore({ ndvi: 0.30, rain_mm_7d: 2, weeds_pct: 80 });
  assert.equal(r.light, "rojo");
  const a = advanceLimitFromFloor(r, econ, floor);
  assert.equal(a.advance_limit.new_disbursements, "blocked");
  assert.equal(a.advance_limit.usd, 0);
});

test("no capacity floor means null, not zero", () => {
  const a = advanceLimitFromFloor(scoreWith(12), econ, { campana: null, yield_t_ha: null, available: false });
  assert.equal(a.advance_limit.new_disbursements, "blocked_no_capacity");
  assert.equal(a.advance_limit.usd, null);
  assert.equal(a.advance_limit.ceiling_usd, null);
  assert.notEqual(a.advance_limit.usd, 0, "unknown floor must not read as a measured zero");
});

test("limit is ceiling times condition", () => {
  const r = scoreWith(40);
  const a = advanceLimitFromFloor(r, econ, floor);
  assert.equal(a.advance_limit.usd, Math.round(a.advance_limit.ceiling_usd * (r.score_exact / 100)));
});
