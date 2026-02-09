import type { ChannelConfig, ContentDraft, ReviewAgentResult } from "@auto-blogger/core";
import {
  detectAiPhrases,
  computeBurstiness,
  analyzeParagraphVariation,
} from "@auto-blogger/core";
import { callLlmJson } from "../llm.js";

/**
 * AI Detection Tester: Checks for statistical patterns that AI detectors flag.
 * Combines heuristic analysis with LLM-based evaluation.
 */
export async function runAiDetectionReview(
  config: ChannelConfig,
  draft: ContentDraft
): Promise<{ result: ReviewAgentResult; cost: number }> {
  // Run heuristic checks first
  const aiPhrases = detectAiPhrases(draft.content);
  const burstiness = computeBurstiness(draft.content);
  const paragraphVariation = analyzeParagraphVariation(draft.content);

  const heuristicFeedback: string[] = [];

  if (aiPhrases.length > 0) {
    heuristicFeedback.push(
      `Found ${aiPhrases.length} AI-typical phrases: ${aiPhrases.slice(0, 5).join(", ")}${aiPhrases.length > 5 ? "..." : ""}`
    );
  }

  if (burstiness.burstinessScore < 0.5) {
    heuristicFeedback.push(
      `Low burstiness (${burstiness.burstinessScore.toFixed(2)}): sentence lengths are too uniform. Mix short punches with longer sentences.`
    );
  }

  if (paragraphVariation.variationScore < 0.4) {
    heuristicFeedback.push(
      `Low paragraph variation (${paragraphVariation.variationScore.toFixed(2)}): paragraphs are too similar in length. Vary them more.`
    );
  }

  // LLM-based detection analysis
  const systemPrompt = `You are an AI detection expert analyzing text for patterns that AI detectors flag.

Evaluate:
1. **Naturalness** (1-10): Does this read like a human wrote it? Look for:
   - Uniform sentence structure (AI tends to use Subject-Verb-Object repeatedly)
   - Overly smooth transitions (humans are jumpier)
   - Lack of personality markers (asides, incomplete thoughts, humor)
   - Too-perfect parallel structure
   - Generic phrasing vs. specific, opinionated language

2. **Perplexity Variance** (1-10): Does the text have natural variation in complexity? Look for:
   - Some sentences that are simple and direct, others that are complex
   - Vocabulary shifts (casual in some spots, precise in others)
   - Natural digressions or tangents

HEURISTIC ANALYSIS RESULTS:
- AI phrases found: ${aiPhrases.length > 0 ? aiPhrases.join(", ") : "none"}
- Burstiness score: ${burstiness.burstinessScore.toFixed(2)} (human-like > 0.6)
- Paragraph variation: ${paragraphVariation.variationScore.toFixed(2)} (human-like > 0.5)
- Average sentence length: ${burstiness.avgSentenceLength.toFixed(1)} words

Respond with JSON:
{
  "scores": { "naturalness": N, "perplexityVariance": N },
  "passed": true/false,
  "feedback": ["specific AI-like patterns found"],
  "suggestions": ["specific fixes to make it more human"]
}`;

  const { data, cost } = await callLlmJson<Omit<ReviewAgentResult, "agent">>(
    "sonnet",
    systemPrompt,
    draft.content
  );

  // Merge heuristic feedback
  const result: ReviewAgentResult = {
    agent: "ai_detection",
    scores: data.scores,
    passed: data.passed && aiPhrases.length === 0,
    feedback: [...heuristicFeedback, ...data.feedback],
    suggestions: data.suggestions,
  };

  return { result, cost };
}
