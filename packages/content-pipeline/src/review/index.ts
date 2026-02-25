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
import { callLlmJson, findStringArrays } from "../llm.js";
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

  let totalCost =
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

  let agentResults = [
    normalizeAgentResult(editor.result, "editor"),
    normalizeAgentResult(factChecker.result, "fact_checker"),
    normalizeAgentResult(engagement.result, "engagement"),
    normalizeAgentResult(aiDetection.result, "ai_detection"),
    normalizeAgentResult(originality.result, "originality"),
  ];

  // For agents missing expected scores, run a focused scoring LLM call.
  // This handles the case where the LLM proxy causes agents to return
  // freeform JSON without the requested numeric scores.
  const scoringResults = await extractMissingScores(agentResults, [
    { agent: "editor", raw: editor.result, dimensions: ["structure", "readability", "voiceMatch"] },
    { agent: "fact_checker", raw: factChecker.result, dimensions: ["factualAccuracy", "sourceCoverage"] },
    { agent: "engagement", raw: engagement.result, dimensions: ["hookStrength", "engagementPotential"] },
  ]);
  totalCost += scoringResults.cost;
  agentResults = scoringResults.results;

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

// ─── Score extraction via LLM ───
// When agents return freeform reviews without numeric scores (common with LLM proxies),
// make a focused second call to extract scores from the review text.

interface AgentScoringSpec {
  agent: string;
  raw: ReviewAgentResult;
  dimensions: string[];
}

async function extractMissingScores(
  agentResults: ReviewAgentResult[],
  specs: AgentScoringSpec[],
): Promise<{ results: ReviewAgentResult[]; cost: number }> {
  let totalScoringCost = 0;
  const updatedResults = [...agentResults];

  // Find agents that need scoring (missing expected dimensions)
  const needsScoring: AgentScoringSpec[] = [];
  for (const spec of specs) {
    const result = updatedResults.find((r) => r.agent === spec.agent);
    if (!result) continue;

    // Skip agents that returned a default failed result (no real review to score)
    const isDefaultFailure = Object.keys(result.scores).length === 0
      && result.feedback.length <= 1
      && result.feedback.some?.((f) => f.includes("failed to produce valid response"));
    if (isDefaultFailure) {
      logger.info({ agent: spec.agent }, "Skipping score extraction for failed agent — using heuristic fallback");
      continue;
    }

    const missingDims = spec.dimensions.filter(
      (d) => !(d in result.scores) || typeof result.scores[d] !== "number"
    );
    if (missingDims.length > 0) {
      needsScoring.push({ ...spec, dimensions: missingDims });
    }
  }

  if (needsScoring.length === 0) return { results: updatedResults, cost: 0 };

  logger.info(
    { agents: needsScoring.map((s) => s.agent), dims: needsScoring.map((s) => s.dimensions) },
    "Extracting missing scores via LLM"
  );

  // Run scoring calls in parallel for all agents that need them
  const scoringPromises = needsScoring.map(async (spec) => {
    const reviewSummary = JSON.stringify(spec.raw, null, 2).slice(0, 3000);

    const systemPrompt = `Read this content review and provide numeric scores (1-10) for each dimension.

DIMENSIONS TO SCORE:
${spec.dimensions.map((d) => `- ${d}`).join("\n")}

CALIBRATION:
- 8-10: The review is mostly positive for this dimension, issues are minor/stylistic
- 7: The review mentions some real issues but the content is fundamentally sound
- 5-6: The review identifies significant problems that need fixing
- 3-4: The review describes major failures in this dimension
- 1-2: Only if the review says this dimension is completely broken

IMPORTANT: A thorough review that mentions minor issues still scores 7-8. Detailed feedback does NOT mean low scores — good reviewers are thorough even on good content. Focus on the SEVERITY of issues, not the NUMBER of comments.

Respond ONLY with JSON:
{${spec.dimensions.map((d) => `"${d}": N`).join(", ")}}`;

    try {
      const { data, cost } = await callLlmJson<Record<string, number>>(
        "sonnet",
        systemPrompt,
        `REVIEW TO SCORE:\n${reviewSummary}`
      );

      const scores: Record<string, number> = {};
      for (const dim of spec.dimensions) {
        // Check both camelCase and snake_case
        const snakeKey = dim.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
        const val = data[dim] ?? data[snakeKey];
        if (typeof val === "number" && val >= 1 && val <= 10) {
          scores[dim] = val;
        }
      }

      return { agent: spec.agent, scores, cost };
    } catch (err) {
      logger.warn({ agent: spec.agent, err }, "Score extraction LLM call failed");
      return { agent: spec.agent, scores: {} as Record<string, number>, cost: 0 };
    }
  });

  const scoringResults = await Promise.all(scoringPromises);

  // Merge extracted scores back into agent results
  for (const { agent, scores, cost } of scoringResults) {
    totalScoringCost += cost;
    const idx = updatedResults.findIndex((r) => r.agent === agent);
    if (idx >= 0 && Object.keys(scores).length > 0) {
      updatedResults[idx] = {
        ...updatedResults[idx],
        scores: { ...updatedResults[idx].scores, ...scores },
      };
      logger.info(
        { agent, extractedScores: scores, cost },
        "Extracted scores from review"
      );
    }
  }

  return { results: updatedResults, cost: totalScoringCost };
}

// ─── Score dimension fuzzy mapping ───
// Maps keywords found in response keys to canonical score dimension names.
const SCORE_KEYWORD_MAP: Array<{ keywords: string[]; dimension: string }> = [
  { keywords: ["structure", "structural", "organization", "flow"], dimension: "structure" },
  { keywords: ["readability", "readable", "writing_quality", "clarity", "prose"], dimension: "readability" },
  { keywords: ["voice", "voice_match", "tone", "persona"], dimension: "voiceMatch" },
  { keywords: ["factual", "accuracy", "fact_check", "verification"], dimension: "factualAccuracy" },
  { keywords: ["source_coverage", "coverage", "sourcing", "citation"], dimension: "sourceCoverage" },
  { keywords: ["hook", "opening", "intro", "headline"], dimension: "hookStrength" },
  { keywords: ["engagement", "shareab", "viral", "compelling"], dimension: "engagementPotential" },
  { keywords: ["natural", "human", "authentic"], dimension: "naturalness" },
  { keywords: ["perplexity", "variance", "burstiness", "sentence_variety"], dimension: "perplexityVariance" },
  { keywords: ["originality", "topic_original", "unique"], dimension: "topicOriginality" },
  { keywords: ["freshness", "angle_fresh", "novel"], dimension: "angleFreshness" },
];

/**
 * Try to map a freeform key name to a known score dimension.
 */
function matchScoreDimension(key: string): string | null {
  const lower = key.toLowerCase();
  for (const { keywords, dimension } of SCORE_KEYWORD_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return dimension;
  }
  return null;
}

/**
 * Recursively extract all numeric values (1-10) from an object,
 * collecting them with their key paths for score mapping.
 */
function extractNumericScores(data: unknown, depth = 0): Record<string, number> {
  const scores: Record<string, number> = {};
  if (!data || typeof data !== "object" || Array.isArray(data) || depth > 3) return scores;

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "number" && value >= 1 && value <= 10) {
      const dimension = matchScoreDimension(key);
      if (dimension) {
        scores[dimension] = value;
      }
    } else if (typeof value === "string") {
      // Try to extract "N/10" patterns from text
      const match = value.match(/\b(\d+(?:\.\d+)?)\s*\/\s*10\b/);
      if (match) {
        const num = parseFloat(match[1]);
        if (num >= 1 && num <= 10) {
          const dimension = matchScoreDimension(key);
          if (dimension) scores[dimension] = Math.round(num);
        }
      }
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // Recurse into nested objects
      const nested = extractNumericScores(value, depth + 1);
      for (const [dim, val] of Object.entries(nested)) {
        if (!(dim in scores)) scores[dim] = val;
      }
    }
  }
  return scores;
}

/**
 * Ensure a review agent result has all required fields.
 * LLMs through proxies may return non-standard JSON structures.
 * Uses shape-based extraction as fallback when explicit fields are missing.
 */
function normalizeAgentResult(
  raw: ReviewAgentResult,
  agent: ReviewAgentResult["agent"]
): ReviewAgentResult {
  const result = raw as Record<string, unknown>;

  // 1. Extract scores — try explicit "scores" field first
  let scores: Record<string, number> = {};
  if (result.scores && typeof result.scores === "object" && !Array.isArray(result.scores)) {
    const explicit = result.scores as Record<string, unknown>;
    // Convert snake_case to camelCase and filter to numbers
    for (const [key, value] of Object.entries(explicit)) {
      if (typeof value === "number" && value >= 1 && value <= 10) {
        const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        scores[camel] = value;
      }
    }
  }

  // If no scores found in "scores" field, search the entire response
  if (Object.keys(scores).length === 0) {
    scores = extractNumericScores(result);
  }

  // 2. Extract feedback — try explicit, then find string arrays
  const coerceToStrings = (arr: unknown[]): string[] =>
    arr.map((item) => typeof item === "string" ? item : JSON.stringify(item));

  let feedback: string[] = [];
  const feedbackKeys = ["feedback", "issues", "problems", "critical_issues",
    "structural_issues", "inaccuracies", "engagement_killers", "weaknesses",
    "engagement_problems", "concerns", "technical_concerns"];
  for (const key of feedbackKeys) {
    if (Array.isArray(result[key]) && (result[key] as unknown[]).length > 0) {
      feedback = coerceToStrings(result[key] as unknown[]);
      break;
    }
  }
  if (feedback.length === 0) {
    const stringArrays = findStringArrays(result);
    if (stringArrays.length > 0) {
      feedback = stringArrays[0];
    }
  }

  // 3. Extract suggestions
  let suggestions: string[] = [];
  const suggestKeys = ["suggestions", "recommendations", "improvements",
    "specific_fixes", "fixes", "what_would_make_this_great", "what_would_make_this_viral"];
  for (const key of suggestKeys) {
    if (Array.isArray(result[key]) && (result[key] as unknown[]).length > 0) {
      suggestions = coerceToStrings(result[key] as unknown[]);
      break;
    }
  }

  // 4. Extract passed
  const passed = typeof result.passed === "boolean"
    ? result.passed
    : typeof result.pass === "boolean"
    ? result.pass
    : false;

  return {
    agent,
    scores: scores as ReviewAgentResult["scores"],
    passed,
    feedback,
    suggestions,
  };
}

// Maps score dimensions to the review agent that owns them.
const SCORE_OWNERS: Record<string, ReviewAgentResult["agent"]> = {
  structure: "editor",
  readability: "editor",
  voiceMatch: "editor",
  factualAccuracy: "fact_checker",
  sourceCoverage: "fact_checker",
  hookStrength: "engagement",
  engagementPotential: "engagement",
  naturalness: "ai_detection",
  perplexityVariance: "ai_detection",
  topicOriginality: "originality",
  angleFreshness: "originality",
};

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

  const agentMap = new Map<string, ReviewAgentResult>();
  for (const r of results) agentMap.set(r.agent, r);

  const resolve = (key: string, defaultFallback: number): number => {
    const values = scoreMap.get(key);
    if (values && values.length > 0) {
      return Math.min(...values);
    }

    // No explicit score — infer from the owning agent's feedback.
    // An agent with few negative items implicitly gives a decent score.
    const owner = SCORE_OWNERS[key];
    const agent = owner ? agentMap.get(owner) : undefined;
    if (agent) {
      const issueCount = agent.feedback.length;
      if (agent.passed) return 8;
      if (issueCount === 0) return 8;
      if (issueCount <= 2) return 7;
      if (issueCount <= 4) return 6;
      return 5;
    }

    return defaultFallback;
  };

  return {
    structure: resolve("structure", 7),
    readability: resolve("readability", 7),
    voiceMatch: resolve("voiceMatch", 7),
    factualAccuracy: resolve("factualAccuracy", 7),
    sourceCoverage: resolve("sourceCoverage", 7),
    hookStrength: resolve("hookStrength", 7),
    engagementPotential: resolve("engagementPotential", 7),
    naturalness: resolve("naturalness", 7),
    perplexityVariance: resolve("perplexityVariance", 7),
    topicOriginality: resolve("topicOriginality", 9),
    angleFreshness: resolve("angleFreshness", 9),
  };
}
