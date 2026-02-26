import type {
  ChannelConfig,
  ContentDraft,
  ResearchBrief,
  ReviewAgentResult,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

const logger = createChildLogger({ module: "review:fact-checker" });

/**
 * Fact-Checker Review Agent: Verifies every claim traces back to source data.
 */
export async function runFactCheckerReview(
  config: ChannelConfig,
  draft: ContentDraft,
  brief: ResearchBrief
): Promise<{ result: ReviewAgentResult; cost: number }> {
  const systemPrompt = `You are a fact-checker reviewing a ${config.contentType}.

IMPORTANT CONTEXT: This article is written in a first-person persona voice ("${config.voice.name}"). The persona is a character with opinions and experiences. First-person narrative framing like "I deployed...", "I switched to...", "Here's what I found...", "I've been running..." is EXPECTED and part of the voice design — these are NOT factual claims to verify. They are storytelling devices.

What you SHOULD flag as hallucinations:
- Specific statistics, numbers, pricing, or percentages not in the research brief (e.g., "saves 40% on hosting costs", "$5/month", "10x faster")
- Named product features or capabilities not in the research brief (e.g., "Tool X supports automatic failover" when the brief doesn't mention this)
- Competitor comparisons with specific claims not in the research brief
- Attribution of quotes or statements to specific people/companies not in the brief
- Specific timing claims ("launched in 2024", "has been around for 5 years") not in the brief

What you should NOT flag:
- First-person experience narratives (persona voice — these are by design)
- General opinions or recommendations ("I'd pick X over Y" — this is voice, not a factual claim)
- Common knowledge about well-known tools (e.g., "Docker uses containers", "Nginx is a reverse proxy")
- Hedged or qualified statements ("you might find that...", "in my experience...")

Your job:
1. Identify concrete, verifiable factual claims (statistics, features, pricing, comparisons)
2. Check each against the Research Brief
3. Flag only claims that are specific, verifiable, AND not in the brief
4. Check if important data from the brief was omitted

Score:
- **Factual Accuracy** (1-10): Are verifiable claims supported by sources? 10 = every concrete fact verified, 1 = many hallucinated statistics/features
- **Source Coverage** (1-10): How well does the draft use the available data? 10 = all key facts used, 1 = most data ignored

CRITICAL: For every hallucination you flag, you MUST provide an actionable correction in "suggestions" using actual data from the research brief. The writer needs to know what to replace the hallucinated claim with. Format each suggestion as:
- "REPLACE: '<hallucinated text>' → '<corrected text using brief data>' (source: <brief fact>)"
- If there's no relevant brief fact to substitute, say: "REMOVE: '<hallucinated text>' — no supporting data in brief. Use qualitative language instead (e.g., 'significantly cheaper' instead of specific pricing)."

Also include suggestions for unused brief facts that would strengthen the article.

Respond with JSON:
{
  "scores": { "factualAccuracy": N, "sourceCoverage": N },
  "passed": true/false (true if all scores >= ${config.qualityGate.minScores.factualAccuracy}),
  "feedback": ["HALLUCINATION: '<exact quote>' — <why it's wrong>"],
  "suggestions": ["REPLACE: '<old>' → '<new>' (source: <brief fact>)", "ADD: <unused brief fact that would improve the article>"]
}`;

  const userPrompt = `RESEARCH BRIEF (ground truth):
${JSON.stringify(brief.keyFacts, null, 2)}

DATA POINTS:
${JSON.stringify(brief.dataPoints, null, 2)}

DRAFT TO VERIFY:
${draft.content}

Check every factual claim in the draft against the research brief.`;

  try {
    const { data, cost } = await callLlmJson<Omit<ReviewAgentResult, "agent">>(
      "sonnet",
      systemPrompt,
      userPrompt
    );

    return {
      result: { agent: "fact_checker", ...data },
      cost,
    };
  } catch (err) {
    logger.warn({ err, channelId: config.id }, "Fact-checker review LLM call failed, returning default failed result");
    return {
      result: {
        agent: "fact_checker",
        scores: {},
        passed: false,
        feedback: ["Fact-checker review agent failed to produce valid response — will retry on next revision"],
        suggestions: [],
      },
      cost: 0,
    };
  }
}
