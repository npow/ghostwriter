import type {
  ChannelConfig,
  ContentDraft,
  PlatformContent,
  PublishTarget,
} from "@ghostwriter/core";
import { createChildLogger, resolveTargetId } from "@ghostwriter/core";
import { callLlm } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:adapt" });

/**
 * Adapt Stage: Reformat content for each target platform.
 * Fan-out: one adaptation per publish target. Each gets a targetId
 * so the publisher knows exactly which connection to use.
 */
export async function runAdaptStage(
  config: ChannelConfig,
  draft: ContentDraft
): Promise<{ adaptations: PlatformContent[]; cost: number }> {
  logger.info(
    { channelId: config.id, platforms: config.publishTargets.length },
    "Starting adapt stage"
  );

  let totalCost = 0;
  const adaptations: PlatformContent[] = [];

  for (let i = 0; i < config.publishTargets.length; i++) {
    const target = config.publishTargets[i];
    const targetId = resolveTargetId(target, i);
    const { adaptation, cost } = await adaptForPlatform(
      config,
      draft,
      target,
      targetId
    );
    adaptations.push(adaptation);
    totalCost += cost;
  }

  logger.info(
    { channelId: config.id, adaptationCount: adaptations.length, totalCost },
    "Adapt stage complete"
  );

  return { adaptations, cost: totalCost };
}

async function adaptForPlatform(
  config: ChannelConfig,
  draft: ContentDraft,
  target: PublishTarget,
  targetId: string
): Promise<{ adaptation: PlatformContent; cost: number }> {
  const platform = target.platform;

  // WordPress: use the draft content as-is (it's already in markdown)
  if (platform === "wordpress") {
    return {
      adaptation: {
        channelId: config.id,
        platform,
        targetId,
        format: "markdown",
        content: draft.content,
        metadata: {
          headline: draft.headline,
          tags: "tags" in target ? target.tags : [],
        },
      },
      cost: 0,
    };
  }

  // Twitter: convert to thread
  if (platform === "twitter") {
    return adaptForTwitter(config, draft, target, targetId);
  }

  // Podcast: convert to script
  if (platform === "podcast") {
    return adaptForPodcast(config, draft, target, targetId);
  }

  // Etsy: convert to product listing
  if (platform === "etsy") {
    return adaptForEtsy(config, draft, targetId);
  }

  // Fallback: return as-is
  return {
    adaptation: {
      channelId: config.id,
      platform,
      targetId,
      format: "raw",
      content: draft.content,
      metadata: {},
    },
    cost: 0,
  };
}

async function adaptForTwitter(
  config: ChannelConfig,
  draft: ContentDraft,
  target: PublishTarget & { platform: "twitter" },
  targetId: string
): Promise<{ adaptation: PlatformContent; cost: number }> {
  const systemPrompt = `Convert the following article into a Twitter/X thread.

Rules:
- Each tweet must be under 280 characters
- First tweet should be a hook that stands alone
- Number tweets: 1/, 2/, etc.
- Include key data points and insights
- End with a call-to-action or thought-provoking question
- Maximum ${target.format === "single" ? 1 : target.maxTweets} tweets
- Write as ${config.voice.name} in a ${config.voice.tone} tone
- Separate each tweet with ---

Return ONLY the tweets, separated by ---.`;

  const result = await callLlm("sonnet", systemPrompt, draft.content, {
    maxTokens: 4096,
  });

  return {
    adaptation: {
      channelId: config.id,
      platform: "twitter",
      targetId,
      format: target.format,
      content: result.content,
      metadata: { tweetCount: result.content.split("---").length },
    },
    cost: result.cost,
  };
}

async function adaptForPodcast(
  config: ChannelConfig,
  draft: ContentDraft,
  target: PublishTarget & { platform: "podcast" },
  targetId: string
): Promise<{ adaptation: PlatformContent; cost: number }> {
  const systemPrompt = `Convert this article into a podcast script for a ${target.maxDurationMinutes}-minute episode.

Rules:
- Write it as natural spoken language (contractions, pauses, asides)
- Include "[PAUSE]" markers for natural pauses
- Start with a greeting and topic intro
- End with a sign-off
- Write as ${config.voice.name}: ${config.voice.persona}
- Keep the same facts and data points
- Aim for ~150 words per minute of audio

Return the full podcast script.`;

  const result = await callLlm("sonnet", systemPrompt, draft.content, {
    maxTokens: 4096,
  });

  return {
    adaptation: {
      channelId: config.id,
      platform: "podcast",
      targetId,
      format: "script",
      content: result.content,
      metadata: {
        targetDuration: target.maxDurationMinutes,
        voiceId: target.voiceId,
      },
    },
    cost: result.cost,
  };
}

async function adaptForEtsy(
  config: ChannelConfig,
  draft: ContentDraft,
  targetId: string
): Promise<{ adaptation: PlatformContent; cost: number }> {
  const systemPrompt = `Convert this content into an Etsy digital product listing.

Create:
1. Product title (max 140 chars)
2. Description (compelling, SEO-optimized, includes what buyer gets)
3. Tags (up to 13, comma-separated)
4. Section: what's included

Format as JSON: { "title": "...", "description": "...", "tags": [...], "whatsIncluded": "..." }`;

  const result = await callLlm("sonnet", systemPrompt, draft.content, {
    maxTokens: 2048,
  });

  return {
    adaptation: {
      channelId: config.id,
      platform: "etsy",
      targetId,
      format: "listing",
      content: result.content,
      metadata: {},
    },
    cost: result.cost,
  };
}
