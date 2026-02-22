import { getDb } from "@ghostwriter/database";
import {
  contentAnalytics,
  publications,
  contentArtifacts,
  pipelineRuns,
} from "@ghostwriter/database";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { createChildLogger } from "@ghostwriter/core";

const logger = createChildLogger({ module: "monitoring:performance-insights" });

export interface PerformanceInsights {
  channelId: string;
  totalPublications: number;
  avgEngagement: EngagementSummary;
  topPerformers: TopPerformer[];
  bottomPerformers: TopPerformer[];
  patterns: ContentPattern[];
  recommendations: string[];
}

export interface EngagementSummary {
  avgViews: number;
  avgLikes: number;
  avgShares: number;
  avgComments: number;
  engagementRate: number; // (likes + shares + comments) / views
}

export interface TopPerformer {
  publicationId: string;
  platform: string;
  headline: string;
  engagementScore: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  reviewScores: Record<string, number> | null;
}

export interface ContentPattern {
  pattern: string;
  description: string;
  correlation: "positive" | "negative";
  strength: "strong" | "moderate" | "weak";
}

/**
 * Analyze performance data for a channel and generate actionable insights.
 * These insights feed back into future pipeline runs to improve content.
 */
export async function generatePerformanceInsights(
  channelId: string
): Promise<PerformanceInsights> {
  const db = getDb();

  // Join publications with analytics
  const results = await db
    .select({
      pubId: publications.id,
      platform: publications.platform,
      platformId: publications.platformId,
      pipelineRunId: publications.pipelineRunId,
      views: contentAnalytics.views,
      likes: contentAnalytics.likes,
      shares: contentAnalytics.shares,
      comments: contentAnalytics.comments,
      clicks: contentAnalytics.clicks,
    })
    .from(publications)
    .innerJoin(
      contentAnalytics,
      eq(publications.id, contentAnalytics.publicationId)
    )
    .where(eq(publications.channelId, channelId))
    .orderBy(desc(contentAnalytics.fetchedAt));

  if (results.length === 0) {
    return {
      channelId,
      totalPublications: 0,
      avgEngagement: {
        avgViews: 0,
        avgLikes: 0,
        avgShares: 0,
        avgComments: 0,
        engagementRate: 0,
      },
      topPerformers: [],
      bottomPerformers: [],
      patterns: [],
      recommendations: [
        "No analytics data yet. Publish content and wait for engagement data to accumulate.",
      ],
    };
  }

  // Calculate engagement scores and averages
  const withScores = results.map((r) => ({
    ...r,
    engagementScore: computeEngagementScore(
      r.views ?? 0,
      r.likes ?? 0,
      r.shares ?? 0,
      r.comments ?? 0
    ),
  }));

  const totalViews = withScores.reduce((s, r) => s + (r.views ?? 0), 0);
  const totalLikes = withScores.reduce((s, r) => s + (r.likes ?? 0), 0);
  const totalShares = withScores.reduce((s, r) => s + (r.shares ?? 0), 0);
  const totalComments = withScores.reduce((s, r) => s + (r.comments ?? 0), 0);
  const count = withScores.length;

  const avgEngagement: EngagementSummary = {
    avgViews: totalViews / count,
    avgLikes: totalLikes / count,
    avgShares: totalShares / count,
    avgComments: totalComments / count,
    engagementRate:
      totalViews > 0
        ? (totalLikes + totalShares + totalComments) / totalViews
        : 0,
  };

  // Sort by engagement score to find top/bottom performers
  const sorted = [...withScores].sort(
    (a, b) => b.engagementScore - a.engagementScore
  );
  const topN = Math.min(5, Math.ceil(count * 0.2));

  // Fetch headlines from pipeline run artifacts
  const topPerformers = await enrichPerformers(sorted.slice(0, topN));
  const bottomPerformers = await enrichPerformers(sorted.slice(-topN).reverse());

  // Detect patterns
  const patterns = await detectPatterns(channelId, withScores);

  // Generate recommendations
  const recommendations = generateRecommendations(
    avgEngagement,
    topPerformers,
    bottomPerformers,
    patterns
  );

  logger.info(
    {
      channelId,
      totalPublications: count,
      avgEngagementRate: avgEngagement.engagementRate.toFixed(3),
      patterns: patterns.length,
    },
    "Performance insights generated"
  );

  return {
    channelId,
    totalPublications: count,
    avgEngagement,
    topPerformers,
    bottomPerformers,
    patterns,
    recommendations,
  };
}

/**
 * Compute a weighted engagement score.
 * Shares are weighted highest (viral potential), then comments (deep engagement),
 * then likes (passive engagement), with views as baseline.
 */
function computeEngagementScore(
  views: number,
  likes: number,
  shares: number,
  comments: number
): number {
  if (views === 0) return likes * 2 + shares * 5 + comments * 3;
  // Normalize by views to get engagement rate, then weight
  const likeRate = likes / views;
  const shareRate = shares / views;
  const commentRate = comments / views;
  return (
    likeRate * 2 + shareRate * 5 + commentRate * 3 + Math.log10(views + 1) * 0.5
  );
}

async function enrichPerformers(
  items: Array<{
    pubId: string;
    platform: string;
    pipelineRunId: string;
    views: number | null;
    likes: number | null;
    shares: number | null;
    comments: number | null;
    engagementScore: number;
  }>
): Promise<TopPerformer[]> {
  const db = getDb();
  const performers: TopPerformer[] = [];

  for (const item of items) {
    // Try to get the headline from the draft artifact
    let headline = "Unknown";
    let reviewScores: Record<string, number> | null = null;

    try {
      const artifacts = await db
        .select()
        .from(contentArtifacts)
        .where(
          and(
            eq(contentArtifacts.pipelineRunId, item.pipelineRunId),
            eq(contentArtifacts.stage, "draft")
          )
        )
        .limit(1);

      if (artifacts[0]?.content) {
        const content = artifacts[0].content as Record<string, unknown>;
        headline = (content.headline as string) ?? headline;
      }

      const runs = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, item.pipelineRunId))
        .limit(1);

      if (runs[0]?.scores) {
        reviewScores = runs[0].scores as Record<string, number>;
      }
    } catch (err) {
      logger.debug({ pipelineRunId: item.pipelineRunId, error: err instanceof Error ? err.message : String(err) }, "Skipping performer enrichment (non-critical)");
    }

    performers.push({
      publicationId: item.pubId,
      platform: item.platform,
      headline,
      engagementScore: item.engagementScore,
      views: item.views ?? 0,
      likes: item.likes ?? 0,
      shares: item.shares ?? 0,
      comments: item.comments ?? 0,
      reviewScores,
    });
  }

  return performers;
}

/**
 * Detect patterns by correlating review scores with engagement outcomes.
 */
async function detectPatterns(
  channelId: string,
  items: Array<{
    pipelineRunId: string;
    engagementScore: number;
  }>
): Promise<ContentPattern[]> {
  if (items.length < 5) return []; // Need enough data for patterns

  const db = getDb();
  const patterns: ContentPattern[] = [];

  // Fetch review scores for all pipeline runs
  const runIds = [...new Set(items.map((i) => i.pipelineRunId))];
  const scoreData: Array<{
    runId: string;
    scores: Record<string, number>;
    engagementScore: number;
  }> = [];

  for (const runId of runIds) {
    const runs = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId))
      .limit(1);

    if (runs[0]?.scores) {
      const matchingItem = items.find((i) => i.pipelineRunId === runId);
      if (matchingItem) {
        scoreData.push({
          runId,
          scores: runs[0].scores as Record<string, number>,
          engagementScore: matchingItem.engagementScore,
        });
      }
    }
  }

  if (scoreData.length < 5) return patterns;

  // For each score dimension, compute correlation with engagement
  const scoreKeys = Object.keys(scoreData[0]?.scores ?? {});
  for (const key of scoreKeys) {
    const pairs = scoreData.map((d) => ({
      score: d.scores[key] ?? 0,
      engagement: d.engagementScore,
    }));

    const corr = pearsonCorrelation(
      pairs.map((p) => p.score),
      pairs.map((p) => p.engagement)
    );

    if (Math.abs(corr) > 0.3) {
      const strength =
        Math.abs(corr) > 0.7
          ? "strong"
          : Math.abs(corr) > 0.5
            ? "moderate"
            : "weak";
      const correlation = corr > 0 ? "positive" : "negative";

      patterns.push({
        pattern: key,
        description:
          corr > 0
            ? `Higher ${key} scores correlate with better engagement (r=${corr.toFixed(2)})`
            : `Higher ${key} scores correlate with lower engagement (r=${corr.toFixed(2)})`,
        correlation,
        strength,
      });
    }
  }

  return patterns;
}

/**
 * Pearson correlation coefficient between two arrays.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
  const sumY2 = y.reduce((a, yi) => a + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

function generateRecommendations(
  avgEngagement: EngagementSummary,
  topPerformers: TopPerformer[],
  bottomPerformers: TopPerformer[],
  patterns: ContentPattern[]
): string[] {
  const recommendations: string[] = [];

  // Engagement rate based recommendations
  if (avgEngagement.engagementRate < 0.02) {
    recommendations.push(
      "Engagement rate is below 2%. Focus on stronger hooks and more provocative headlines."
    );
  }

  if (avgEngagement.avgShares < 1) {
    recommendations.push(
      "Share rate is very low. Add more quotable sentences and data visualizations that people want to share."
    );
  }

  if (avgEngagement.avgComments < 1) {
    recommendations.push(
      "Comment rate is very low. End articles with a question or hot take to encourage discussion."
    );
  }

  // Pattern-based recommendations
  for (const pattern of patterns) {
    if (pattern.correlation === "positive" && pattern.strength !== "weak") {
      recommendations.push(
        `Prioritize high ${pattern.pattern} scores — ${pattern.description}.`
      );
    }
    if (pattern.correlation === "negative" && pattern.strength !== "weak") {
      recommendations.push(
        `Investigate ${pattern.pattern} — ${pattern.description}. High scores here may not translate to audience engagement.`
      );
    }
  }

  // Top performer analysis
  if (topPerformers.length > 0 && topPerformers[0].reviewScores) {
    const topScores = topPerformers[0].reviewScores;
    const highScoreKeys = Object.entries(topScores)
      .filter(([, v]) => v >= 9)
      .map(([k]) => k);
    if (highScoreKeys.length > 0) {
      recommendations.push(
        `Top performing content scored 9+ on: ${highScoreKeys.join(", ")}. Raise minimum thresholds for these dimensions.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Performance looks healthy. Continue current content strategy and monitor for trends."
    );
  }

  return recommendations;
}

/**
 * Format insights as a brief string for injection into pipeline prompts.
 * This is the key feedback loop — these insights are passed to the draft stage.
 */
export function formatInsightsForPrompt(
  insights: PerformanceInsights
): string {
  if (insights.totalPublications === 0) return "";

  const lines: string[] = [
    "PERFORMANCE INSIGHTS FROM PAST CONTENT:",
    `Based on ${insights.totalPublications} published pieces:`,
  ];

  if (insights.avgEngagement.engagementRate > 0) {
    lines.push(
      `- Average engagement rate: ${(insights.avgEngagement.engagementRate * 100).toFixed(1)}%`
    );
  }

  if (insights.topPerformers.length > 0) {
    lines.push("\nTop performing headlines:");
    for (const tp of insights.topPerformers.slice(0, 3)) {
      lines.push(
        `  - "${tp.headline}" (${tp.views} views, ${tp.likes} likes, ${tp.shares} shares)`
      );
    }
  }

  if (insights.patterns.length > 0) {
    lines.push("\nContent patterns that drive engagement:");
    for (const p of insights.patterns.filter(
      (p) => p.correlation === "positive"
    )) {
      lines.push(`  - ${p.description}`);
    }
  }

  if (insights.recommendations.length > 0) {
    lines.push("\nRecommendations:");
    for (const rec of insights.recommendations.slice(0, 5)) {
      lines.push(`  - ${rec}`);
    }
  }

  return lines.join("\n");
}
