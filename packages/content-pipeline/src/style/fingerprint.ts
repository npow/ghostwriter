/**
 * @deprecated Use `@auto-blogger/style-fingerprint` directly instead.
 * This module is a thin compatibility shim that re-exports from the
 * standalone style-fingerprint package.
 */
export {
  analyzeStyleFingerprint,
  toStyleFingerprint,
  fromStyleFingerprint,
} from "@auto-blogger/style-fingerprint/compat";

export {
  analyzeStyle,
  formatStyleProfile,
  type StyleProfile,
} from "@auto-blogger/style-fingerprint";
