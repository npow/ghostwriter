import type { DataSource, SourceMaterial } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import { fetchApiData } from "./providers/api.js";
import { fetchRssData } from "./providers/rss.js";
import { fetchScrapeData } from "./providers/scrape.js";

const logger = createChildLogger({ module: "data-ingestion" });

/**
 * Ingest data from all configured sources for a channel.
 * Fetches from each source in parallel and returns all materials.
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
    dataSources.map((source) => fetchSource(channelId, source))
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

  logger.info(
    { channelId, materialCount: materials.length },
    "Data ingestion complete"
  );

  return materials;
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
