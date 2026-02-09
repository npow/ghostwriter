import Parser from "rss-parser";
import type { SourceMaterial } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "data-ingestion:rss" });
const parser = new Parser();

export interface RssProviderConfig {
  url: string;
  maxItems: number;
}

/**
 * Fetch and parse RSS feed, returning normalized source materials.
 */
export async function fetchRssData(
  config: RssProviderConfig,
  channelId: string
): Promise<SourceMaterial[]> {
  logger.info({ url: config.url }, "Fetching RSS feed");

  const feed = await parser.parseURL(config.url);

  const items = (feed.items ?? []).slice(0, config.maxItems);

  return items.map((item, idx) => ({
    id: `${channelId}-rss-${Date.now()}-${idx}`,
    sourceType: "rss" as const,
    provider: extractDomain(config.url),
    title: item.title ?? undefined,
    content: item.contentSnippet ?? item.content ?? item.summary ?? "",
    url: item.link ?? undefined,
    publishedAt: item.pubDate ?? item.isoDate ?? undefined,
    metadata: {
      creator: item.creator,
      categories: item.categories,
      guid: item.guid,
    },
    fetchedAt: new Date().toISOString(),
  }));
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}
