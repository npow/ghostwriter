import { loadChannelConfig } from "@auto-blogger/core";
import type {
  ChannelConfig,
  SourceMaterial,
  PlatformContent,
  PublishResult,
  StyleFingerprint,
} from "@auto-blogger/core";
import { ingestData } from "@auto-blogger/data-ingestion";
import {
  runPipeline,
  type PipelineResult,
  analyzeStyleFingerprint,
} from "@auto-blogger/content-pipeline";
import { publishAll } from "@auto-blogger/publishing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getChannelsDir } from "@auto-blogger/core";

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
    } catch {
      // Skip missing examples
    }
  }

  if (exampleTexts.length === 0) return undefined;

  return analyzeStyleFingerprint(config.id, exampleTexts);
}

export async function runContentPipeline(
  config: ChannelConfig,
  sources: SourceMaterial[],
  fingerprint?: StyleFingerprint
): Promise<PipelineResult> {
  return runPipeline(config, sources, { fingerprint });
}

export async function publishContent(
  config: ChannelConfig,
  adaptations: PlatformContent[]
): Promise<PublishResult[]> {
  return publishAll(config, adaptations);
}
