import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "pipeline:external-ai-detection" });

export interface ExternalDetectionResult {
  provider: string;
  score: number; // 0-1, where 1 = definitely AI
  label: string; // "human" | "mixed" | "ai"
  details?: Record<string, unknown>;
}

/**
 * Check content against external AI detection APIs.
 * Used as ground-truth validation rather than relying solely on LLM self-evaluation.
 *
 * Supports:
 * - GPTZero API
 * - Originality.ai API
 * - Fallback: heuristic-only mode
 */
export async function checkExternalAiDetection(
  content: string,
  providers?: string[]
): Promise<ExternalDetectionResult[]> {
  const results: ExternalDetectionResult[] = [];
  const enabledProviders = providers ?? detectAvailableProviders();

  for (const provider of enabledProviders) {
    try {
      switch (provider) {
        case "gptzero": {
          const result = await checkGptZero(content);
          results.push(result);
          break;
        }
        case "originality": {
          const result = await checkOriginality(content);
          results.push(result);
          break;
        }
      }
    } catch (err) {
      logger.warn(
        { provider, error: err instanceof Error ? err.message : String(err) },
        "External AI detection provider failed"
      );
    }
  }

  return results;
}

function detectAvailableProviders(): string[] {
  const providers: string[] = [];
  if (process.env.GPTZERO_API_KEY) providers.push("gptzero");
  if (process.env.ORIGINALITY_API_KEY) providers.push("originality");
  return providers;
}

async function checkGptZero(content: string): Promise<ExternalDetectionResult> {
  const apiKey = process.env.GPTZERO_API_KEY;
  if (!apiKey) throw new Error("GPTZERO_API_KEY not set");

  const response = await fetch("https://api.gptzero.me/v2/predict/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ document: content }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`GPTZero API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    documents: Array<{
      average_generated_prob: number;
      completely_generated_prob: number;
      overall_burstiness: number;
      class_probabilities: Record<string, number>;
    }>;
  };

  const doc = data.documents[0];
  const aiScore = doc.completely_generated_prob;
  const label = aiScore > 0.7 ? "ai" : aiScore > 0.3 ? "mixed" : "human";

  logger.info(
    { provider: "gptzero", score: aiScore, label, burstiness: doc.overall_burstiness },
    "GPTZero detection result"
  );

  return {
    provider: "gptzero",
    score: aiScore,
    label,
    details: {
      averageGeneratedProb: doc.average_generated_prob,
      completelyGeneratedProb: doc.completely_generated_prob,
      burstiness: doc.overall_burstiness,
      classProbabilities: doc.class_probabilities,
    },
  };
}

async function checkOriginality(
  content: string
): Promise<ExternalDetectionResult> {
  const apiKey = process.env.ORIGINALITY_API_KEY;
  if (!apiKey) throw new Error("ORIGINALITY_API_KEY not set");

  const response = await fetch("https://api.originality.ai/api/v1/scan/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Originality.ai API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    score: { ai: number; original: number };
  };

  const aiScore = data.score.ai;
  const label = aiScore > 0.7 ? "ai" : aiScore > 0.3 ? "mixed" : "human";

  logger.info(
    { provider: "originality", score: aiScore, label },
    "Originality.ai detection result"
  );

  return {
    provider: "originality",
    score: aiScore,
    label,
    details: {
      aiScore: data.score.ai,
      originalScore: data.score.original,
    },
  };
}

/**
 * Evaluate whether content passes external AI detection thresholds.
 * Target: <15% AI detection rate (score < 0.15)
 */
export function passesExternalDetection(
  results: ExternalDetectionResult[],
  maxAiScore = 0.3
): { passed: boolean; feedback: string[] } {
  if (results.length === 0) {
    return { passed: true, feedback: ["No external AI detectors configured"] };
  }

  const feedback: string[] = [];
  let passed = true;

  for (const result of results) {
    if (result.score > maxAiScore) {
      passed = false;
      feedback.push(
        `${result.provider}: AI detection score ${(result.score * 100).toFixed(0)}% (threshold: ${(maxAiScore * 100).toFixed(0)}%) — labeled as "${result.label}"`
      );
    } else {
      feedback.push(
        `${result.provider}: PASSED — AI score ${(result.score * 100).toFixed(0)}% (labeled "${result.label}")`
      );
    }
  }

  return { passed, feedback };
}
