import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getChannelsDir } from "./config.js";
import { logger } from "./logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PatternCategory = "phrase" | "structural" | "stylistic";

export interface LearnedPattern {
  phrase: string;
  category: PatternCategory;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
}

export interface DiscoveredPattern {
  phrase: string;
  category: PatternCategory;
  confidence: number;
  context?: string;
}

interface LearnedPatternsFile {
  version: 1;
  patterns: LearnedPattern[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const FILENAME = "learned-patterns.json";
const CONFIDENCE_THRESHOLD = 0.6;
const DECAY_DAYS = 30;

// ─── Storage ───────────────────────────────────────────────────────────────

function patternsPath(channelId: string): string {
  return join(getChannelsDir(), channelId, FILENAME);
}

export async function loadLearnedPatterns(
  channelId: string
): Promise<LearnedPattern[]> {
  try {
    const raw = await readFile(patternsPath(channelId), "utf-8");
    const file = JSON.parse(raw) as LearnedPatternsFile;
    return file.patterns ?? [];
  } catch {
    return [];
  }
}

export async function saveLearnedPatterns(
  channelId: string,
  patterns: LearnedPattern[]
): Promise<void> {
  const filePath = patternsPath(channelId);
  const dir = join(getChannelsDir(), channelId);
  await mkdir(dir, { recursive: true });

  const file: LearnedPatternsFile = { version: 1, patterns };
  await writeFile(filePath, JSON.stringify(file, null, 2) + "\n", "utf-8");
}

export async function mergeDiscoveredPatterns(
  channelId: string,
  discovered: DiscoveredPattern[]
): Promise<number> {
  if (discovered.length === 0) return 0;

  const existing = await loadLearnedPatterns(channelId);
  const byPhrase = new Map(
    existing.map((p) => [p.phrase.toLowerCase(), p])
  );

  let newCount = 0;
  const now = new Date().toISOString();

  for (const d of discovered) {
    if (d.confidence < CONFIDENCE_THRESHOLD) continue;

    const key = d.phrase.toLowerCase();
    const match = byPhrase.get(key);

    if (match) {
      match.lastSeenAt = now;
      match.occurrences += 1;
      match.confidence = Math.max(match.confidence, d.confidence);
    } else {
      const pattern: LearnedPattern = {
        phrase: d.phrase,
        category: d.category,
        confidence: d.confidence,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: 1,
      };
      byPhrase.set(key, pattern);
      newCount++;
    }
  }

  await saveLearnedPatterns(channelId, [...byPhrase.values()]);

  logger.debug(
    { channelId, newCount, total: byPhrase.size },
    "Merged discovered patterns"
  );

  return newCount;
}

export async function getActivePhrases(
  channelId: string
): Promise<string[]> {
  const patterns = await loadLearnedPatterns(channelId);
  const cutoff = Date.now() - DECAY_DAYS * 24 * 60 * 60 * 1000;

  return patterns
    .filter(
      (p) =>
        p.confidence >= CONFIDENCE_THRESHOLD &&
        new Date(p.lastSeenAt).getTime() >= cutoff
    )
    .map((p) => p.phrase);
}
