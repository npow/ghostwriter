import Parser from "rss-parser";
import type { SourceMaterial } from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { withRetry, getCircuitBreaker } from "../retry.js";

const logger = createChildLogger({ module: "data-ingestion:rss" });
const parser = new Parser({ timeout: 15_000 });

export interface RssProviderConfig {
  url: string;
  maxItems: number;
}

/**
 * Fetch and parse RSS feed with retry and circuit breaking.
 */
export async function fetchRssData(
  config: RssProviderConfig,
  channelId: string
): Promise<SourceMaterial[]> {
  logger.info({ url: config.url }, "Fetching RSS feed");

  const domain = extractDomain(config.url);
  const cb = getCircuitBreaker(domain);
  const feed = await cb.execute(
    () => withRetry(
      () => parser.parseURL(config.url),
      `rss:${domain}`,
      { maxAttempts: 3, initialDelayMs: 2000 }
    ),
    `rss:${domain}`
  );

  const items = (feed.items ?? []).slice(0, config.maxItems);

  return items.map((item, idx) => {
    const content = item.contentSnippet ?? item.content ?? item.summary ?? "";
    const engagementScore = extractEngagementSignal(content, domain);
    return {
      id: `${channelId}-rss-${Date.now()}-${idx}`,
      sourceType: "rss" as const,
      provider: extractDomain(config.url),
      title: item.title ?? undefined,
      content,
      url: item.link ?? undefined,
      publishedAt: item.pubDate ?? item.isoDate ?? undefined,
      metadata: {
        creator: item.creator,
        categories: item.categories,
        guid: item.guid,
        ...(engagementScore != null ? { engagementScore } : {}),
      },
      fetchedAt: new Date().toISOString(),
    };
  });
}

/**
 * Extract engagement signal from RSS content.
 * Recognizes HN points ("N points") and Reddit scores from known domains.
 */
function extractEngagementSignal(
  content: string,
  domain: string
): number | null {
  // Hacker News: "Points: 123" or "123 points"
  if (domain.includes("hnrss") || domain.includes("news.ycombinator")) {
    const match =
      content.match(/Points:\s*(\d+)/i) ??
      content.match(/(\d+)\s+points/i);
    if (match) return parseInt(match[1], 10);
  }

  // Reddit: score often appears in content or title as "[score hidden]" or as a number
  if (domain.includes("reddit.com")) {
    const match = content.match(/(?:score|points|upvotes)[\s:]*(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}
