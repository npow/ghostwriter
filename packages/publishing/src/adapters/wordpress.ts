import type { PlatformContent, PublishResult } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "publishing:wordpress" });

export interface WordPressConfig {
  url: string;
  username: string;
  password: string; // Application password (not account password)
  defaultStatus?: "publish" | "draft" | "pending";
}

interface WpPost {
  id: number;
  link: string;
  status: string;
}

interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

/**
 * Publish content to WordPress via the REST API (v2).
 * Uses Application Passwords for authentication.
 * https://developer.wordpress.org/rest-api/reference/posts/
 */
export async function publishToWordPress(
  content: PlatformContent,
  config: WordPressConfig
): Promise<PublishResult> {
  logger.info({ channelId: content.channelId }, "Publishing to WordPress");

  try {
    const baseUrl = config.url.replace(/\/$/, "");
    const authHeader = buildAuthHeader(config.username, config.password);

    const headline =
      (content.metadata?.headline as string) ?? "Untitled Post";
    const tags = (content.metadata?.tags as string[]) ?? [];
    const excerpt = (content.metadata?.excerpt as string) ?? "";
    const slug = (content.metadata?.slug as string) ?? "";

    // Resolve category IDs from tag names (WordPress uses categories/tags as IDs)
    const categoryIds = await resolveCategories(baseUrl, authHeader, tags);
    const tagIds = await resolveTags(baseUrl, authHeader, tags);

    const body: Record<string, unknown> = {
      title: headline,
      content: content.content,
      status: config.defaultStatus ?? "publish",
      format: "standard",
    };

    if (excerpt) body.excerpt = excerpt;
    if (slug) body.slug = slug;
    if (categoryIds.length > 0) body.categories = categoryIds;
    if (tagIds.length > 0) body.tags = tagIds;

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `WordPress API error ${response.status}: ${errorBody}`
      );
    }

    const post = (await response.json()) as WpPost;

    logger.info(
      { postId: post.id, url: post.link },
      "WordPress post published"
    );

    return {
      channelId: content.channelId,
      platform: "wordpress",
      success: true,
      url: post.link,
      platformId: String(post.id),
      publishedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "WordPress publish failed");

    return {
      channelId: content.channelId,
      platform: "wordpress",
      success: false,
      error: message,
      publishedAt: new Date().toISOString(),
    };
  }
}

/**
 * Update an existing WordPress post.
 */
export async function updateWordPressPost(
  config: WordPressConfig,
  postId: string,
  updates: { title?: string; content?: string; status?: string }
): Promise<boolean> {
  const baseUrl = config.url.replace(/\/$/, "");
  const authHeader = buildAuthHeader(config.username, config.password);

  const response = await fetch(
    `${baseUrl}/wp-json/wp/v2/posts/${postId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(15_000),
    }
  );

  return response.ok;
}

/**
 * Fetch analytics for a WordPress post.
 * Uses the post endpoint to get comment_count. Views require a plugin
 * (e.g., Jetpack Stats or WP Statistics) — not available in core REST API.
 */
export async function getWordPressPostStats(
  config: WordPressConfig,
  postId: string
): Promise<{ comments: number } | null> {
  const baseUrl = config.url.replace(/\/$/, "");
  const authHeader = buildAuthHeader(config.username, config.password);

  try {
    const response = await fetch(
      `${baseUrl}/wp-json/wp/v2/posts/${postId}?_fields=id,comment_count`,
      {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) return null;

    // WordPress REST API doesn't include comment_count by default,
    // so we fetch comments separately
    const commentsResp = await fetch(
      `${baseUrl}/wp-json/wp/v2/comments?post=${postId}&per_page=1`,
      {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!commentsResp.ok) return null;

    // Total count is in the X-WP-Total header
    const totalComments = parseInt(
      commentsResp.headers.get("X-WP-Total") ?? "0",
      10
    );

    return { comments: totalComments };
  } catch {
    return null;
  }
}

function buildAuthHeader(username: string, password: string): string {
  const credentials = Buffer.from(`${username}:${password}`).toString(
    "base64"
  );
  return `Basic ${credentials}`;
}

/**
 * Resolve tag names to WordPress tag IDs, creating tags that don't exist.
 */
async function resolveTags(
  baseUrl: string,
  authHeader: string,
  tagNames: string[]
): Promise<number[]> {
  if (tagNames.length === 0) return [];

  const ids: number[] = [];

  for (const name of tagNames) {
    try {
      // Search for existing tag
      const searchResp = await fetch(
        `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=1`,
        {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (searchResp.ok) {
        const tags = (await searchResp.json()) as Array<{ id: number; name: string }>;
        const match = tags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase()
        );

        if (match) {
          ids.push(match.id);
          continue;
        }
      }

      // Create new tag
      const createResp = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(10_000),
      });

      if (createResp.ok) {
        const created = (await createResp.json()) as { id: number };
        ids.push(created.id);
      }
    } catch {
      // Skip tags that fail — non-critical
    }
  }

  return ids;
}

/**
 * Resolve tag names to WordPress category IDs.
 * Only matches existing categories — doesn't create new ones.
 */
async function resolveCategories(
  baseUrl: string,
  authHeader: string,
  tagNames: string[]
): Promise<number[]> {
  if (tagNames.length === 0) return [];

  try {
    const resp = await fetch(
      `${baseUrl}/wp-json/wp/v2/categories?per_page=100`,
      {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!resp.ok) return [];

    const categories = (await resp.json()) as WpCategory[];
    const ids: number[] = [];

    for (const name of tagNames) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
      if (match) ids.push(match.id);
    }

    return ids;
  } catch {
    return [];
  }
}
