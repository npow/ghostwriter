/**
 * @deprecated Use `@ghostwriter/style-fingerprint` directly instead.
 * This module is a thin compatibility shim that re-exports from the
 * standalone style-fingerprint package.
 */
export {
  analyzeStyleFingerprint,
  toStyleFingerprint,
  fromStyleFingerprint,
} from "@ghostwriter/style-fingerprint/compat";

export {
  analyzeStyle,
  formatStyleProfile,
  type StyleProfile,
} from "@ghostwriter/style-fingerprint";
