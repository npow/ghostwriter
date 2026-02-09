import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  boolean,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// ─── Channels ───────────────────────────────────────────────────────────────

export const channels = pgTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Pipeline Runs ──────────────────────────────────────────────────────────

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: text("channel_id")
      .references(() => channels.id)
      .notNull(),
    status: text("status").notNull().default("pending"),
    currentStage: text("current_stage"),
    revision: integer("revision").notNull().default(0),
    scores: jsonb("scores"),
    totalCost: real("total_cost").default(0),
    error: text("error"),
    temporalWorkflowId: text("temporal_workflow_id"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_pipeline_runs_channel").on(table.channelId),
    index("idx_pipeline_runs_status").on(table.status),
  ]
);

// ─── Content Artifacts ──────────────────────────────────────────────────────

export const contentArtifacts = pgTable(
  "content_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineRunId: uuid("pipeline_run_id")
      .references(() => pipelineRuns.id)
      .notNull(),
    stage: text("stage").notNull(),
    revision: integer("revision").notNull().default(0),
    content: jsonb("content").notNull(),
    modelUsed: text("model_used"),
    tokenInput: integer("token_input"),
    tokenOutput: integer("token_output"),
    cost: real("cost"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_artifacts_run").on(table.pipelineRunId),
    index("idx_artifacts_stage").on(table.stage),
  ]
);

// ─── Publications ───────────────────────────────────────────────────────────

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineRunId: uuid("pipeline_run_id")
      .references(() => pipelineRuns.id)
      .notNull(),
    channelId: text("channel_id")
      .references(() => channels.id)
      .notNull(),
    platform: text("platform").notNull(),
    url: text("url"),
    platformId: text("platform_id"),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    index("idx_publications_run").on(table.pipelineRunId),
    index("idx_publications_channel").on(table.channelId),
  ]
);

// ─── Source Materials ───────────────────────────────────────────────────────

export const sourceMaterials = pgTable(
  "source_materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: text("channel_id")
      .references(() => channels.id)
      .notNull(),
    sourceType: text("source_type").notNull(),
    provider: text("provider").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    url: text("url"),
    publishedAt: timestamp("published_at"),
    metadata: jsonb("metadata").default({}),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    index("idx_source_channel").on(table.channelId),
    index("idx_source_expires").on(table.expiresAt),
  ]
);

// ─── Style Fingerprints ─────────────────────────────────────────────────────

export const styleFingerprints = pgTable("style_fingerprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: text("channel_id")
    .references(() => channels.id)
    .notNull()
    .unique(),
  fingerprint: jsonb("fingerprint").notNull(),
  exampleCount: integer("example_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Content Analytics ──────────────────────────────────────────────────────

export const contentAnalytics = pgTable(
  "content_analytics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicationId: uuid("publication_id")
      .references(() => publications.id)
      .notNull(),
    channelId: text("channel_id")
      .references(() => channels.id)
      .notNull(),
    platform: text("platform").notNull(),
    views: integer("views").default(0),
    clicks: integer("clicks").default(0),
    shares: integer("shares").default(0),
    likes: integer("likes").default(0),
    comments: integer("comments").default(0),
    aiDetectionScore: real("ai_detection_score"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [index("idx_analytics_publication").on(table.publicationId)]
);
