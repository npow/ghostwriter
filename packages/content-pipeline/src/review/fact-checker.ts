import type {
  ChannelConfig,
  ContentDraft,
  ResearchBrief,
  ReviewAgentResult,
} from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

/**
 * Fact-Checker Review Agent: Verifies every claim traces back to source data.
 */
export async function runFactCheckerReview(
  config: ChannelConfig,
  draft: ContentDraft,
  brief: ResearchBrief
): Promise<{ result: ReviewAgentResult; cost: number }> {
  const systemPrompt = `You are a fact-checker reviewing a ${config.contentType}.

Your job:
1. Identify every factual claim in the draft
2. Check each claim against the Research Brief (provided below)
3. Flag any claim that does NOT appear in the research brief as a potential hallucination
4. Check if important data from the brief was omitted

Score:
- **Factual Accuracy** (1-10): Are all claims supported by sources? 10 = every fact verified, 1 = many hallucinated claims
- **Source Coverage** (1-10): How well does the draft use the available data? 10 = all key facts used, 1 = most data ignored

Be strict. A single hallucinated data point should drop factual accuracy below 7.

Respond with JSON:
{
  "scores": { "factualAccuracy": N, "sourceCoverage": N },
  "passed": true/false (true if all scores >= ${config.qualityGate.minScores.factualAccuracy}),
  "feedback": ["issue 1 - specific hallucinated or unsupported claim"],
  "suggestions": ["Replace X with Y from the brief", "Add data point about Z"]
}`;

  const userPrompt = `RESEARCH BRIEF (ground truth):
${JSON.stringify(brief.keyFacts, null, 2)}

DATA POINTS:
${JSON.stringify(brief.dataPoints, null, 2)}

DRAFT TO VERIFY:
${draft.content}

Check every factual claim in the draft against the research brief.`;

  const { data, cost } = await callLlmJson<Omit<ReviewAgentResult, "agent">>(
    "sonnet",
    systemPrompt,
    userPrompt
  );

  return {
    result: { agent: "fact_checker", ...data },
    cost,
  };
}
