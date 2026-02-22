import type { PlatformContent, PublishResult } from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { TwitterApi } from "twitter-api-v2";

const logger = createChildLogger({ module: "publishing:twitter" });

export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

/**
 * Post content to Twitter/X as a thread or single tweet.
 */
export async function publishToTwitter(
  content: PlatformContent,
  config: TwitterConfig
): Promise<PublishResult> {
  logger.info(
    { channelId: content.channelId, format: content.format },
    "Publishing to Twitter"
  );

  try {
    const client = new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessSecret,
    });

    const readWrite = client.readWrite;

    if (content.format === "single") {
      const tweet = await readWrite.v2.tweet(content.content.slice(0, 280));
      return {
        channelId: content.channelId,
        platform: "twitter",
        success: true,
        platformId: tweet.data.id,
        publishedAt: new Date().toISOString(),
      };
    }

    // Thread: split on --- separator
    const tweets = content.content
      .split("---")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => t.slice(0, 280));

    if (tweets.length === 0) {
      throw new Error("No tweets to post");
    }

    // Post first tweet
    const first = await readWrite.v2.tweet(tweets[0]);
    let lastTweetId = first.data.id;

    // Reply chain for remaining tweets
    for (let i = 1; i < tweets.length; i++) {
      const reply = await readWrite.v2.reply(tweets[i], lastTweetId);
      lastTweetId = reply.data.id;
    }

    logger.info(
      { tweetCount: tweets.length, firstId: first.data.id },
      "Twitter thread posted"
    );

    return {
      channelId: content.channelId,
      platform: "twitter",
      success: true,
      platformId: first.data.id,
      url: `https://twitter.com/i/status/${first.data.id}`,
      publishedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "Twitter publish failed");

    return {
      channelId: content.channelId,
      platform: "twitter",
      success: false,
      error: message,
      publishedAt: new Date().toISOString(),
    };
  }
}
