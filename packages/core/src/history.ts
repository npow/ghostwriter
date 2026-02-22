import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getChannelsDir } from "./config.js";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger({ module: "core:history" });

const MAX_HISTORY_ENTRIES = 50;

export interface ArticleHistoryEntry {
  headline: string;
  summary: string;
  topics: string[];
  publishedAt: string;
}

function historyPath(channelId: string): string {
  return join(getChannelsDir(), channelId, "history.json");
}

/**
 * Load article history for a channel. Returns empty array if no history exists.
 */
export async function loadHistory(
  channelId: string
): Promise<ArticleHistoryEntry[]> {
  try {
    const raw = await readFile(historyPath(channelId), "utf-8");
    return JSON.parse(raw) as ArticleHistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * Append an entry to the channel's article history, capping at MAX_HISTORY_ENTRIES.
 */
export async function appendHistory(
  channelId: string,
  entry: ArticleHistoryEntry
): Promise<void> {
  const entries = await loadHistory(channelId);
  entries.push(entry);

  // Keep only the most recent entries
  const trimmed =
    entries.length > MAX_HISTORY_ENTRIES
      ? entries.slice(entries.length - MAX_HISTORY_ENTRIES)
      : entries;

  const filePath = historyPath(channelId);
  await mkdir(join(getChannelsDir(), channelId), { recursive: true });
  await writeFile(filePath, JSON.stringify(trimmed, null, 2) + "\n");
  logger.info(
    { channelId, totalEntries: trimmed.length },
    "Article history updated"
  );
}

/**
 * Format history entries into a prompt block instructing the LLM to avoid repetition.
 */
export function formatHistoryForPrompt(
  entries: ArticleHistoryEntry[]
): string {
  if (entries.length === 0) return "";

  const lines = entries.map(
    (e) => `- "${e.headline}" (${e.publishedAt}): ${e.summary}`
  );

  return `DO NOT REPEAT — Previously published articles:
${lines.join("\n")}

You MUST choose a different angle, topic, or focus than the articles listed above. Do not reuse their headlines, structures, or primary arguments.`;
}
