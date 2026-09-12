// precrop-canon-v1: the canonical serialisation whose sha256 is anchored on-chain.
// Rules (see data/README.md and data/SOURCES.md):
//   1. Only the `payload` object is hashed.
//   2. Flat object of scalars: string | number | boolean | null. No nesting, no arrays.
//   3. Keys sorted by code point (ASCII), no whitespace, UTF-8.
//   4. Integral floats serialise as integers (100, never 100.0); -0 becomes 0.
//   5. Strings must be ASCII; numbers finite, at most 4 decimals, |x| < 1e6.
//   6. sha256, lowercase hex.
import { createHash } from "node:crypto";

export const CANON_VERSION = "precrop-canon-v1";
const KEY_RE = /^[a-z0-9_]+$/;

function checkScalar(key, value) {
  if (!KEY_RE.test(key)) throw new Error(`canon: key '${key}' must match ${KEY_RE}`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    // eslint-disable-next-line no-control-regex
    if (/[^\x20-\x7e]/.test(value)) throw new Error(`canon: value of '${key}' must be printable ASCII`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canon: value of '${key}' must be finite`);
    if (Math.abs(value) >= 1e6) throw new Error(`canon: |${key}| must be < 1e6`);
    const v = Object.is(value, -0) ? 0 : value;
    const s = String(v);
    if (s.includes("e")) throw new Error(`canon: '${key}' must not use exponent notation`);
    const decimals = s.includes(".") ? s.split(".")[1].length : 0;
    if (decimals > 4) throw new Error(`canon: '${key}' has more than 4 decimals`);
    return v;
  }
  throw new Error(`canon: value of '${key}' must be a scalar, got ${typeof value}`);
}

/** Canonical JSON string of a flat payload. */
export function canonicalize(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("canon: payload must be a plain object");
  }
  const keys = Object.keys(payload).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(checkScalar(k, payload[k]))}`);
  return `{${parts.join(",")}}`;
}

/** sha256 (lowercase hex) of the canonical payload. */
export function hashPayload(payload) {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

/** True when report.content_sha256 matches the hash of report.payload. */
export function verifyReport(report) {
  return hashPayload(report.payload) === report.content_sha256;
}
