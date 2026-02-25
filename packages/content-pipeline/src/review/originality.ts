import type {
  ChannelConfig,
  ContentDraft,
  ReviewAgentResult,
  PublicationHistory,
} from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

/**
 * Originality Review Agent: Evaluates topic uniqueness and angle freshness
 * against previously published content.
 *
 * Auto-passes with score 9 and cost 0 when no publication history exists.
 */
export async function runOriginalityReview(
  config: ChannelConfig,
  draft: ContentDraft,
  publicationHistory?: PublicationHistory
): Promise<{ result: ReviewAgentResult; cost: number }> {
  // Auto-pass when no history — nothing to compare against
  if (!publicationHistory || publicationHistory.items.length === 0) {
    return {
      result: {
        agent: "originality",
        scores: { topicOriginality: 9, angleFreshness: 9 },
        passed: true,
        feedback: [],
        suggestions: [],
      },
      cost: 0,
    };
  }

  const historyBlock = publicationHistory.items
    .map(
      (item) =>
        `- "${item.headline}" (${item.publishedAt.slice(0, 10)}): ${item.summary}...`
    )
    .join("\n");

  const systemPrompt = `You are an originality reviewer for a ${config.contentType} channel called "${config.name}".

Your job is to compare a new draft against previously published content and score how ORIGINAL it is. Readers who follow this channel regularly should NOT feel like they're reading the same thing again.

PREVIOUSLY PUBLISHED (${publicationHistory.items.length} items):
${historyBlock}

SCORING RUBRIC:

**Topic Originality** (1-10) — Is this a genuinely new topic for this channel?
- 9-10: Completely new territory. We've never covered anything like this.
- 7-8: Related domain but a clearly distinct topic or angle.
- 5-6: Similar topic area to past content but with enough new info to justify it.
- 3-4: Feels like a rehash. A regular reader would think "oh, this again."
- 1-2: Nearly identical to a previously published piece.

**Angle Freshness** (1-10) — Even if the topic overlaps, is the ANGLE fresh?
- 9-10: Completely novel perspective, framing, or argument.
- 7-8: Fresh take that adds meaningful new value even if the topic is familiar.
- 5-6: Some new elements but the core argument feels recycled.
- 3-4: Minor variation on a previously used angle.
- 1-2: Copy-paste of a previous angle with different examples.

For each score below 7, provide specific feedback referencing which past article(s) overlap.

Respond with JSON:
{
  "scores": { "topicOriginality": N, "angleFreshness": N },
  "passed": true/false (true if both scores >= ${config.qualityGate.minScores.topicOriginality ?? 6}),
  "feedback": ["issue 1 referencing specific past article", ...],
  "suggestions": ["how to differentiate from past content", ...]
}`;

  const { data, cost } = await callLlmJson<Omit<ReviewAgentResult, "agent">>(
    "sonnet",
    systemPrompt,
    `Review this draft for originality:\n\nHeadline: ${draft.headline}\n\n${draft.content}`
  );

  return {
    result: { agent: "originality", ...data },
    cost,
  };
}
