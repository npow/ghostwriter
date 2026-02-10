import type {
  ChannelConfig,
  PlatformContent,
  PublishResult,
} from "@auto-blogger/core";
import { env, createChildLogger } from "@auto-blogger/core";
import { publishToGhost } from "./adapters/ghost.js";
import { publishToTwitter } from "./adapters/twitter.js";
import { publishToPodcast } from "./adapters/podcast.js";
import { publishToWordPress } from "./adapters/wordpress.js";
import {
  generateIdempotencyKey,
  isAlreadyPublished,
  getPreviousPublish,
  recordPublish,
} from "./idempotency.js";

const logger = createChildLogger({ module: "publishing" });

export interface PublishOptions {
  force?: boolean; // Skip idempotency check
}

/**
 * Publish adapted content to all target platforms.
 * Uses idempotency keys to prevent duplicate publishes on retry.
 * Implements saga pattern: tracks per-platform state for rollback visibility.
 */
export async function publishAll(
  config: ChannelConfig,
  adaptations: PlatformContent[],
  options?: PublishOptions
): Promise<PublishResult[]> {
  logger.info(
    { channelId: config.id, platforms: adaptations.length },
    "Starting publishing"
  );

  const results: PublishResult[] = [];
  const succeeded: PublishResult[] = [];
  const failed: PublishResult[] = [];

  // Publish sequentially to maintain saga ordering
  // (parallel publish makes rollback harder to reason about)
  for (const adaptation of adaptations) {
    const idempotencyKey = generateIdempotencyKey(
      config.id,
      adaptation.platform,
      adaptation.content
    );

    // Idempotency check: skip if already published
    if (!options?.force && isAlreadyPublished(idempotencyKey)) {
      const prev = getPreviousPublish(idempotencyKey);
      logger.info(
        { platform: adaptation.platform, idempotencyKey },
        "Skipping duplicate publish (idempotency)"
      );
      results.push({
        channelId: config.id,
        platform: adaptation.platform,
        success: true,
        url: prev?.url,
        platformId: prev?.platformId,
        publishedAt: prev?.publishedAt ?? new Date().toISOString(),
      });
      continue;
    }

    try {
      const result = await publishOne(config, adaptation);
      results.push(result);

      if (result.success) {
        succeeded.push(result);
        recordPublish(idempotencyKey, {
          idempotencyKey,
          platform: adaptation.platform,
          channelId: config.id,
          publishedAt: result.publishedAt,
          platformId: result.platformId,
          url: result.url,
        });
      } else {
        failed.push(result);
      }
    } catch (err) {
      const error =
        err instanceof Error ? err.message : String(err);
      const result: PublishResult = {
        channelId: config.id,
        platform: adaptation.platform,
        success: false,
        error,
        publishedAt: new Date().toISOString(),
      };
      results.push(result);
      failed.push(result);
    }
  }

  // Log saga summary
  if (failed.length > 0) {
    logger.warn(
      {
        channelId: config.id,
        succeeded: succeeded.map((r) => r.platform),
        failed: failed.map((r) => `${r.platform}: ${r.error}`),
      },
      "Partial publish failure — some platforms succeeded, others failed"
    );
  }

  return results;
}

async function publishOne(
  config: ChannelConfig,
  content: PlatformContent
): Promise<PublishResult> {
  switch (content.platform) {
    case "ghost": {
      const ghostUrl = env.ghostUrl;
      const ghostKey = env.ghostAdminApiKey;
      if (!ghostUrl || !ghostKey) {
        throw new Error(
          "GHOST_URL and GHOST_ADMIN_API_KEY are required for Ghost publishing"
        );
      }
      const target = config.publishTargets.find(
        (t) => t.platform === "ghost"
      );
      return publishToGhost(content, {
        url: (target && "url" in target && target.url) || ghostUrl,
        apiKey: (target && "apiKey" in target && target.apiKey) || ghostKey,
        tags: target && "tags" in target ? target.tags : [],
      });
    }

    case "twitter": {
      if (
        !env.twitterApiKey ||
        !env.twitterApiSecret ||
        !env.twitterAccessToken ||
        !env.twitterAccessSecret
      ) {
        throw new Error("Twitter API credentials are required");
      }
      return publishToTwitter(content, {
        apiKey: env.twitterApiKey,
        apiSecret: env.twitterApiSecret,
        accessToken: env.twitterAccessToken,
        accessSecret: env.twitterAccessSecret,
      });
    }

    case "podcast": {
      if (!env.buzzsproutApiToken || !env.buzzsproutPodcastId) {
        throw new Error("Buzzsprout credentials are required");
      }
      return publishToPodcast(content, {
        provider: "buzzsprout",
        apiToken: env.buzzsproutApiToken,
        podcastId: env.buzzsproutPodcastId,
        elevenLabsApiKey: env.elevenLabsApiKey,
      });
    }

    case "wordpress": {
      const target = config.publishTargets.find(
        (t) => t.platform === "wordpress"
      );
      if (!target || target.platform !== "wordpress") {
        throw new Error("WordPress target not configured");
      }
      const wpUrl = target.url || env.wordpressUrl;
      const wpUser = target.username || env.wordpressUsername;
      const wpPass = target.password || env.wordpressPassword;
      if (!wpUrl || !wpUser || !wpPass) {
        throw new Error(
          "WordPress URL, username, and application password are required"
        );
      }
      return publishToWordPress(content, {
        url: wpUrl,
        username: wpUser,
        password: wpPass,
      });
    }

    default:
      throw new Error(`Unsupported platform: ${content.platform}`);
  }
}
