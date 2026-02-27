import { describe, it, expect } from "vitest";
import {
  ReviewScoresSchema,
  PipelineStageSchema,
  PipelineStatusSchema,
  ContentDraftSchema,
  PublishResultSchema,
  StyleFingerprintSchema,
} from "../schemas/pipeline.js";

describe("PipelineStageSchema", () => {
  it("accepts valid stages", () => {
    for (const stage of ["research", "outline", "draft", "review", "polish", "adapt", "publish", "monitor"]) {
      expect(PipelineStageSchema.parse(stage)).toBe(stage);
    }
  });

  it("rejects invalid stage", () => {
    expect(() => PipelineStageSchema.parse("invalid")).toThrow();
  });
});

describe("PipelineStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of ["pending", "running", "completed", "failed", "dead_letter"]) {
      expect(PipelineStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => PipelineStatusSchema.parse("unknown")).toThrow();
  });
});

describe("ReviewScoresSchema", () => {
  it("accepts valid scores", () => {
    const scores = {
      structure: 8,
      readability: 7,
      voiceMatch: 9,
      factualAccuracy: 8,
      sourceCoverage: 6,
      hookStrength: 7,
      engagementPotential: 8,
      naturalness: 9,
      perplexityVariance: 7,
      topicOriginality: 8,
      angleFreshness: 7,
    };
    expect(ReviewScoresSchema.parse(scores)).toEqual(scores);
  });

  it("rejects scores below 1", () => {
    const scores = {
      structure: 0,
      readability: 7,
      voiceMatch: 9,
      factualAccuracy: 8,
      sourceCoverage: 6,
      hookStrength: 7,
      engagementPotential: 8,
      naturalness: 9,
      perplexityVariance: 7,
      topicOriginality: 8,
      angleFreshness: 7,
    };
    expect(() => ReviewScoresSchema.parse(scores)).toThrow();
  });

  it("rejects scores above 10", () => {
    const scores = {
      structure: 11,
      readability: 7,
      voiceMatch: 9,
      factualAccuracy: 8,
      sourceCoverage: 6,
      hookStrength: 7,
      engagementPotential: 8,
      naturalness: 9,
      perplexityVariance: 7,
      topicOriginality: 8,
      angleFreshness: 7,
    };
    expect(() => ReviewScoresSchema.parse(scores)).toThrow();
  });
});

describe("ContentDraftSchema", () => {
  it("accepts valid draft with default revision", () => {
    const draft = {
      channelId: "test-channel",
      headline: "Test Article",
      content: "Some content here.",
      wordCount: 3,
    };
    const parsed = ContentDraftSchema.parse(draft);
    expect(parsed.revision).toBe(0);
  });

  it("rejects draft missing required fields", () => {
    expect(() =>
      ContentDraftSchema.parse({ channelId: "test" })
    ).toThrow();
  });
});

describe("PublishResultSchema", () => {
  it("accepts successful publish result", () => {
    const result = {
      channelId: "test-channel",
      platform: "ghost",
      success: true,
      url: "https://example.com/post",
      platformId: "123",
      publishedAt: new Date().toISOString(),
    };
    expect(PublishResultSchema.parse(result)).toEqual(result);
  });

  it("accepts failed publish result with error", () => {
    const result = {
      channelId: "test-channel",
      platform: "twitter",
      success: false,
      error: "Rate limit exceeded",
      publishedAt: new Date().toISOString(),
    };
    expect(PublishResultSchema.parse(result)).toEqual(result);
  });
});

describe("StyleFingerprintSchema", () => {
  it("does not include humorDensity or metaphorDensity", () => {
    expect(StyleFingerprintSchema.shape).not.toHaveProperty("humorDensity");
    expect(StyleFingerprintSchema.shape).not.toHaveProperty("metaphorDensity");
  });

  it("accepts a valid fingerprint", () => {
    const fp = {
      channelId: "test",
      avgSentenceLength: 15,
      sentenceLengthStdDev: 5,
      avgParagraphLength: 50,
      paragraphLengthStdDev: 20,
      vocabularyRichness: 0.7,
      avgWordLength: 5.2,
      contractionFrequency: 0.3,
      questionFrequency: 0.1,
      exclamationFrequency: 0.05,
      transitionWordFrequency: 0.1,
      firstPersonFrequency: 0.2,
      secondPersonFrequency: 0.1,
      passiveVoiceFrequency: 0.05,
      adverbFrequency: 0.08,
      readabilityScore: 65,
      dataReferenceDensity: 0.1,
      dialogueFrequency: 0,
      listUsageFrequency: 0.1,
      avgSectionLength: 100,
      openingStyle: "hook",
      closingStyle: "summary",
      topBigrams: ["the quick", "brown fox"],
      topTrigrams: ["the quick brown"],
      sentimentRange: { min: -0.5, max: 0.8, avg: 0.3 },
      punctuationProfile: { ".": 0.5, ",": 0.3 },
    };
    expect(() => StyleFingerprintSchema.parse(fp)).not.toThrow();
  });
});
