import { describe, it, expect } from "vitest";
import { analyzeStyle, mergeStyleProfiles } from "../analyze.js";
import type { StyleProfile } from "../types.js";

const SAMPLE_TEXT = `
I've been thinking about this for a while now. The tech industry moves fast — sometimes too fast for its own good.

When I started coding, we didn't have fancy frameworks. You wrote HTML by hand. You uploaded files via FTP. And honestly? It worked fine.

But here's the thing most people miss: simplicity isn't about doing less. It's about doing the right things. My first startup failed because we built everything from scratch. We should've used boring technology.

The data backs this up. According to a 2023 Stack Overflow survey, 72% of developers prefer established tools over cutting-edge ones. That's not laziness — that's wisdom.

So what should you do? Start small. Ship fast. Listen to your users. Everything else is noise.
`;

const SAMPLE_TEXT_2 = `
Do you ever wonder why some products succeed while others don't? I think about this constantly.

The answer isn't always what you'd expect. It's not the best technology that wins — it's the one that solves a real problem for real people. We've seen this play out over and over.

Take email, for example. It's been "dying" for 20 years. Yet it's still the backbone of business communication. Why? Because it works. No login required. No platform lock-in. Just send and receive.

That's the kind of durability I admire. Not flashy, not trendy, just useful.
`;

describe("analyzeStyle", () => {
  it("returns empty profile for empty input", () => {
    const result = analyzeStyle([]);
    expect(result.sampleCount).toBe(0);
    expect(result.version).toBe(1);
    expect(result.dimensions.verbosity).toBe(0.5);
  });

  it("analyzes a single text sample", () => {
    const result = analyzeStyle([SAMPLE_TEXT]);
    expect(result.sampleCount).toBe(1);
    expect(result.version).toBe(1);
    expect(result.analyzedAt).toBeTruthy();

    // Dimensions should be 0-1
    expect(result.dimensions.verbosity).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.verbosity).toBeLessThanOrEqual(1);
    expect(result.dimensions.formality).toBeGreaterThanOrEqual(0);
    expect(result.dimensions.formality).toBeLessThanOrEqual(1);

    // Raw metrics should be reasonable
    expect(result.raw.avgSentenceLength).toBeGreaterThan(0);
    expect(result.raw.avgParagraphLength).toBeGreaterThan(0);
    expect(result.raw.vocabularyRichness).toBeGreaterThan(0);
    expect(result.raw.avgWordLength).toBeGreaterThan(0);
  });

  it("analyzes multiple text samples", () => {
    const result = analyzeStyle([SAMPLE_TEXT, SAMPLE_TEXT_2]);
    expect(result.sampleCount).toBe(2);
    expect(result.raw.avgSentenceLength).toBeGreaterThan(0);
  });

  it("detects contractions in casual text", () => {
    const result = analyzeStyle([SAMPLE_TEXT]);
    expect(result.raw.contractionFrequency).toBeGreaterThan(0);
  });

  it("detects questions", () => {
    const result = analyzeStyle([SAMPLE_TEXT_2]);
    expect(result.raw.questionFrequency).toBeGreaterThan(0);
  });

  it("detects second-person usage", () => {
    const result = analyzeStyle([SAMPLE_TEXT]);
    // "you" appears in the text
    expect(result.raw.secondPersonFrequency).toBeGreaterThan(0);
  });

  it("produces valid sentiment range", () => {
    const result = analyzeStyle([SAMPLE_TEXT]);
    expect(result.raw.sentimentRange.min).toBeLessThanOrEqual(result.raw.sentimentRange.max);
    expect(result.raw.sentimentRange.avg).toBeGreaterThanOrEqual(result.raw.sentimentRange.min);
    expect(result.raw.sentimentRange.avg).toBeLessThanOrEqual(result.raw.sentimentRange.max);
  });
});

describe("mergeStyleProfiles", () => {
  it("returns empty profile for empty array", () => {
    const result = mergeStyleProfiles([]);
    expect(result.sampleCount).toBe(0);
  });

  it("returns single profile unchanged", () => {
    const profile = analyzeStyle([SAMPLE_TEXT]);
    const result = mergeStyleProfiles([profile]);
    expect(result).toEqual(profile);
  });

  it("merges two profiles", () => {
    const p1 = analyzeStyle([SAMPLE_TEXT]);
    const p2 = analyzeStyle([SAMPLE_TEXT_2]);
    const merged = mergeStyleProfiles([p1, p2]);

    expect(merged.sampleCount).toBe(p1.sampleCount + p2.sampleCount);
    // Dimensions should be averaged
    expect(merged.dimensions.verbosity).toBeCloseTo(
      (p1.dimensions.verbosity + p2.dimensions.verbosity) / 2,
      1
    );
  });
});
