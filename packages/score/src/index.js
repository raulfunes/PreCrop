export {
  NDVI_FLOOR,
  NDVI_CEILING,
  WEIGHTS,
  THRESHOLDS,
  CLIMATE_TABLE,
  ndviNorm,
  climateFromRain,
  band,
  scoreBp,
  computeScore,
} from "./score.js";
export { CANON_VERSION, canonicalize, hashPayload, verifyReport } from "./canon.js";
export { ADVANCE_RULE_VERSION, explainFactors, advanceLimit } from "./advance.js";
export { ADVANCE_V2_RULE_VERSION, advanceLimitFromFloor } from "./advance.js";
export { CAPACITY_RULE_VERSION, capacity } from "./capacity.js";
export {
  CAPACITY_V2_RULE_VERSION,
  capacityFromOfficial,
  peaksFromHistory,
  officialByCampaign,
} from "./capacity.js";
