import type {
  ChannelConfig,
  PlatformContent,
  PublishResult,
} from "@auto-blogger/core";
import { env, createChildLogger } from "@auto-blogger/core";
import { publishToGhost } from "./adapters/ghost.js";
import { publishToTwitter } from "./adapters/twitter.js";
import { publishToPodcast } from "./adapters/podcast.js";

const logger = createChildLogger({ module: "publishing" });

/**
 * Publish adapted content to all target platforms.
 */
export async function publishAll(
  config: ChannelConfig,
  adaptations: PlatformContent[]
): Promise<PublishResult[]> {
  logger.info(
    { channelId: config.id, platforms: adaptations.length },
    "Starting publishing"
  );

  const results = await Promise.allSettled(
    adaptations.map((adaptation) => publishOne(config, adaptation))
  );

  return results.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const error =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

    return {
      channelId: config.id,
      platform: adaptations[idx].platform,
      success: false,
      error,
      publishedAt: new Date().toISOString(),
    };
  });
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

    default:
      throw new Error(`Unsupported platform: ${content.platform}`);
  }
}
