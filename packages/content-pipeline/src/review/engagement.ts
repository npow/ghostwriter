import type { ChannelConfig, ContentDraft, ReviewAgentResult } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

/**
 * Engagement Scorer: Evaluates hook strength, headline quality, and shareability.
 */
export async function runEngagementReview(
  config: ChannelConfig,
  draft: ContentDraft
): Promise<{ result: ReviewAgentResult; cost: number }> {
  const systemPrompt = `You are a content strategist evaluating engagement potential.

Evaluate:
1. **Hook Strength** (1-10): Does the opening grab attention? Would someone keep reading after the first 2 sentences?
2. **Engagement Potential** (1-10): Would readers share this? Comment on it? Save it? Does it provoke thought or emotion?

Consider:
- Is the headline compelling and specific (not generic)?
- Does the intro create curiosity or urgency?
- Are there moments of surprise, insight, or humor throughout?
- Does it end with something that sticks?
- Would this stand out in a social media feed?

Be honest — most content scores 5-6. Reserve 8+ for genuinely compelling work.

Respond with JSON:
{
  "scores": { "hookStrength": N, "engagementPotential": N },
  "passed": true/false (true if all scores >= ${config.qualityGate.minScores.hookStrength}),
  "feedback": ["The hook is too generic because...", "The middle section drags because..."],
  "suggestions": ["Open with the surprising stat about...", "Add a personal anecdote in section 3"]
}`;

  const { data, cost } = await callLlmJson<Omit<ReviewAgentResult, "agent">>(
    "sonnet",
    systemPrompt,
    `Review this ${config.contentType} for engagement:\n\nHEADLINE: ${draft.headline}\n\n${draft.content}`
  );

  return {
    result: { agent: "engagement", ...data },
    cost,
  };
}
