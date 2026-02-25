import { getDb } from "@ghostwriter/database";
import {
  publications,
  contentArtifacts,
  pipelineRuns,
} from "@ghostwriter/database";
import { eq, and, desc } from "drizzle-orm";
import { createChildLogger } from "@ghostwriter/core";
import type { PublicationHistory, PublishedItem } from "@ghostwriter/core";

const logger = createChildLogger({ module: "monitoring:publication-history" });

/**
 * Query past published headlines + summaries for a channel.
 * Joins publications → pipelineRuns → contentArtifacts (stage=draft) to
 * extract headline and first 200 chars of content.
 */
export async function getPublicationHistory(
  channelId: string,
  limit = 50
): Promise<PublicationHistory> {
  const db = getDb();

  const pubs = await db
    .select({
      pipelineRunId: publications.pipelineRunId,
      publishedAt: publications.publishedAt,
    })
    .from(publications)
    .where(
      and(
        eq(publications.channelId, channelId),
        eq(publications.status, "published")
      )
    )
    .orderBy(desc(publications.publishedAt))
    .limit(limit);

  if (pubs.length === 0) {
    return { channelId, items: [] };
  }

  const items: PublishedItem[] = [];

  for (const pub of pubs) {
    try {
      const artifacts = await db
        .select({ content: contentArtifacts.content })
        .from(contentArtifacts)
        .where(
          and(
            eq(contentArtifacts.pipelineRunId, pub.pipelineRunId),
            eq(contentArtifacts.stage, "draft")
          )
        )
        .orderBy(desc(contentArtifacts.revision))
        .limit(1);

      if (artifacts[0]?.content) {
        const draft = artifacts[0].content as Record<string, unknown>;
        const headline = (draft.headline as string) ?? "Untitled";
        const fullContent = (draft.content as string) ?? "";
        const summary = fullContent.slice(0, 200);

        items.push({
          headline,
          summary,
          publishedAt: pub.publishedAt?.toISOString() ?? "",
        });
      }
    } catch {
      // Non-critical — skip this publication
    }
  }

  logger.info(
    { channelId, historyCount: items.length },
    "Fetched publication history"
  );

  return { channelId, items };
}

/**
 * Format publication history as a string for injection into LLM prompts.
 */
export function formatHistoryForPrompt(history: PublicationHistory): string {
  if (history.items.length === 0) return "";

  const lines = [
    `\nPREVIOUSLY PUBLISHED CONTENT (${history.items.length} items):`,
  ];

  for (const item of history.items) {
    const date = item.publishedAt
      ? ` (${item.publishedAt.slice(0, 10)})`
      : "";
    lines.push(`- "${item.headline}"${date}: ${item.summary}...`);
  }

  return lines.join("\n");
}
