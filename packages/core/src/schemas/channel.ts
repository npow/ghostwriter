import { z } from "zod";

// ─── Data Source Schemas ────────────────────────────────────────────────────

export const ApiDataSourceSchema = z.object({
  type: z.literal("api"),
  provider: z.string(),
  endpoint: z.string(),
  headers: z.record(z.string()).optional(),
  params: z.record(z.string()).optional(),
  rateLimit: z
    .object({
      requestsPerMinute: z.number().positive(),
    })
    .optional(),
});

export const RssDataSourceSchema = z.object({
  type: z.literal("rss"),
  url: z.string().url(),
  maxItems: z.number().positive().default(10),
});

export const ScrapeDataSourceSchema = z.object({
  type: z.literal("scrape"),
  url: z.string().url(),
  selector: z.string(),
  dynamic: z.boolean().default(false),
  waitFor: z.string().optional(),
});

export const DataSourceSchema = z.discriminatedUnion("type", [
  ApiDataSourceSchema,
  RssDataSourceSchema,
  ScrapeDataSourceSchema,
]);

// ─── Voice & Persona ────────────────────────────────────────────────────────

export const VoiceSchema = z.object({
  name: z.string(),
  persona: z.string(),
  age: z.number().optional(),
  backstory: z.string().optional(),
  opinions: z.array(z.string()).optional(),
  verbalTics: z.array(z.string()).optional(),
  exampleContent: z.array(z.string()).default([]),
  vocabulary: z
    .object({
      preferred: z.array(z.string()).default([]),
      forbidden: z.array(z.string()).default([]),
    })
    .default({}),
  tone: z.enum([
    "conversational",
    "professional",
    "academic",
    "casual",
    "authoritative",
    "humorous",
    "warm",
  ]),
});

// ─── Publishing Targets ─────────────────────────────────────────────────────

export const TwitterTargetSchema = z.object({
  platform: z.literal("twitter"),
  id: z.string().optional(),
  format: z.enum(["single", "thread"]).default("thread"),
  maxTweets: z.number().positive().default(10),
});

export const PodcastTargetSchema = z.object({
  platform: z.literal("podcast"),
  id: z.string().optional(),
  provider: z.enum(["buzzsprout", "transistor"]).default("buzzsprout"),
  voiceId: z.string().optional(),
  maxDurationMinutes: z.number().positive().default(10),
});

export const EtsyTargetSchema = z.object({
  platform: z.literal("etsy"),
  id: z.string().optional(),
  shopId: z.string().optional(),
  productType: z.string(),
});

export const WordPressTargetSchema = z.object({
  platform: z.literal("wordpress"),
  id: z.string().optional(), // Unique target ID (e.g. "tech-blog", "recipes-site")
  url: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const HugoTargetSchema = z.object({
  platform: z.literal("hugo"),
  id: z.string().optional(),
  repoPath: z.string().optional(), // Resolved from connection if omitted
  contentDir: z.string().default("content/posts"), // Where to write posts
  branch: z.string().default("main"), // Git branch to push to
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false), // Hugo draft status
});

export const PublishTargetSchema = z.discriminatedUnion("platform", [
  TwitterTargetSchema,
  PodcastTargetSchema,
  EtsyTargetSchema,
  WordPressTargetSchema,
  HugoTargetSchema,
]);

// ─── Quality Gate ───────────────────────────────────────────────────────────

export const QualityGateSchema = z.object({
  minScores: z
    .object({
      structure: z.number().min(1).max(10).default(7),
      readability: z.number().min(1).max(10).default(7),
      voiceMatch: z.number().min(1).max(10).default(7),
      factualAccuracy: z.number().min(1).max(10).default(7),
      sourceCoverage: z.number().min(1).max(10).default(7),
      hookStrength: z.number().min(1).max(10).default(7),
      engagementPotential: z.number().min(1).max(10).default(7),
      naturalness: z.number().min(1).max(10).default(7),
      perplexityVariance: z.number().min(1).max(10).default(7),
      topicOriginality: z.number().min(1).max(10).default(6),
      angleFreshness: z.number().min(1).max(10).default(6),
    })
    .default({}),
  maxRevisions: z.number().positive().default(3),
});

// ─── Monetization ───────────────────────────────────────────────────────────

export const MonetizationSchema = z.object({
  affiliateLinks: z
    .array(
      z.object({
        keyword: z.string(),
        url: z.string().url(),
        disclosure: z.string().default("affiliate link"),
      })
    )
    .default([]),
  adPlacements: z
    .array(
      z.object({
        position: z.enum(["top", "middle", "bottom", "after-intro"]),
        code: z.string(),
      })
    )
    .default([]),
});

// ─── Schedule ───────────────────────────────────────────────────────────────

export const ScheduleSchema = z.object({
  cron: z.string(),
  timezone: z.string().default("America/New_York"),
  enabled: z.boolean().default(true),
});

// ─── Content Type ───────────────────────────────────────────────────────────

export const ContentTypeSchema = z.enum([
  "article",
  "listicle",
  "recap",
  "analysis",
  "tutorial",
  "recipe",
  "review",
  "roundup",
]);

// ─── Full Channel Config ────────────────────────────────────────────────────

export const ChannelConfigSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      "Channel ID must be lowercase alphanumeric with hyphens"
    ),
  name: z.string().min(1),
  contentType: ContentTypeSchema,
  topic: z.object({
    domain: z.string(),
    focus: z.string(),
    keywords: z.array(z.string()).default([]),
    constraints: z.string().optional(),
  }),
  dataSources: z.array(DataSourceSchema).min(1),
  voice: VoiceSchema,
  publishTargets: z.array(PublishTargetSchema).min(1),
  schedule: ScheduleSchema,
  qualityGate: QualityGateSchema.default({}),
  monetization: MonetizationSchema.optional(),
  targetWordCount: z.number().positive().default(1500),
  batchApi: z.boolean().default(false),
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type Voice = z.infer<typeof VoiceSchema>;
export type PublishTarget = z.infer<typeof PublishTargetSchema>;
export type QualityGate = z.infer<typeof QualityGateSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;
