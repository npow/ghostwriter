import type {
  ChannelConfig,
  ContentDraft,
  ResearchBrief,
  ReviewResult,
  ReviewScores,
  ReviewAgentResult,
  PublicationHistory,
} from "@ghostwriter/core";
import { createChildLogger, mergeDiscoveredPatterns } from "@ghostwriter/core";
import { runEditorReview } from "./editor.js";
import { runFactCheckerReview } from "./fact-checker.js";
import { runEngagementReview } from "./engagement.js";
import { runAiDetectionReview } from "./ai-detection.js";
import { runOriginalityReview } from "./originality.js";

const logger = createChildLogger({ module: "pipeline:review" });

export { runEditorReview } from "./editor.js";
export { runFactCheckerReview } from "./fact-checker.js";
export { runEngagementReview } from "./engagement.js";
export { runAiDetectionReview } from "./ai-detection.js";
export { runOriginalityReview } from "./originality.js";
export {
  checkExternalAiDetection,
  passesExternalDetection,
  type ExternalDetectionResult,
} from "./external-ai-detection.js";

/**
 * Run all 5 review agents in parallel and aggregate results.
 */
export async function runReviewStage(
  config: ChannelConfig,
  draft: ContentDraft,
  brief: ResearchBrief,
  publicationHistory?: PublicationHistory
): Promise<{ review: ReviewResult; cost: number }> {
  logger.info(
    { channelId: config.id, revision: draft.revision },
    "Starting review stage (5 agents in parallel)"
  );

  const [editor, factChecker, engagement, aiDetection, originality] =
    await Promise.all([
      runEditorReview(config, draft),
      runFactCheckerReview(config, draft, brief),
      runEngagementReview(config, draft),
      runAiDetectionReview(config, draft),
      runOriginalityReview(config, draft, publicationHistory),
    ]);

  const totalCost =
    editor.cost + factChecker.cost + engagement.cost + aiDetection.cost + originality.cost;

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
    normalizeAgentResult(editor.result, "editor"),
    normalizeAgentResult(factChecker.result, "fact_checker"),
    normalizeAgentResult(engagement.result, "engagement"),
    normalizeAgentResult(aiDetection.result, "ai_detection"),
    normalizeAgentResult(originality.result, "originality"),
  ];

  const aggregateScores = aggregateAllScores(agentResults, config);
  // Determine pass/fail from scores vs configured thresholds, not agent self-reports
  const minScores = config.qualityGate.minScores;
  const allPassed = (Object.entries(aggregateScores) as [string, number][]).every(
    ([key, value]) => value >= (minScores[key as keyof typeof minScores] ?? 1)
  );

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

/**
 * Ensure a review agent result has all required fields.
 * LLMs through proxies may return non-standard JSON structures.
 */
function normalizeAgentResult(
  raw: ReviewAgentResult,
  agent: ReviewAgentResult["agent"]
): ReviewAgentResult {
  const result = raw as Record<string, unknown>;
  const scores = (result.scores && typeof result.scores === "object")
    ? result.scores as Record<string, number>
    : {};
  const feedback = Array.isArray(result.feedback)
    ? result.feedback as string[]
    : [];
  const suggestions = Array.isArray(result.suggestions)
    ? result.suggestions as string[]
    : [];
  const passed = typeof result.passed === "boolean"
    ? result.passed
    : false;

  return {
    agent,
    scores: scores as ReviewAgentResult["scores"],
    passed,
    feedback,
    suggestions,
  };
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
    topicOriginality: resolve("topicOriginality", 9),
    angleFreshness: resolve("angleFreshness", 9),
  };
}
