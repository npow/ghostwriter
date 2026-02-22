import type {
  ChannelConfig,
  ContentDraft,
  ResearchBrief,
  ReviewResult,
  ReviewScores,
  ReviewAgentResult,
} from "@auto-blogger/core";
import { createChildLogger, mergeDiscoveredPatterns } from "@auto-blogger/core";
import { runEditorReview } from "./editor.js";
import { runFactCheckerReview } from "./fact-checker.js";
import { runEngagementReview } from "./engagement.js";
import { runAiDetectionReview } from "./ai-detection.js";

const logger = createChildLogger({ module: "pipeline:review" });

export { runEditorReview } from "./editor.js";
export { runFactCheckerReview } from "./fact-checker.js";
export { runEngagementReview } from "./engagement.js";
export { runAiDetectionReview } from "./ai-detection.js";
export {
  checkExternalAiDetection,
  passesExternalDetection,
  type ExternalDetectionResult,
} from "./external-ai-detection.js";

/**
 * Run all 4 review agents in parallel and aggregate results.
 */
export async function runReviewStage(
  config: ChannelConfig,
  draft: ContentDraft,
  brief: ResearchBrief
): Promise<{ review: ReviewResult; cost: number }> {
  logger.info(
    { channelId: config.id, revision: draft.revision },
    "Starting review stage (4 agents in parallel)"
  );

  const [editor, factChecker, engagement, aiDetection] =
    await Promise.all([
      runEditorReview(config, draft),
      runFactCheckerReview(config, draft, brief),
      runEngagementReview(config, draft),
      runAiDetectionReview(config, draft),
    ]);

  const totalCost =
    editor.cost + factChecker.cost + engagement.cost + aiDetection.cost;

  // Persist any newly discovered AI patterns (non-blocking)
  if (aiDetection.discoveredPatterns.length > 0) {
    mergeDiscoveredPatterns(config.id, aiDetection.discoveredPatterns)
      .then((newCount) => {
        if (newCount > 0) {
          logger.info(
            { channelId: config.id, newCount, total: aiDetection.discoveredPatterns.length },
            "Persisted newly discovered AI patterns"
          );
        }
      })
      .catch((err) => {
        logger.warn({ channelId: config.id, err }, "Failed to persist discovered patterns");
      });
  }

  const agentResults = [
    editor.result,
    factChecker.result,
    engagement.result,
    aiDetection.result,
  ];

  const aggregateScores = aggregateAllScores(agentResults, config);
  const allPassed = agentResults.every((r) => r.passed);

  const review: ReviewResult = {
    channelId: config.id,
    passed: allPassed,
    aggregateScores,
    agentResults,
    revision: draft.revision,
  };

  logger.info(
    {
      channelId: config.id,
      passed: allPassed,
      scores: aggregateScores,
      cost: totalCost,
    },
    "Review stage complete"
  );

  return { review, cost: totalCost };
}

function aggregateAllScores(
  results: ReviewAgentResult[],
  _config: ChannelConfig
): ReviewScores {
  // Each score key is owned by a specific agent. If multiple agents report
  // the same key, take the minimum (most conservative) score.
  const scoreMap = new Map<string, number[]>();

  for (const result of results) {
    for (const [key, value] of Object.entries(result.scores)) {
      const existing = scoreMap.get(key) ?? [];
      existing.push(value);
      scoreMap.set(key, existing);
    }
  }

  const resolve = (key: string, fallback: number): number => {
    const values = scoreMap.get(key);
    if (!values || values.length === 0) return fallback;
    // Use minimum score when multiple agents report the same metric
    // This is conservative — content must satisfy ALL agents
    return Math.min(...values);
  };

  return {
    structure: resolve("structure", 5),
    readability: resolve("readability", 5),
    voiceMatch: resolve("voiceMatch", 5),
    factualAccuracy: resolve("factualAccuracy", 5),
    sourceCoverage: resolve("sourceCoverage", 5),
    hookStrength: resolve("hookStrength", 5),
    engagementPotential: resolve("engagementPotential", 5),
    naturalness: resolve("naturalness", 5),
    perplexityVariance: resolve("perplexityVariance", 5),
  };
}
