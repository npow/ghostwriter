import type { ChannelConfig, ContentDraft, ReviewAgentResult } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

/**
 * Editor Review Agent: Evaluates structure, flow, readability, and voice compliance.
 */
export async function runEditorReview(
  config: ChannelConfig,
  draft: ContentDraft
): Promise<{ result: ReviewAgentResult; cost: number }> {
  const systemPrompt = `You are a senior editor reviewing a ${config.contentType} written by ${config.voice.name}.

Evaluate the following aspects:

1. **Structure** (1-10): Is the piece well-organized? Good flow between sections? Strong intro and conclusion? IMPORTANT: The article MUST include a "Cheat Sheet" or "Quick Reference" summary section near the end (before any FAQ). This should be a scannable table or bullet list recapping every tool, technique, or tip mentioned. If this section is missing, cap the structure score at 5. If it exists but is incomplete (missing tools/tips from the body), cap at 7.
2. **Readability** (1-10): Is it easy to read? Good sentence variety? Clear language? Appropriate for the target audience?
3. **Voice Match** (1-10): Does it sound like ${config.voice.name}? Tone: ${config.voice.tone}. ${config.voice.persona}

For each score below 8, provide specific, actionable feedback on what to fix.

Respond with JSON:
{
  "scores": { "structure": N, "readability": N, "voiceMatch": N },
  "passed": true/false (true if all scores >= ${config.qualityGate.minScores.structure}),
  "feedback": ["issue 1", "issue 2"],
  "suggestions": ["fix 1", "fix 2"]
}`;

  const { data, cost } = await callLlmJson<Omit<ReviewAgentResult, "agent">>(
    "sonnet",
    systemPrompt,
    `Review this ${config.contentType}:\n\n${draft.content}`
  );

  return {
    result: { agent: "editor", ...data },
    cost,
  };
}
