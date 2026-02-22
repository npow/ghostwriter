import { loadChannelConfig, createChildLogger } from "@ghostwriter/core";
import type {
  ChannelConfig,
  SourceMaterial,
  PlatformContent,
  PublishResult,
  StyleFingerprint,
} from "@ghostwriter/core";
import { ingestData } from "@ghostwriter/data-ingestion";
import {
  runPipeline,
  type PipelineResult,
  analyzeStyleFingerprint,
} from "@ghostwriter/content-pipeline";
import { publishAll } from "@ghostwriter/publishing";
import {
  syncAnalytics,
  generatePerformanceInsights,
  formatInsightsForPrompt,
} from "@ghostwriter/monitoring";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getChannelsDir } from "@ghostwriter/core";

const logger = createChildLogger({ module: "orchestrator:activities" });

/**
 * Temporal activities — each is an independently retriable unit of work.
 */

export async function loadConfig(channelId: string): Promise<ChannelConfig> {
  return loadChannelConfig(channelId);
}

export async function ingestSources(
  channelId: string,
  dataSources: ChannelConfig["dataSources"]
): Promise<SourceMaterial[]> {
  return ingestData(channelId, dataSources);
}

export async function loadStyleFingerprint(
  config: ChannelConfig
): Promise<StyleFingerprint | undefined> {
  if (config.voice.exampleContent.length === 0) return undefined;

  const channelsDir = getChannelsDir();
  const exampleTexts: string[] = [];

  for (const examplePath of config.voice.exampleContent) {
    const fullPath = join(channelsDir, config.id, examplePath);
    try {
      const text = await readFile(fullPath, "utf-8");
      exampleTexts.push(text);
    } catch (err) {
      logger.debug({ path: fullPath, error: err instanceof Error ? err.message : String(err) }, "Skipping missing example file");
    }
  }

  if (exampleTexts.length === 0) return undefined;

  return analyzeStyleFingerprint(config.id, exampleTexts);
}

/**
 * Sync analytics from platform APIs for a channel's published content.
 * Call this before generating new content to have fresh engagement data.
 */
export async function syncChannelAnalytics(
  channelId: string
): Promise<number> {
  return syncAnalytics(channelId);
}

/**
 * Generate performance insights for a channel based on historical analytics.
 * Returns a formatted string to inject into the draft prompt.
 */
export async function getPerformanceContext(
  channelId: string
): Promise<string> {
  const insights = await generatePerformanceInsights(channelId);
  return formatInsightsForPrompt(insights);
}

export async function runContentPipeline(
  config: ChannelConfig,
  sources: SourceMaterial[],
  fingerprint?: StyleFingerprint,
  performanceContext?: string
): Promise<PipelineResult> {
  return runPipeline(config, sources, { fingerprint, performanceContext });
}

export async function publishContent(
  config: ChannelConfig,
  adaptations: PlatformContent[]
): Promise<PublishResult[]> {
  return publishAll(config, adaptations);
}
