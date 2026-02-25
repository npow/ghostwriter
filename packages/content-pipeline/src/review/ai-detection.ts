import type { ChannelConfig, ContentDraft, ReviewAgentResult, DiscoveredPattern } from "@ghostwriter/core";
import {
  AI_PHRASE_BLACKLIST,
  detectAiPhrases,
  computeBurstiness,
  analyzeParagraphVariation,
  getActivePhrases,
} from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";
import {
  checkExternalAiDetection,
  passesExternalDetection,
} from "./external-ai-detection.js";

/**
 * AI Detection Tester: Multi-layer detection combining:
 * 1. Heuristic analysis (phrase blacklist, burstiness, paragraph variation)
 * 2. LLM-based evaluation (structural patterns, naturalness)
 * 3. External AI detection APIs (GPTZero, Originality.ai) — when configured
 */
export async function runAiDetectionReview(
  config: ChannelConfig,
  draft: ContentDraft
): Promise<{ result: ReviewAgentResult; discoveredPatterns: DiscoveredPattern[]; cost: number }> {
  // Load learned patterns for this channel
  const learnedPhrases = await getActivePhrases(config.id).catch(() => []);

  // Layer 1: Heuristic checks (static blacklist + learned patterns)
  const aiPhrases = detectAiPhrases(draft.content);
  const learnedHits = learnedPhrases.filter((p) =>
    draft.content.toLowerCase().includes(p.toLowerCase())
  );
  const burstiness = computeBurstiness(draft.content);
  const paragraphVariation = analyzeParagraphVariation(draft.content);

  const heuristicFeedback: string[] = [];

  if (aiPhrases.length > 0) {
    heuristicFeedback.push(
      `Found ${aiPhrases.length} AI-typical phrases: ${aiPhrases.join(", ")}`
    );
  }

  if (learnedHits.length > 0) {
    heuristicFeedback.push(
      `Found ${learnedHits.length} learned AI pattern(s): ${learnedHits.join(", ")}`
    );
  }

  if (burstiness.burstinessScore < 0.5) {
    heuristicFeedback.push(
      `Low burstiness (${burstiness.burstinessScore.toFixed(2)}): sentence lengths are too uniform. Mix short punches with longer sentences. Target: >0.6`
    );
  }

  if (paragraphVariation.variationScore < 0.4) {
    heuristicFeedback.push(
      `Low paragraph variation (${paragraphVariation.variationScore.toFixed(2)}): paragraphs are too similar in length. Vary them more. Target: >0.5`
    );
  }

  // Check for structural AI patterns
  const structuralIssues = detectStructuralPatterns(draft.content);
  heuristicFeedback.push(...structuralIssues);

  // Build abbreviated known-patterns list for the LLM
  const knownPatterns = [
    ...AI_PHRASE_BLACKLIST.slice(0, 30),
    ...learnedPhrases.slice(0, 20),
  ];

  // Layer 2: LLM-based detection analysis
  const systemPrompt = `You are an AI detection expert analyzing text for patterns that AI detectors flag.

Evaluate:
1. **Naturalness** (1-10): Does this read like a human wrote it? Look for:
   - Uniform sentence structure (AI tends to use Subject-Verb-Object repeatedly)
   - Overly smooth transitions (humans are jumpier, use "anyway", "oh and", "speaking of")
   - Lack of personality markers (asides, incomplete thoughts, self-corrections, humor)
   - Too-perfect parallel structure (e.g., "First... Second... Third...")
   - Generic phrasing vs. specific, opinionated language
   - Every paragraph following the same pattern (topic sentence → support → conclusion)
   - Overuse of transitional adverbs ("Moreover", "Furthermore", "Additionally")

2. **Perplexity Variance** (1-10): Does the text have natural variation in complexity? Look for:
   - Some sentences that are simple and direct, others that are complex
   - Vocabulary shifts (casual in some spots, precise in others)
   - Natural digressions or tangents (humans go off-topic briefly)
   - Energy shifts (humans get excited, then mellow, then fired up again)

3. **Pattern Discovery**: Identify NEW AI-typical phrases or patterns in this text that are NOT already in our known list. Focus on:
   - Recurring phrases that feel templated or formulaic
   - Structural patterns (e.g., every section ending the same way)
   - Stylistic tics (e.g., always hedging with the same construction)
   Only report patterns you're confident about (>0.6). Do NOT re-report patterns already in the known list.

KNOWN PATTERNS (already tracked — do NOT re-report these):
${knownPatterns.map((p) => `- "${p}"`).join("\n")}

EXAMPLES OF AI-LIKE vs HUMAN-LIKE WRITING:

AI-like: "The stock market experienced significant volatility this week. Several factors contributed to this movement. First, inflation data exceeded expectations. Second, Federal Reserve commentary suggested continued tightening."

Human-like: "What a week. The S&P got hammered — down 2.3% — and honestly? Most of the panic was overblown. Yeah, inflation came in hot. And yeah, Powell said some stuff that spooked people. But here's the thing nobody's talking about..."

HEURISTIC ANALYSIS RESULTS:
- AI phrases found: ${aiPhrases.length > 0 ? aiPhrases.join(", ") : "none"}
- Learned pattern hits: ${learnedHits.length > 0 ? learnedHits.join(", ") : "none"}
- Burstiness score: ${burstiness.burstinessScore.toFixed(2)} (human-like > 0.6)
- Paragraph variation: ${paragraphVariation.variationScore.toFixed(2)} (human-like > 0.5)
- Average sentence length: ${burstiness.avgSentenceLength.toFixed(1)} words
- Structural issues: ${structuralIssues.length > 0 ? structuralIssues.join("; ") : "none detected"}

Respond with JSON:
{
  "scores": { "naturalness": N, "perplexityVariance": N },
  "passed": true/false,
  "feedback": ["specific AI-like patterns found"],
  "suggestions": ["specific fixes to make it more human — be concrete, not vague"],
  "discoveredPatterns": [
    { "phrase": "the exact phrase or pattern", "category": "phrase|structural|stylistic", "confidence": 0.0-1.0, "context": "brief explanation" }
  ]
}`;

  interface AiDetectionLlmResponse {
    scores: Record<string, number>;
    passed: boolean;
    feedback: string[];
    suggestions: string[];
    discoveredPatterns?: DiscoveredPattern[];
  }

  const { data, cost } = await callLlmJson<AiDetectionLlmResponse>(
    "sonnet",
    systemPrompt,
    draft.content
  );

  const llmFeedback = Array.isArray(data.feedback) ? data.feedback : [];
  const llmSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  const llmPassed = typeof data.passed === "boolean" ? data.passed : false;

  // Extract scores — LLM may return them under "scores" or as top-level keys
  let llmScores: Record<string, number> = {};
  const raw = data as unknown as Record<string, unknown>;
  if (raw.scores && typeof raw.scores === "object") {
    const s = raw.scores as Record<string, unknown>;
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === "number") {
        const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        llmScores[camel] = v;
      }
    }
  }
  // Fallback: search top-level and nested for naturalness/perplexityVariance
  if (!llmScores.naturalness && !llmScores.perplexityVariance) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number" && v >= 1 && v <= 10) {
        const lower = k.toLowerCase();
        if (lower.includes("natural")) llmScores.naturalness = v;
        else if (lower.includes("perplexity") || lower.includes("variance") || lower.includes("burstiness")) llmScores.perplexityVariance = v;
      }
    }
  }
  // Use heuristic burstiness as fallback score for perplexityVariance
  if (!llmScores.perplexityVariance) {
    llmScores.perplexityVariance = Math.min(10, Math.max(1, Math.round(burstiness.burstinessScore * 10)));
  }
  if (!llmScores.naturalness) {
    // Estimate naturalness from heuristic signals
    const penaltyCount = aiPhrases.length + learnedHits.length + structuralIssues.length;
    llmScores.naturalness = Math.max(1, 8 - penaltyCount);
  }

  const discoveredPatterns: DiscoveredPattern[] = (Array.isArray(data.discoveredPatterns) ? data.discoveredPatterns : []).filter(
    (p) => p.phrase && p.category && typeof p.confidence === "number"
  );

  // Layer 3: External AI detection (non-blocking — if APIs aren't configured, skip)
  const externalResults = await checkExternalAiDetection(draft.content);
  const externalCheck = passesExternalDetection(externalResults);

  // Merge all feedback
  const allFeedback = [
    ...heuristicFeedback,
    ...llmFeedback,
    ...externalCheck.feedback,
  ];

  const allPassed =
    llmPassed &&
    aiPhrases.length === 0 &&
    learnedHits.length === 0 &&
    structuralIssues.length === 0 &&
    externalCheck.passed;

  const result: ReviewAgentResult = {
    agent: "ai_detection",
    scores: llmScores,
    passed: allPassed,
    feedback: allFeedback,
    suggestions: llmSuggestions,
  };

  return { result, discoveredPatterns, cost };
}

/**
 * Detect structural patterns that are common in AI-generated text.
 */
function detectStructuralPatterns(content: string): string[] {
  const issues: string[] = [];

  // Check for numbered list patterns ("First... Second... Third...")
  const numberedTransitions = content.match(
    /\b(First|Second|Third|Fourth|Fifth|Firstly|Secondly|Thirdly)\b/g
  );
  if (numberedTransitions && numberedTransitions.length >= 3) {
    issues.push(
      `Numbered transitions pattern detected (${numberedTransitions.join(", ")}). This is a strong AI signal. Weave points into the narrative instead.`
    );
  }

  // Check for overuse of transitional adverbs
  const formalTransitions = content.match(
    /\b(Moreover|Furthermore|Additionally|Consequently|Subsequently|Nonetheless|Nevertheless)\b/g
  );
  if (formalTransitions && formalTransitions.length >= 3) {
    issues.push(
      `Overuse of formal transitional adverbs (${formalTransitions.join(", ")}). Replace with conversational connectors or just start new thoughts.`
    );
  }

  // Check for "key takeaways" / "key points" pattern
  if (/\b(key takeaways?|key points?|in summary|to summarize|in conclusion)\b/i.test(content)) {
    issues.push(
      `Contains summary/takeaway section pattern — this is a strong AI tell. Integrate insights throughout instead.`
    );
  }

  // Check for uniform paragraph structure (every para starts with similar pattern)
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 4) {
    const firstWords = paragraphs.map(
      (p) => p.trim().split(/\s+/)[0]?.toLowerCase() ?? ""
    );
    const uniqueFirstWords = new Set(firstWords);
    if (uniqueFirstWords.size < paragraphs.length * 0.5) {
      issues.push(
        `Many paragraphs start with the same words. Vary your paragraph openings more.`
      );
    }
  }

  // Check for excessive hedging language
  const hedges = content.match(
    /\b(it could be argued|one might say|it is worth noting|it should be noted|importantly)\b/gi
  );
  if (hedges && hedges.length >= 3) {
    issues.push(
      `Excessive hedging language (${hedges.length} instances). Be more direct and opinionated.`
    );
  }

  return issues;
}
