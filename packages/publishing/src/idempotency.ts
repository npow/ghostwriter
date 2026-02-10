import { createHash } from "node:crypto";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "publishing:idempotency" });

/**
 * In-memory idempotency store (would use Redis/DB in production).
 * Tracks which content has been published to which platforms.
 */
const publishedSet = new Map<string, PublishRecord>();

interface PublishRecord {
  idempotencyKey: string;
  platform: string;
  channelId: string;
  publishedAt: string;
  platformId?: string;
  url?: string;
}

/**
 * Generate an idempotency key from content + platform.
 * Same content to same platform = same key = skip.
 */
export function generateIdempotencyKey(
  channelId: string,
  platform: string,
  content: string
): string {
  const hash = createHash("sha256")
    .update(`${channelId}:${platform}:${content}`)
    .digest("hex")
    .slice(0, 24);
  return `pub-${channelId}-${platform}-${hash}`;
}

/**
 * Check if this content has already been published to this platform.
 */
export function isAlreadyPublished(idempotencyKey: string): boolean {
  return publishedSet.has(idempotencyKey);
}

/**
 * Get the previous publish record for this content.
 */
export function getPreviousPublish(
  idempotencyKey: string
): PublishRecord | undefined {
  return publishedSet.get(idempotencyKey);
}

/**
 * Record a successful publish for idempotency.
 */
export function recordPublish(
  idempotencyKey: string,
  record: PublishRecord
): void {
  publishedSet.set(idempotencyKey, record);
  logger.debug({ idempotencyKey, platform: record.platform }, "Recorded publish for idempotency");
}

/**
 * Clear publish records (for testing or forced re-publish).
 */
export function clearPublishRecords(): void {
  publishedSet.clear();
}
