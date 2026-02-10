import type { DataSource, SourceMaterial } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import { fetchApiData } from "./providers/api.js";
import { fetchRssData } from "./providers/rss.js";
import { fetchScrapeData } from "./providers/scrape.js";
import { getCached, setCached, isDuplicate, markSeen } from "./cache.js";

const logger = createChildLogger({ module: "data-ingestion" });

/**
 * Ingest data from all configured sources for a channel.
 * Fetches from each source in parallel with caching and deduplication.
 */
export async function ingestData(
  channelId: string,
  dataSources: DataSource[]
): Promise<SourceMaterial[]> {
  logger.info(
    { channelId, sourceCount: dataSources.length },
    "Starting data ingestion"
  );

  const results = await Promise.allSettled(
    dataSources.map((source) => fetchSourceWithCache(channelId, source))
  );

  const materials: SourceMaterial[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      materials.push(...result.value);
    } else {
      logger.error({ error: result.reason }, "Data source fetch failed");
    }
  }

  if (materials.length === 0) {
    throw new Error(
      `No data ingested for channel "${channelId}" from ${dataSources.length} sources`
    );
  }

  // Deduplicate: skip materials we've already processed recently
  const fresh: SourceMaterial[] = [];
  for (const material of materials) {
    const dup = await isDuplicate(channelId, material.content);
    if (dup) {
      logger.debug(
        { provider: material.provider, title: material.title },
        "Skipping duplicate source material"
      );
      continue;
    }
    await markSeen(channelId, material.content);
    fresh.push(material);
  }

  // If all materials were duplicates, use them anyway (better than nothing)
  const final = fresh.length > 0 ? fresh : materials;

  logger.info(
    {
      channelId,
      totalFetched: materials.length,
      afterDedup: fresh.length,
      used: final.length,
    },
    "Data ingestion complete"
  );

  return final;
}

async function fetchSourceWithCache(
  channelId: string,
  source: DataSource
): Promise<SourceMaterial[]> {
  // Build a cache identifier from the source config
  const cacheId = buildCacheId(source);

  // Check cache first
  const cached = await getCached<SourceMaterial[]>(source.type, cacheId);
  if (cached) {
    logger.info(
      { type: source.type, cacheId: cacheId.slice(0, 50) },
      "Using cached source data"
    );
    return cached;
  }

  // Fetch fresh data
  const materials = await fetchSource(channelId, source);

  // Cache the result
  await setCached(source.type, cacheId, materials);

  return materials;
}

function buildCacheId(source: DataSource): string {
  switch (source.type) {
    case "api":
      return `${source.provider}:${source.endpoint}:${JSON.stringify(source.params ?? {})}`;
    case "rss":
      return source.url;
    case "scrape":
      return `${source.url}:${source.selector}`;
  }
}

async function fetchSource(
  channelId: string,
  source: DataSource
): Promise<SourceMaterial[]> {
  switch (source.type) {
    case "api":
      return fetchApiData(
        {
          provider: source.provider,
          endpoint: source.endpoint,
          headers: source.headers,
          params: source.params,
          rateLimit: source.rateLimit,
        },
        channelId
      );

    case "rss":
      return fetchRssData(
        {
          url: source.url,
          maxItems: source.maxItems,
        },
        channelId
      );

    case "scrape":
      return fetchScrapeData(
        {
          url: source.url,
          selector: source.selector,
          dynamic: source.dynamic,
          waitFor: source.waitFor,
        },
        channelId
      );
  }
}
