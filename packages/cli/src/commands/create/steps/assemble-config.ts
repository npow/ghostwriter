import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ora } from "ora";
import { stringify as yamlStringify } from "yaml";
import { getChannelsDir, ChannelConfigSchema, type ChannelConfig } from "@auto-blogger/core";
import type { CreateContext } from "../types.js";

export async function assembleConfig(
  ctx: CreateContext,
  spinner: Ora
): Promise<ChannelConfig> {
  spinner.start("Assembling channel config...");

  const intent = ctx.intent!;
  const voice = ctx.voice!;
  const schedule = ctx.schedule!;

  const siteUrl = intent.siteUrl
    ? `https://${intent.siteUrl.replace(/^https?:\/\//, "")}`
    : ctx.connection?.url ?? "https://example.wordpress.com";

  const config: ChannelConfig = ChannelConfigSchema.parse({
    id: intent.channelId,
    name: intent.channelName,
    contentType: intent.contentType,
    topic: {
      domain: intent.topic.domain,
      focus: intent.topic.focus,
      keywords: intent.topic.keywords,
      constraints: intent.topic.constraints,
    },
    dataSources: ctx.dataSources,
    voice: {
      name: voice.name,
      persona: voice.persona,
      age: voice.age,
      backstory: voice.backstory,
      opinions: voice.opinions,
      verbalTics: voice.verbalTics,
      exampleContent: ["./examples/sample-1.md"],
      vocabulary: voice.vocabulary,
      tone: voice.tone,
    },
    publishTargets: [
      {
        platform: "wordpress" as const,
        id: ctx.connection?.id,
        url: siteUrl,
      },
    ],
    schedule: {
      cron: schedule.cron,
      timezone: schedule.timezone,
      enabled: true,
    },
    qualityGate: {
      minScores: {
        structure: 7,
        readability: 7,
        voiceMatch: 7,
        factualAccuracy: 7,
        sourceCoverage: 7,
        hookStrength: 7,
        engagementPotential: 7,
        naturalness: 7,
        perplexityVariance: 7,
      },
      maxRevisions: 3,
    },
    targetWordCount: intent.targetWordCount ?? 1500,
    batchApi: false,
  });

  if (ctx.options.dryRun) {
    spinner.succeed("Config assembled (dry run — not writing files)");
    return config;
  }

  // Write files
  const channelsDir = getChannelsDir();
  const channelDir = join(channelsDir, intent.channelId);
  const examplesDir = join(channelDir, "examples");

  await mkdir(examplesDir, { recursive: true });

  const yamlContent = yamlStringify(config, {
    lineWidth: 120,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  });

  await writeFile(join(channelDir, "config.yml"), yamlContent, "utf-8");

  spinner.succeed(`Config written to channels/${intent.channelId}/config.yml`);

  return config;
}
