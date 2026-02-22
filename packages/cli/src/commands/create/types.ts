import type { ChannelConfig, ConnectionEntry, ContentType, DataSource } from "@ghostwriter/core";
import type { StyleProfile } from "@ghostwriter/style-fingerprint";
import type { SiteSetupResult } from "@ghostwriter/site-setup";

// ─── ParsedIntent ──────────────────────────────────────────────────────────

export interface ParsedIntent {
  channelId: string;
  channelName: string;
  contentType: ContentType;
  topic: {
    domain: string;
    focus: string;
    keywords: string[];
    constraints?: string;
  };
  toneDescription: string;
  styleReferences: string[];
  publishPlatform: "wordpress-com";
  siteUrl?: string;
  connectionId?: string;
  schedule?: {
    frequency: "daily" | "weekly" | "biweekly" | "monthly";
    dayOfWeek?: string;
    time?: string;
    timezone?: string;
  };
  targetWordCount?: number;
}

// ─── GeneratedVoice ────────────────────────────────────────────────────────

export interface GeneratedVoice {
  name: string;
  persona: string;
  age?: number;
  backstory?: string;
  opinions?: string[];
  verbalTics?: string[];
  vocabulary: {
    preferred: string[];
    forbidden: string[];
  };
  tone: "conversational" | "professional" | "academic" | "casual" | "authoritative" | "humorous" | "warm";
}

// ─── DiscoveredSources ─────────────────────────────────────────────────────

export interface DiscoveredSource {
  type: "rss" | "api";
  url: string;
  name: string;
  description: string;
  requiresApiKey?: boolean;
  apiKeyEnvVar?: string;
}

export interface DiscoveredSources {
  sources: DiscoveredSource[];
}

// ─── CreateContext ──────────────────────────────────────────────────────────

export interface CreateOptions {
  interactive: boolean;
  siteSetup: boolean;
  dryRun: boolean;
}

export interface CreateContext {
  rawDescription: string;
  options: CreateOptions;
  intent?: ParsedIntent;
  connection?: ConnectionEntry;
  styleProfile?: StyleProfile;
  voice?: GeneratedVoice;
  dataSources?: DataSource[];
  schedule?: { cron: string; timezone: string };
  config?: ChannelConfig;
  siteResult?: SiteSetupResult;
  totalCost: number;
}
