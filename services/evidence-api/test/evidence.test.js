// The service must rebuild the committed evidence byte for byte from the pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPack, DATA_DIR } from "../src/pack.js";
import { buildEvidence, memoText } from "../src/evidence.js";

const pack = loadPack();

for (const key of ["bueno", "mixto", "malo"]) {
  test(`buildEvidence(${key}) equals data/evidence/${key}.json`, () => {
    const committed = JSON.parse(readFileSync(join(DATA_DIR, "evidence", `${key}.json`), "utf8"));
    const built = buildEvidence(key, pack);
    assert.deepEqual(built.evidence.payload, committed.payload);
    assert.equal(built.evidence.content_sha256, committed.content_sha256);
    assert.match(memoText(built.evidence), /^precrop-canon-v1\|demo-rio-segundo-01\|\w+\|\d+\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\|[0-9a-f]{64}$/);
  });
}

test("live weeds override changes score, band and hash, and is labelled estimated", () => {
  const live = buildEvidence("bueno", pack, { weeds_pct: 60 });
  const pinned = buildEvidence("bueno", pack);
  assert.equal(live.evidence.payload.weeds_source, "estimated");
  assert.notEqual(live.evidence.content_sha256, pinned.evidence.content_sha256);
  assert.equal(live.result.light, "amarillo");
});
