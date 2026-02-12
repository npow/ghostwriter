import { z } from "zod";

// ─── Pipeline Stage Types ───────────────────────────────────────────────────

export const PipelineStageSchema = z.enum([
  "research",
  "outline",
  "draft",
  "review",
  "polish",
  "adapt",
  "publish",
  "monitor",
]);

export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const PipelineStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "dead_letter",
]);

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

// ─── Source Material ────────────────────────────────────────────────────────

export const SourceMaterialSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["api", "rss", "scrape"]),
  provider: z.string(),
  title: z.string().optional(),
  content: z.string(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  fetchedAt: z.string(),
});

export type SourceMaterial = z.infer<typeof SourceMaterialSchema>;

// ─── Research Brief ─────────────────────────────────────────────────────────

export const ResearchBriefSchema = z.object({
  channelId: z.string(),
  summary: z.string(),
  keyFacts: z.array(
    z.object({
      fact: z.string(),
      source: z.string(),
      sourceUrl: z.string().optional(),
    })
  ),
  narrativeAngles: z.array(z.string()),
  dataPoints: z.record(z.unknown()),
  sources: z.array(SourceMaterialSchema),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

// ─── Content Outline ────────────────────────────────────────────────────────

export const ContentOutlineSchema = z.object({
  channelId: z.string(),
  headline: z.string(),
  hook: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      keyPoints: z.array(z.string()),
      assignedDataPoints: z.array(z.string()),
      targetWordCount: z.number(),
    })
  ),
  conclusion: z.string(),
  estimatedWordCount: z.number(),
});

export type ContentOutline = z.infer<typeof ContentOutlineSchema>;

// ─── Content Draft ──────────────────────────────────────────────────────────

export const ContentDraftSchema = z.object({
  channelId: z.string(),
  headline: z.string(),
  content: z.string(),
  wordCount: z.number(),
  revision: z.number().default(0),
});

export type ContentDraft = z.infer<typeof ContentDraftSchema>;

// ─── Review Scores ──────────────────────────────────────────────────────────

export const ReviewScoresSchema = z.object({
  structure: z.number().min(1).max(10),
  readability: z.number().min(1).max(10),
  voiceMatch: z.number().min(1).max(10),
  factualAccuracy: z.number().min(1).max(10),
  sourceCoverage: z.number().min(1).max(10),
  hookStrength: z.number().min(1).max(10),
  engagementPotential: z.number().min(1).max(10),
  naturalness: z.number().min(1).max(10),
  perplexityVariance: z.number().min(1).max(10),
});

export type ReviewScores = z.infer<typeof ReviewScoresSchema>;

export const ReviewAgentResultSchema = z.object({
  agent: z.enum(["editor", "fact_checker", "engagement", "ai_detection"]),
  scores: z.record(z.number()),
  passed: z.boolean(),
  feedback: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export type ReviewAgentResult = z.infer<typeof ReviewAgentResultSchema>;

export const ReviewResultSchema = z.object({
  channelId: z.string(),
  passed: z.boolean(),
  aggregateScores: ReviewScoresSchema,
  agentResults: z.array(ReviewAgentResultSchema),
  revision: z.number(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ─── Platform Content ───────────────────────────────────────────────────────

export const PlatformContentSchema = z.object({
  channelId: z.string(),
  platform: z.string(),
  targetId: z.string().optional(), // Links to specific PublishTarget.id
  format: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export type PlatformContent = z.infer<typeof PlatformContentSchema>;

// ─── Publish Result ─────────────────────────────────────────────────────────

export const PublishResultSchema = z.object({
  channelId: z.string(),
  platform: z.string(),
  success: z.boolean(),
  url: z.string().optional(),
  platformId: z.string().optional(),
  error: z.string().optional(),
  publishedAt: z.string(),
});

export type PublishResult = z.infer<typeof PublishResultSchema>;

// ─── Style Fingerprint ──────────────────────────────────────────────────────

/** @deprecated Use `StyleProfile` from `@auto-blogger/style-fingerprint` instead. */
export const StyleFingerprintSchema = z.object({
  channelId: z.string(),
  avgSentenceLength: z.number(),
  sentenceLengthStdDev: z.number(),
  avgParagraphLength: z.number(),
  paragraphLengthStdDev: z.number(),
  vocabularyRichness: z.number(),
  avgWordLength: z.number(),
  contractionFrequency: z.number(),
  questionFrequency: z.number(),
  exclamationFrequency: z.number(),
  transitionWordFrequency: z.number(),
  firstPersonFrequency: z.number(),
  secondPersonFrequency: z.number(),
  passiveVoiceFrequency: z.number(),
  adverbFrequency: z.number(),
  readabilityScore: z.number(),
  humorDensity: z.number(),
  metaphorDensity: z.number(),
  dataReferenceDensity: z.number(),
  dialogueFrequency: z.number(),
  listUsageFrequency: z.number(),
  avgSectionLength: z.number(),
  openingStyle: z.string(),
  closingStyle: z.string(),
  topBigrams: z.array(z.string()),
  topTrigrams: z.array(z.string()),
  sentimentRange: z.object({
    min: z.number(),
    max: z.number(),
    avg: z.number(),
  }),
  punctuationProfile: z.record(z.number()),
});

export type StyleFingerprint = z.infer<typeof StyleFingerprintSchema>;

// ─── Pipeline Run ───────────────────────────────────────────────────────────

export const PipelineRunSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  status: PipelineStatusSchema,
  currentStage: PipelineStageSchema.optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  scores: ReviewScoresSchema.optional(),
  totalCost: z.number().default(0),
  revision: z.number().default(0),
  error: z.string().optional(),
});

export type PipelineRun = z.infer<typeof PipelineRunSchema>;
