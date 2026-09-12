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
export { CAPACITY_RULE_VERSION, capacityFromHistory } from "./capacity.js";
export { CAPACITY_V2_RULE_VERSION, capacityFromOfficial } from "./capacity.js";
