import type {
  ChannelConfig,
  PlatformContent,
  PublishResult,
  PublishTarget,
} from "@auto-blogger/core";
import {
  env,
  createChildLogger,
  getConnection,
  resolveTargetId,
} from "@auto-blogger/core";
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
 * Uses targetId on each PlatformContent to match to the correct publish target
 * and resolve credentials (from channel config, connections store, or env vars).
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

  // Build a lookup of targets by their resolved ID
  const targetMap = new Map<string, PublishTarget>();
  for (let i = 0; i < config.publishTargets.length; i++) {
    const target = config.publishTargets[i];
    const id = resolveTargetId(target, i);
    targetMap.set(id, target);
  }

  const results: PublishResult[] = [];
  const succeeded: PublishResult[] = [];
  const failed: PublishResult[] = [];

  // Publish sequentially to maintain saga ordering
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
        { platform: adaptation.platform, targetId: adaptation.targetId, idempotencyKey },
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

    // Find the matching target for this adaptation
    const target = adaptation.targetId
      ? targetMap.get(adaptation.targetId)
      : config.publishTargets.find((t) => t.platform === adaptation.platform);

    if (!target) {
      const result: PublishResult = {
        channelId: config.id,
        platform: adaptation.platform,
        success: false,
        error: `No publish target found for targetId="${adaptation.targetId}"`,
        publishedAt: new Date().toISOString(),
      };
      results.push(result);
      failed.push(result);
      continue;
    }

    try {
      const result = await publishOne(target, adaptation);
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

/**
 * Publish to a single target. Resolves credentials from:
 * 1. The target config itself (inline in channel YAML)
 * 2. The connections store (~/.auto-blogger/connections.json)
 * 3. Environment variables (fallback)
 */
async function publishOne(
  target: PublishTarget,
  content: PlatformContent
): Promise<PublishResult> {
  switch (target.platform) {
    case "ghost": {
      const conn = target.id
        ? await getConnection(target.id, "ghost")
        : undefined;
      const ghostUrl =
        target.url ?? conn?.url ?? conn?.credentials?.url ?? env.ghostUrl;
      const ghostKey =
        target.apiKey ??
        conn?.credentials?.apiKey ??
        env.ghostAdminApiKey;
      if (!ghostUrl || !ghostKey) {
        throw new Error(
          "Ghost credentials missing — run: auto_blogger connect ghost"
        );
      }
      return publishToGhost(content, {
        url: ghostUrl,
        apiKey: ghostKey,
        tags: target.tags ?? [],
      });
    }

    case "twitter": {
      const conn = target.id
        ? await getConnection(target.id, "twitter")
        : undefined;
      const apiKey = conn?.credentials?.apiKey ?? env.twitterApiKey;
      const apiSecret = conn?.credentials?.apiSecret ?? env.twitterApiSecret;
      const accessToken =
        conn?.credentials?.accessToken ?? env.twitterAccessToken;
      const accessSecret =
        conn?.credentials?.accessSecret ?? env.twitterAccessSecret;
      if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        throw new Error(
          "Twitter credentials missing — run: auto_blogger connect twitter"
        );
      }
      return publishToTwitter(content, {
        apiKey,
        apiSecret,
        accessToken,
        accessSecret,
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
      const conn = target.id
        ? await getConnection(target.id, "wordpress")
        : undefined;
      const wpUrl =
        target.url ?? conn?.url ?? conn?.credentials?.url ?? env.wordpressUrl;
      const wpUser =
        target.username ??
        conn?.credentials?.username ??
        env.wordpressUsername;
      const wpPass =
        target.password ??
        conn?.credentials?.password ??
        env.wordpressPassword;
      if (!wpUrl || !wpUser || !wpPass) {
        throw new Error(
          "WordPress credentials missing — run: auto_blogger connect wordpress"
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
