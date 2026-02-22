import type {
  ChannelConfig,
  PlatformContent,
  PublishResult,
  PublishTarget,
} from "@ghostwriter/core";
import {
  env,
  createChildLogger,
  getConnection,
  resolveTargetId,
} from "@ghostwriter/core";
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
    if (!options?.force && await isAlreadyPublished(idempotencyKey)) {
      const prev = await getPreviousPublish(idempotencyKey);
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
        await recordPublish(idempotencyKey, {
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
 * 2. The connections store (~/.ghostwriter/connections.json)
 * 3. Environment variables (fallback)
 */
async function publishOne(
  target: PublishTarget,
  content: PlatformContent
): Promise<PublishResult> {
  switch (target.platform) {
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
          "Twitter credentials missing — run: ghostwriter connect twitter"
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
      // Try both platform types when looking up connection
      const conn = target.id
        ? ((await getConnection(target.id, "wordpress")) ??
          (await getConnection(target.id, "wordpress-com")))
        : undefined;

      // WordPress.com OAuth: use bearer token + WP.com API
      if (conn?.credentials?.token) {
        const siteId = (conn.url ?? "")
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "");
        const resp = await fetch(
          `https://public-api.wordpress.com/wp/v2/sites/${siteId}/posts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${conn.credentials.token}`,
            },
            body: JSON.stringify({
              title:
                (content.metadata?.headline as string) ?? "Untitled Post",
              content: content.content,
              status: "publish",
            }),
            signal: AbortSignal.timeout(30_000),
          }
        );
        if (!resp.ok) {
          const errorBody = await resp.text();
          throw new Error(
            `WordPress.com API error ${resp.status}: ${errorBody}`
          );
        }
        const post = (await resp.json()) as { id: number; link: string };
        return {
          channelId: content.channelId,
          platform: "wordpress",
          success: true,
          url: post.link,
          platformId: String(post.id),
          publishedAt: new Date().toISOString(),
        };
      }

      // Existing basic auth path (self-hosted WordPress)
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
          "WordPress credentials missing — run: ghostwriter connect wordpress"
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
