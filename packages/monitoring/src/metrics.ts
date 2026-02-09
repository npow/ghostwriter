import { getDb } from "@auto-blogger/database";
import { pipelineRuns, publications, contentAnalytics } from "@auto-blogger/database";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "monitoring" });

export interface ChannelMetrics {
  channelId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgCost: number;
  totalCost: number;
  avgScores: Record<string, number>;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  publicationCount: number;
}

export interface SystemMetrics {
  totalChannels: number;
  totalRuns: number;
  successRate: number;
  totalCost: number;
  channelMetrics: ChannelMetrics[];
}

/**
 * Get metrics for a specific channel.
 */
export async function getChannelMetrics(
  channelId: string
): Promise<ChannelMetrics> {
  const db = getDb();

  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.channelId, channelId))
    .orderBy(desc(pipelineRuns.startedAt));

  const pubs = await db
    .select()
    .from(publications)
    .where(eq(publications.channelId, channelId));

  const successfulRuns = runs.filter((r) => r.status === "completed");
  const failedRuns = runs.filter(
    (r) => r.status === "failed" || r.status === "dead_letter"
  );

  const costs = runs
    .map((r) => r.totalCost)
    .filter((c): c is number => c !== null);
  const totalCost = costs.reduce((a, b) => a + b, 0);
  const avgCost = costs.length > 0 ? totalCost / costs.length : 0;

  // Average scores across successful runs
  const avgScores: Record<string, number> = {};
  const scoreRuns = successfulRuns.filter((r) => r.scores);
  if (scoreRuns.length > 0) {
    const allScores = scoreRuns.map((r) => r.scores as Record<string, number>);
    const keys = Object.keys(allScores[0] ?? {});
    for (const key of keys) {
      const values = allScores.map((s) => s[key] ?? 0);
      avgScores[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  const lastRun = runs[0] ?? null;

  return {
    channelId,
    totalRuns: runs.length,
    successfulRuns: successfulRuns.length,
    failedRuns: failedRuns.length,
    avgCost,
    totalCost,
    avgScores,
    lastRunAt: lastRun?.startedAt?.toISOString() ?? null,
    lastRunStatus: lastRun?.status ?? null,
    publicationCount: pubs.length,
  };
}

/**
 * Get recent pipeline runs for a channel.
 */
export async function getRecentRuns(channelId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.channelId, channelId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);
}
