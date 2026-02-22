import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "publishing:idempotency" });

export interface PublishRecord {
  idempotencyKey: string;
  platform: string;
  channelId: string;
  publishedAt: string;
  platformId?: string;
  url?: string;
}

interface IdempotencyFile {
  records: Record<string, PublishRecord>;
}

function getIdempotencyPath(): string {
  const home =
    process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  return join(home, ".auto-blogger", "idempotency.json");
}

async function loadRecords(): Promise<Record<string, PublishRecord>> {
  const path = getIdempotencyPath();
  try {
    const data = await readFile(path, "utf-8");
    const parsed = JSON.parse(data) as IdempotencyFile;
    return parsed.records ?? {};
  } catch {
    return {};
  }
}

async function saveRecords(
  records: Record<string, PublishRecord>
): Promise<void> {
  const path = getIdempotencyPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ records } as IdempotencyFile, null, 2),
    "utf-8"
  );
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
export async function isAlreadyPublished(
  idempotencyKey: string
): Promise<boolean> {
  const records = await loadRecords();
  return idempotencyKey in records;
}

/**
 * Get the previous publish record for this content.
 */
export async function getPreviousPublish(
  idempotencyKey: string
): Promise<PublishRecord | undefined> {
  const records = await loadRecords();
  return records[idempotencyKey];
}

/**
 * Record a successful publish for idempotency.
 */
export async function recordPublish(
  idempotencyKey: string,
  record: PublishRecord
): Promise<void> {
  const records = await loadRecords();
  records[idempotencyKey] = record;
  await saveRecords(records);
  logger.debug(
    { idempotencyKey, platform: record.platform },
    "Recorded publish for idempotency"
  );
}

/**
 * Clear publish records (for testing or forced re-publish).
 */
export async function clearPublishRecords(): Promise<void> {
  await saveRecords({});
}
