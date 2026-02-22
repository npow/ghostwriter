import { getDb } from "@ghostwriter/database";
import { publications, contentAnalytics } from "@ghostwriter/database";
import { eq, and, isNotNull } from "drizzle-orm";
import { createChildLogger } from "@ghostwriter/core";

const logger = createChildLogger({ module: "monitoring:analytics-sync" });

export interface AnalyticsSnapshot {
  publicationId: string;
  channelId: string;
  platform: string;
  views: number;
  clicks: number;
  shares: number;
  likes: number;
  comments: number;
}

/**
 * Sync analytics from all platforms for published content.
 * Fetches engagement data from Twitter and WordPress APIs, stores in content_analytics.
 */
export async function syncAnalytics(channelId?: string): Promise<number> {
  const db = getDb();

  // Find all successful publications that have a platformId
  const query = channelId
    ? db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.status, "published"),
            eq(publications.channelId, channelId),
            isNotNull(publications.platformId)
          )
        )
    : db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.status, "published"),
            isNotNull(publications.platformId)
          )
        );

  const pubs = await query;
  let synced = 0;

  for (const pub of pubs) {
    try {
      const snapshot = await fetchPlatformAnalytics(pub);
      if (snapshot) {
        await upsertAnalytics(snapshot);
        synced++;
      }
    } catch (err) {
      logger.warn(
        {
          publicationId: pub.id,
          platform: pub.platform,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to sync analytics for publication"
      );
    }
  }

  logger.info({ channelId, synced, total: pubs.length }, "Analytics sync complete");
  return synced;
}

async function fetchPlatformAnalytics(pub: {
  id: string;
  channelId: string;
  platform: string;
  platformId: string | null;
  url: string | null;
}): Promise<AnalyticsSnapshot | null> {
  if (!pub.platformId) return null;

  switch (pub.platform) {
    case "twitter":
      return fetchTwitterAnalytics(pub.id, pub.channelId, pub.platformId);
    case "wordpress":
      return fetchWordPressAnalytics(pub.id, pub.channelId, pub.platformId);
    default:
      return null;
  }
}

/**
 * Fetch tweet analytics from Twitter API v2.
 * Requires OAuth 2.0 with tweet.read scope.
 */
async function fetchTwitterAnalytics(
  publicationId: string,
  channelId: string,
  tweetId: string
): Promise<AnalyticsSnapshot | null> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return null;

  try {
    const response = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      logger.debug(
        { status: response.status, tweetId },
        "Twitter API returned non-200"
      );
      return null;
    }

    const data = (await response.json()) as {
      data: {
        id: string;
        public_metrics: {
          retweet_count: number;
          reply_count: number;
          like_count: number;
          quote_count: number;
          bookmark_count: number;
          impression_count: number;
        };
      };
    };

    const metrics = data.data?.public_metrics;
    if (!metrics) return null;

    return {
      publicationId,
      channelId,
      platform: "twitter",
      views: metrics.impression_count ?? 0,
      clicks: 0, // Not available via public metrics
      shares: (metrics.retweet_count ?? 0) + (metrics.quote_count ?? 0),
      likes: metrics.like_count ?? 0,
      comments: metrics.reply_count ?? 0,
    };
  } catch (err) {
    logger.debug(
      { tweetId, error: err instanceof Error ? err.message : String(err) },
      "Twitter analytics fetch failed"
    );
    return null;
  }
}

/**
 * Fetch post analytics from WordPress REST API.
 * Gets comment count via the comments endpoint (X-WP-Total header).
 * Views are not available in core WordPress REST API — requires Jetpack or
 * WP Statistics plugin with REST extensions.
 */
async function fetchWordPressAnalytics(
  publicationId: string,
  channelId: string,
  postId: string
): Promise<AnalyticsSnapshot | null> {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUser = process.env.WORDPRESS_USERNAME;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;
  if (!wpUrl || !wpUser || !wpPass) return null;

  try {
    const baseUrl = wpUrl.replace(/\/$/, "");
    const credentials = Buffer.from(`${wpUser}:${wpPass}`).toString("base64");
    const authHeader = `Basic ${credentials}`;

    // Fetch comment count via X-WP-Total header
    const commentsResp = await fetch(
      `${baseUrl}/wp-json/wp/v2/comments?post=${postId}&per_page=1`,
      {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(10_000),
      }
    );

    let comments = 0;
    if (commentsResp.ok) {
      comments = parseInt(
        commentsResp.headers.get("X-WP-Total") ?? "0",
        10
      );
    }

    // Try Jetpack Stats if available (optional)
    let views = 0;
    try {
      const statsResp = await fetch(
        `${baseUrl}/wp-json/wpcom/v2/stats/post/${postId}`,
        {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (statsResp.ok) {
        const stats = (await statsResp.json()) as { views?: number };
        views = stats.views ?? 0;
      }
    } catch (err) {
      logger.debug({ postId, error: err instanceof Error ? err.message : String(err) }, "Jetpack Stats not available");
    }

    return {
      publicationId,
      channelId,
      platform: "wordpress",
      views,
      clicks: 0,
      shares: 0,
      likes: 0,
      comments,
    };
  } catch (err) {
    logger.debug(
      { postId, error: err instanceof Error ? err.message : String(err) },
      "WordPress analytics fetch failed"
    );
    return null;
  }
}

/**
 * Insert or update analytics for a publication.
 */
async function upsertAnalytics(snapshot: AnalyticsSnapshot): Promise<void> {
  const db = getDb();

  // Check if analytics entry exists for this publication
  const existing = await db
    .select()
    .from(contentAnalytics)
    .where(eq(contentAnalytics.publicationId, snapshot.publicationId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(contentAnalytics)
      .set({
        views: snapshot.views,
        clicks: snapshot.clicks,
        shares: snapshot.shares,
        likes: snapshot.likes,
        comments: snapshot.comments,
        fetchedAt: new Date(),
      })
      .where(eq(contentAnalytics.publicationId, snapshot.publicationId));
  } else {
    await db.insert(contentAnalytics).values({
      publicationId: snapshot.publicationId,
      channelId: snapshot.channelId,
      platform: snapshot.platform,
      views: snapshot.views,
      clicks: snapshot.clicks,
      shares: snapshot.shares,
      likes: snapshot.likes,
      comments: snapshot.comments,
      fetchedAt: new Date(),
    });
  }
}
