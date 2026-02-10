import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";
import { createHash } from "node:crypto";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "data-ingestion:cache" });

let _redis: RedisType | null = null;

export function getRedis(): RedisType {
  if (!_redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    _redis = new (Redis as unknown as new (...args: unknown[]) => RedisType)(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    _redis.on("error", (err: Error) => {
      logger.warn({ error: err.message }, "Redis connection error (caching disabled)");
    });
  }
  return _redis;
}

/**
 * Default TTLs per source type (in seconds).
 */
const DEFAULT_TTL: Record<string, number> = {
  api: 12 * 3600,    // 12 hours — API data refreshes periodically
  rss: 6 * 3600,     // 6 hours  — RSS feeds update frequently
  scrape: 24 * 3600, // 24 hours — web pages change slowly
};

/**
 * Content hash for deduplication.
 */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Build a cache key from source config.
 */
function cacheKey(sourceType: string, identifier: string): string {
  return `auto-blogger:source:${sourceType}:${contentHash(identifier)}`;
}

/**
 * Try to get cached data. Returns null on miss or Redis failure.
 */
export async function getCached<T>(
  sourceType: string,
  identifier: string
): Promise<T | null> {
  try {
    const redis = getRedis();
    const key = cacheKey(sourceType, identifier);
    const data = await redis.get(key);

    if (data) {
      logger.debug({ key, sourceType }, "Cache hit");
      return JSON.parse(data) as T;
    }

    logger.debug({ key, sourceType }, "Cache miss");
    return null;
  } catch {
    // Cache failure is non-fatal — just fetch fresh
    return null;
  }
}

/**
 * Store data in cache with TTL. Fails silently.
 */
export async function setCached<T>(
  sourceType: string,
  identifier: string,
  data: T,
  ttlSeconds?: number
): Promise<void> {
  try {
    const redis = getRedis();
    const key = cacheKey(sourceType, identifier);
    const ttl = ttlSeconds ?? DEFAULT_TTL[sourceType] ?? 6 * 3600;

    await redis.setex(key, ttl, JSON.stringify(data));
    logger.debug({ key, ttl }, "Cached data");
  } catch {
    // Cache failure is non-fatal
  }
}

/**
 * Check if content has been seen before (dedup).
 * Returns true if this exact content was already ingested within the TTL window.
 */
export async function isDuplicate(
  channelId: string,
  content: string
): Promise<boolean> {
  try {
    const redis = getRedis();
    const hash = contentHash(content);
    const key = `auto-blogger:dedup:${channelId}:${hash}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } catch {
    return false;
  }
}

/**
 * Mark content as seen for dedup purposes.
 */
export async function markSeen(
  channelId: string,
  content: string,
  ttlSeconds = 48 * 3600 // 48h dedup window
): Promise<void> {
  try {
    const redis = getRedis();
    const hash = contentHash(content);
    const key = `auto-blogger:dedup:${channelId}:${hash}`;
    await redis.setex(key, ttlSeconds, "1");
  } catch {
    // Non-fatal
  }
}

/**
 * Close Redis connection (for cleanup).
 */
export async function closeCache(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
