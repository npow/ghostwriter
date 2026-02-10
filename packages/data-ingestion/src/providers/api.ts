import type { SourceMaterial } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import { withRetry, getRateLimiter, getCircuitBreaker } from "../retry.js";

const logger = createChildLogger({ module: "data-ingestion:api" });

export interface ApiProviderConfig {
  provider: string;
  endpoint: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  rateLimit?: { requestsPerMinute: number };
}

/**
 * Fetch data from an API endpoint with retry, rate limiting, and circuit breaking.
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

  // Apply rate limiting
  const limiter = getRateLimiter(
    config.provider,
    config.rateLimit?.requestsPerMinute ?? 60
  );
  await limiter.acquire();

  // Execute with circuit breaker and retry
  const cb = getCircuitBreaker(config.provider);
  const data = await cb.execute(
    () =>
      withRetry(
        async () => {
          const response = await fetch(url.toString(), {
            headers: {
              Accept: "application/json",
              ...config.headers,
            },
            signal: AbortSignal.timeout(30_000),
          });

          if (response.status === 429) {
            const retryAfter = response.headers.get("retry-after");
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
            logger.warn(
              { provider: config.provider, waitMs },
              "Rate limited, will retry"
            );
            throw new Error(`Rate limited (429) — retry after ${waitMs}ms`);
          }

          if (!response.ok) {
            throw new Error(
              `API request failed: ${response.status} ${response.statusText}`
            );
          }

          return response.json();
        },
        `api:${config.provider}`,
        { maxAttempts: 3, initialDelayMs: 2000 }
      ),
    `api:${config.provider}`
  );

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
