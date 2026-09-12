// Pre-sowing capacity for the lote: the series, the worst year, and the
// limit -- when the estimator has earned the right to publish one.
//
// Mirrors evidence.js: the rule lives in @precrop/score, this module only
// bridges the pack files to it. Nothing here is hashed or anchored on
// chain; canon.js requires a flat ASCII payload and the series is an array.
import { capacityFromHistory, CAPACITY_RULE_VERSION } from "@precrop/score";
import { economicsInputs } from "./pack.js";

export function buildCapacity(pack) {
  const capacity = capacityFromHistory(pack.history, economicsInputs(pack.economics), pack.official);
  return {
    pack_version: pack.pack_version,
    lote_id: pack.history.lote_id,
    rule_version: CAPACITY_RULE_VERSION,
    capacity,
    sources: {
      history: {
        refs: pack.history.method?.refs ?? [],
        ndvi_stat: pack.history.method?.ndvi_stat ?? null,
        generated_at_utc: pack.history.generated_at_utc ?? null,
      },
      official: {
        refs: pack.official.method?.refs ?? [],
        license: pack.official.license ?? null,
        generated_at_utc: pack.official.generated_at_utc ?? null,
      },
    },
    disclaimer:
      "MOCK/demo. Capacity sizes a pre-sowing advance against the worst year this lote already had. It is a transparent linear rule over NDVI, not a calibrated yield model and not a credit score.",
  };
}
