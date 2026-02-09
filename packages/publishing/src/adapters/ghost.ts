import type { PlatformContent, PublishResult } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import GhostAdminAPI from "@tryghost/admin-api";

const logger = createChildLogger({ module: "publishing:ghost" });

export interface GhostConfig {
  url: string;
  apiKey: string;
  tags?: string[];
  newsletter?: boolean;
}

/**
 * Publish content to Ghost CMS.
 */
export async function publishToGhost(
  content: PlatformContent,
  config: GhostConfig
): Promise<PublishResult> {
  logger.info({ channelId: content.channelId }, "Publishing to Ghost");

  try {
    const api = new GhostAdminAPI({
      url: config.url,
      key: config.apiKey,
      version: "v5.0",
    });

    const headline =
      (content.metadata?.headline as string) ?? "Untitled Post";
    const tags = (content.metadata?.tags as string[]) ?? config.tags ?? [];

    const post = await api.posts.add(
      {
        title: headline,
        html: markdownToHtml(content.content),
        status: "published",
        tags: tags.map((t: string) => ({ name: t })),
      },
      { source: "html" }
    );

    logger.info({ postId: post.id, url: post.url }, "Ghost post published");

    return {
      channelId: content.channelId,
      platform: "ghost",
      success: true,
      url: post.url,
      platformId: post.id,
      publishedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "Ghost publish failed");

    return {
      channelId: content.channelId,
      platform: "ghost",
      success: false,
      error: message,
      publishedAt: new Date().toISOString(),
    };
  }
}

/**
 * Simple markdown to HTML conversion for Ghost.
 * Ghost accepts HTML in the mobiledoc format.
 */
function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)/, "<p>")
    .replace(/(?!>)$/, "</p>");
}
