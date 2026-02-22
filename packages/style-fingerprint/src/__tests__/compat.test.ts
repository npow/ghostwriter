import { describe, it, expect } from "vitest";
import { toStyleFingerprint, fromStyleFingerprint, analyzeStyleFingerprint } from "../compat.js";
import { analyzeStyle } from "../analyze.js";

const SAMPLE = `
The morning started with a quick run through the park. Birds were chirping and the air was cool.

I grabbed coffee from the corner shop — my usual order. The barista knows my name by now, which is either charming or concerning.

What struck me today was how quiet the streets were. Normally there's traffic everywhere, but today felt different. Almost peaceful.
`;

describe("toStyleFingerprint", () => {
  it("converts a StyleProfile to a StyleFingerprint", () => {
    const profile = analyzeStyle([SAMPLE]);
    const fp = toStyleFingerprint(profile, "test-channel");

    expect(fp.channelId).toBe("test-channel");
    expect(fp.avgSentenceLength).toBe(profile.raw.avgSentenceLength);
    expect(fp.vocabularyRichness).toBe(profile.raw.vocabularyRichness);
    expect(fp.openingStyle).toBe(profile.raw.openingStyle);
    expect(fp.topBigrams).toEqual(profile.raw.topBigrams);
  });

  it("does not include humorDensity or metaphorDensity", () => {
    const profile = analyzeStyle([SAMPLE]);
    const fp = toStyleFingerprint(profile, "test-channel");
    expect(fp).not.toHaveProperty("humorDensity");
    expect(fp).not.toHaveProperty("metaphorDensity");
  });
});

describe("fromStyleFingerprint", () => {
  it("round-trips through toStyleFingerprint and back", () => {
    const profile = analyzeStyle([SAMPLE]);
    const fp = toStyleFingerprint(profile, "test-channel");
    const roundTripped = fromStyleFingerprint(fp);

    // Raw metrics should survive the round-trip
    expect(roundTripped.raw.avgSentenceLength).toBe(profile.raw.avgSentenceLength);
    expect(roundTripped.raw.vocabularyRichness).toBe(profile.raw.vocabularyRichness);
    expect(roundTripped.raw.openingStyle).toBe(profile.raw.openingStyle);
    expect(roundTripped.version).toBe(1);
    expect(roundTripped.sampleCount).toBe(0); // Unknown from legacy format
  });

  it("produces valid dimensions from legacy fingerprint", () => {
    const profile = analyzeStyle([SAMPLE]);
    const fp = toStyleFingerprint(profile, "test-channel");
    const converted = fromStyleFingerprint(fp);

    for (const key of Object.keys(converted.dimensions) as Array<keyof typeof converted.dimensions>) {
      expect(converted.dimensions[key]).toBeGreaterThanOrEqual(0);
      expect(converted.dimensions[key]).toBeLessThanOrEqual(1);
    }
  });
});

describe("analyzeStyleFingerprint", () => {
  it("produces a legacy StyleFingerprint from raw texts", () => {
    const fp = analyzeStyleFingerprint("test-channel", [SAMPLE]);
    expect(fp.channelId).toBe("test-channel");
    expect(fp.avgSentenceLength).toBeGreaterThan(0);
    expect(fp.vocabularyRichness).toBeGreaterThan(0);
  });
});
