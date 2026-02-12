import Parser from "rss-parser";

const parser = new Parser({ timeout: 10_000 });

export interface RssValidationResult {
  valid: boolean;
  title?: string;
  itemCount?: number;
  error?: string;
}

/**
 * Validate an RSS feed URL by fetching and attempting to parse it.
 * Returns whether the feed is valid and basic info about it.
 */
export async function validateRssFeed(url: string): Promise<RssValidationResult> {
  try {
    const feed = await parser.parseURL(url);
    return {
      valid: true,
      title: feed.title,
      itemCount: feed.items?.length ?? 0,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
