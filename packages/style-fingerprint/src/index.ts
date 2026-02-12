// Public API
export { analyzeStyle, mergeStyleProfiles } from "./analyze.js";
export { formatStyleProfile, describeScale } from "./format.js";
export { fetchAndExtract, analyzeUrl } from "./scrape.js";
export {
  toStyleFingerprint,
  fromStyleFingerprint,
  analyzeStyleFingerprint,
} from "./compat.js";

// Types
export type {
  StyleProfile,
  StyleDimensions,
  StylePatterns,
  RawStyleMetrics,
  StyleFingerprint,
} from "./types.js";

export type { FormatMode } from "./format.js";
