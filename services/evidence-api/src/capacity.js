// Pre-sowing capacity for the lote.
//
// The ACTIVE rule is capacidad-v2: the limit is sized against the worst year
// the district actually had, as published by MAGyP, and NDVI only gates
// whether this lote tracks its district closely enough to borrow that
// figure.
//
// capacidad-v1 -- estimating tons from peak NDVI -- is kept and reported
// alongside as a rejected alternative, not deleted. A committee asking "why
// not just read the yield off the satellite" deserves the measured answer:
// it put the worst year on the wrong campaign and explained r2 0.43 of the
// official variance. That contrast is part of the evidence.
//
// Mirrors evidence.js: the rules live in @precrop/score, this module only
// bridges the pack files to them. Nothing here is hashed or anchored on
// chain; canon.js requires a flat ASCII payload and these carry arrays.
import { capacityFromOfficial, capacityFromHistory, CAPACITY_V2_RULE_VERSION } from "@precrop/score";
import { economicsInputs } from "./pack.js";

export function buildCapacity(pack) {
  const econ = economicsInputs(pack.economics);
  const capacity = capacityFromOfficial(pack.history, econ, pack.official);
  const direct = capacityFromHistory(pack.history, econ, pack.official);

  return {
    pack_version: pack.pack_version,
    lote_id: pack.history.lote_id,
    rule_version: CAPACITY_V2_RULE_VERSION,
    capacity,
    rejected_alternative: {
      rule_version: direct.rule_version,
      approach: "estimate tons per campaign from peak NDVI, take the minimum",
      validated: direct.validation.validated,
      reasons: direct.validation.reasons,
      r2: direct.validation.r2,
      worst_year_estimated: direct.worst_year ? direct.worst_year.campana : null,
      worst_year_official: direct.validation.worst_official_campana,
      usd_it_would_have_published: direct.pre_sowing_limit.usd_if_validated,
      note:
        "kept as evidence of why the limit is not read off the satellite; this number was never published",
    },
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
      "MOCK/demo. Capacity sizes a pre-sowing advance against the worst campaign on record for the district. It is a transparent rule over published yields, not a yield model and not a credit score.",
  };
}
