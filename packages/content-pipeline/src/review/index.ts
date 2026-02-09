import type {
  ChannelConfig,
  ContentDraft,
  ResearchBrief,
  ReviewResult,
  ReviewScores,
  ReviewAgentResult,
} from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import { runEditorReview } from "./editor.js";
import { runFactCheckerReview } from "./fact-checker.js";
import { runEngagementReview } from "./engagement.js";
import { runAiDetectionReview } from "./ai-detection.js";

const logger = createChildLogger({ module: "pipeline:review" });

export { runEditorReview } from "./editor.js";
export { runFactCheckerReview } from "./fact-checker.js";
export { runEngagementReview } from "./engagement.js";
export { runAiDetectionReview } from "./ai-detection.js";

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
  config: ChannelConfig
): ReviewScores {
  const allScores: Record<string, number> = {};

  for (const result of results) {
    for (const [key, value] of Object.entries(result.scores)) {
      allScores[key] = value;
    }
  }

  // Map to the canonical ReviewScores shape, using defaults for missing scores
  return {
    structure: allScores.structure ?? 7,
    readability: allScores.readability ?? 7,
    voiceMatch: allScores.voiceMatch ?? 7,
    factualAccuracy: allScores.factualAccuracy ?? 7,
    sourceCoverage: allScores.sourceCoverage ?? 7,
    hookStrength: allScores.hookStrength ?? 7,
    engagementPotential: allScores.engagementPotential ?? 7,
    naturalness: allScores.naturalness ?? 7,
    perplexityVariance: allScores.perplexityVariance ?? 7,
  };
}
