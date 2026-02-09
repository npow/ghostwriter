import type { SourceMaterial } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "data-ingestion:api" });

export interface ApiProviderConfig {
  provider: string;
  endpoint: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  rateLimit?: { requestsPerMinute: number };
}

/**
 * Fetch data from an API endpoint and return normalized source materials.
 */
export async function fetchApiData(
  config: ApiProviderConfig,
  channelId: string
): Promise<SourceMaterial[]> {
  const url = new URL(config.endpoint);

  if (config.params) {
    for (const [key, value] of Object.entries(config.params)) {
      url.searchParams.set(key, value);
    }
  }

  logger.info(
    { provider: config.provider, url: url.toString() },
    "Fetching API data"
  );

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      ...config.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Normalize based on common API response shapes
  const items = normalizeApiResponse(data, config.provider);

  return items.map((item, idx) => ({
    id: `${channelId}-api-${config.provider}-${Date.now()}-${idx}`,
    sourceType: "api" as const,
    provider: config.provider,
    title: item.title,
    content: JSON.stringify(item.data, null, 2),
    url: item.url,
    publishedAt: item.publishedAt,
    metadata: item.metadata ?? {},
    fetchedAt: new Date().toISOString(),
  }));
}

interface NormalizedItem {
  title?: string;
  data: unknown;
  url?: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

function normalizeApiResponse(
  data: unknown,
  provider: string
): NormalizedItem[] {
  // Provider-specific normalizers
  switch (provider) {
    case "polygon":
      return normalizePolygon(data);
    case "spoonacular":
      return normalizeSpoonacular(data);
    default:
      return normalizeGeneric(data);
  }
}

function normalizePolygon(data: unknown): NormalizedItem[] {
  const d = data as Record<string, unknown>;
  const results = (d.results ?? d.tickers ?? [d]) as Record<string, unknown>[];

  return results.map((r) => ({
    title: (r.T as string) ?? (r.ticker as string) ?? "Market Data",
    data: r,
    metadata: { queryCount: d.queryCount, resultsCount: d.resultsCount },
  }));
}

function normalizeSpoonacular(data: unknown): NormalizedItem[] {
  const d = data as Record<string, unknown>;
  const results = (d.results ?? d.recipes ?? [d]) as Record<string, unknown>[];

  return results.map((r) => ({
    title: r.title as string,
    data: r,
    url: r.sourceUrl as string,
    metadata: { servings: r.servings, readyInMinutes: r.readyInMinutes },
  }));
}

function normalizeGeneric(data: unknown): NormalizedItem[] {
  if (Array.isArray(data)) {
    return data.map((item) => ({ data: item }));
  }
  return [{ data }];
}
