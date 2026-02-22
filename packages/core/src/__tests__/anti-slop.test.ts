import { describe, it, expect } from "vitest";
import {
  detectAiPhrases,
  computeBurstiness,
  analyzeParagraphVariation,
  AI_PHRASE_BLACKLIST,
} from "../anti-slop.js";

describe("detectAiPhrases", () => {
  it("returns empty array for clean text", () => {
    const result = detectAiPhrases("The market fell 3% yesterday due to inflation data.");
    expect(result).toEqual([]);
  });

  it("detects a single blacklisted phrase", () => {
    const result = detectAiPhrases("Let's delve into the details of this report.");
    expect(result).toContain("delve into");
  });

  it("detects multiple blacklisted phrases", () => {
    const result = detectAiPhrases(
      "It's important to note that this game-changer will revolutionize the industry."
    );
    expect(result).toContain("it's important to note");
    expect(result).toContain("game-changer");
    expect(result).toContain("revolutionize");
  });

  it("is case-insensitive", () => {
    const result = detectAiPhrases("DELVE INTO the data. A PARADIGM SHIFT occurred.");
    expect(result).toContain("delve into");
    expect(result).toContain("paradigm shift");
  });

  it("returns empty array for empty string", () => {
    expect(detectAiPhrases("")).toEqual([]);
  });

  it("blacklist has expected entries", () => {
    expect(AI_PHRASE_BLACKLIST.length).toBeGreaterThan(50);
    expect(AI_PHRASE_BLACKLIST).toContain("delve into");
    expect(AI_PHRASE_BLACKLIST).toContain("in conclusion");
    expect(AI_PHRASE_BLACKLIST).toContain("tapestry");
  });
});

describe("computeBurstiness", () => {
  it("returns zeros for empty text", () => {
    const result = computeBurstiness("");
    expect(result.avgSentenceLength).toBe(0);
    expect(result.stdDev).toBe(0);
    expect(result.burstinessScore).toBe(0);
  });

  it("returns zero stdDev for a single sentence", () => {
    const result = computeBurstiness("This is a single sentence.");
    expect(result.avgSentenceLength).toBe(5);
    expect(result.stdDev).toBe(0);
    expect(result.burstinessScore).toBe(0);
  });

  it("computes higher burstiness for varied sentence lengths", () => {
    const uniform = computeBurstiness(
      "I walk fast. He runs fast. She sits down. We eat food. They jump high."
    );
    const varied = computeBurstiness(
      "Go. The quick brown fox jumped over the extremely lazy dog sitting on the porch on a warm summer afternoon. Run!"
    );
    expect(varied.burstinessScore).toBeGreaterThan(uniform.burstinessScore);
  });

  it("returns positive average sentence length", () => {
    const result = computeBurstiness("First sentence here. Second sentence there.");
    expect(result.avgSentenceLength).toBeGreaterThan(0);
  });
});

describe("analyzeParagraphVariation", () => {
  it("returns zeros for empty text", () => {
    const result = analyzeParagraphVariation("");
    expect(result.avgParagraphWords).toBe(0);
    expect(result.stdDev).toBe(0);
    expect(result.variationScore).toBe(0);
  });

  it("returns zero variation for single paragraph", () => {
    const result = analyzeParagraphVariation("Just one paragraph with several words in it.");
    expect(result.variationScore).toBe(0);
  });

  it("computes higher variation for different paragraph lengths", () => {
    const uniform = [
      "One two three four five.",
      "One two three four five.",
      "One two three four five.",
    ].join("\n\n");

    const varied = [
      "Short.",
      "This is a much longer paragraph with many more words in it to create variation between paragraph lengths for testing purposes.",
      "Medium length here.",
    ].join("\n\n");

    const uniformResult = analyzeParagraphVariation(uniform);
    const variedResult = analyzeParagraphVariation(varied);
    expect(variedResult.variationScore).toBeGreaterThan(uniformResult.variationScore);
  });
});
