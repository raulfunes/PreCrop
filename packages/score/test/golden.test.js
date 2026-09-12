// Golden tests: the JS implementation must reproduce the committed pack byte for byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { computeScore, hashPayload, verifyReport, canonicalize, WEIGHTS, THRESHOLDS, NDVI_FLOOR, NDVI_CEILING, CLIMATE_TABLE } from "../src/index.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const read = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const presets = read("lote-sentinel-presets.json");
const scenarios = read("demo-scenarios.json");
const points = read("photo-point-presets.json");

test("published scoring metadata equals the JS constants", () => {
  assert.deepEqual(scenarios.scoring.weights, WEIGHTS);
  assert.equal(scenarios.scoring.thresholds.verde_min, THRESHOLDS.verde_min);
  assert.equal(scenarios.scoring.thresholds.amarillo_min, THRESHOLDS.amarillo_min);
  assert.equal(presets.normalization.ndvi_norm.ndvi_floor, NDVI_FLOOR);
  assert.equal(presets.normalization.ndvi_norm.ndvi_ceiling, NDVI_CEILING);
  assert.deepEqual(
    presets.climate_table.rules.map((r) => [r.max_mm, r.climate]),
    CLIMATE_TABLE.map((r) => [r.max_mm, r.climate]),
  );
});

for (const key of ["bueno", "mixto", "malo"]) {
  test(`scenario ${key} reproduces expected score, band and score_bp`, () => {
    const sc = scenarios.scenarios[key];
    const sat = presets.presets[sc.satellite_preset];
    const weeds = points.scenarios[key].weeds_pct_lote;
    const r = computeScore({ ndvi: sat.ndvi, rain_mm_7d: sat.rain_mm_7d, weeds_pct: weeds });
    assert.equal(r.score, sc.expected_score);
    assert.equal(r.light, sc.expected_band);
    assert.equal(r.score_exact, sc.expected.score_exact);
    assert.equal(r.ndvi_norm, sc.expected.ndvi_norm);
    assert.equal(r.climate, sc.expected.climate_used);
    const ev = read(`evidence/${key}.json`);
    assert.equal(r.score_exact, ev.payload.score);
    assert.equal(r.score_bp, ev.payload.score_bp);
  });

  test(`evidence ${key} hash reproduces with precrop-canon-v1`, () => {
    const ev = read(`evidence/${key}.json`);
    assert.equal(hashPayload(ev.payload), ev.content_sha256);
    assert.ok(verifyReport(ev));
    assert.ok(!verifyReport({ ...ev, payload: { ...ev.payload, score_bp: ev.payload.score_bp + 1 } }));
  });
}

test("canon: integral floats and -0 serialise as integers, keys sorted", () => {
  assert.equal(canonicalize({ b: 100.0, a: 0.1, c: -0, d: "x" }), '{"a":0.1,"b":100,"c":0,"d":"x"}');
});

test("canon: rejects nesting, non-ascii and too many decimals", () => {
  assert.throws(() => canonicalize({ a: { b: 1 } }));
  assert.throws(() => canonicalize({ a: "sequía" }));
  assert.throws(() => canonicalize({ a: 0.12345 }));
  assert.throws(() => canonicalize({ "Bad-Key": 1 }));
});
