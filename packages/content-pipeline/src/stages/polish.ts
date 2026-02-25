import type {
  ChannelConfig,
  ContentDraft,
  ResearchBrief,
  ReviewResult,
} from "@ghostwriter/core";
import { AI_PHRASE_BLACKLIST, createChildLogger, getActivePhrases } from "@ghostwriter/core";
import { callLlm } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:polish" });

/**
 * Polish Stage: Apply review feedback to the draft.
 * Uses Sonnet for cost efficiency since changes are targeted.
 */
export async function runPolishStage(
  config: ChannelConfig,
  draft: ContentDraft,
  review: ReviewResult,
  brief?: ResearchBrief
): Promise<{ polished: ContentDraft; cost: number }> {
  logger.info({ channelId: config.id }, "Starting polish stage");

  const allFeedback = review.agentResults.flatMap((r) => [
    ...r.feedback,
    ...r.suggestions,
  ]);

  const voice = config.voice;
  const learnedPhrases = await getActivePhrases(config.id).catch(() => []);
  const forbiddenPhrases = [
    ...AI_PHRASE_BLACKLIST,
    ...voice.vocabulary.forbidden,
    ...learnedPhrases,
  ];

  const currentWordCount = draft.content.split(/\s+/).length;

  const systemPrompt = `You are ${voice.name}, polishing a ${config.contentType}.

Your job is to improve the draft based on specific feedback. Make targeted edits — do NOT rewrite from scratch.

RULES:
- Maintain the existing structure and voice
- Only change what the feedback specifically calls out
- NEVER introduce any of these phrases: ${forbiddenPhrases.slice(0, 20).join(", ")}
- If the fact checker flagged incorrect claims, FIX them using the RESEARCH BRIEF below. Replace wrong facts with correct ones from the sources. If a claim has no source backing, REMOVE it rather than guessing.
- Do NOT invent new facts. Only use information present in the research brief.

CRITICAL — WORD COUNT: The current draft is ${currentWordCount} words. Your revision MUST be between ${Math.round(currentWordCount * 0.9)} and ${Math.round(currentWordCount * 1.1)} words. Do NOT shorten the article. If you remove a section, replace it with equivalent content. Output the COMPLETE article — do not summarize or truncate.

Return the improved full article in markdown format.`;

  const briefSection = brief
    ? `\nRESEARCH BRIEF (use this to correct any factual errors):
Summary: ${brief.summary}
Key Facts:
${brief.keyFacts.map((f) => `- ${f.fact} [${f.source}]`).join("\n")}
`
    : "";

  const userPrompt = `CURRENT DRAFT:
${draft.content}

FEEDBACK TO ADDRESS:
${allFeedback.map((f) => `- ${f}`).join("\n")}

SCORES:
${JSON.stringify(review.aggregateScores, null, 2)}
${briefSection}
Apply the feedback and return the improved article.`;

  const result = await callLlm("sonnet", systemPrompt, userPrompt, {
    maxTokens: 8192,
  });

  const polishedWordCount = result.content.split(/\s+/).length;

  // Reject polished content that lost more than 30% of its word count —
  // the LLM sometimes summarizes instead of editing
  if (polishedWordCount < currentWordCount * 0.7) {
    logger.warn(
      { channelId: config.id, original: currentWordCount, polished: polishedWordCount },
      "Polish shrank content too much — keeping original draft"
    );
    return {
      polished: { ...draft, revision: draft.revision + 1 },
      cost: result.cost,
    };
  }

  const polished: ContentDraft = {
    channelId: config.id,
    headline: draft.headline,
    content: result.content,
    wordCount: polishedWordCount,
    revision: draft.revision + 1,
  };

  logger.info(
    { channelId: config.id, original: currentWordCount, polished: polishedWordCount, cost: result.cost },
    "Polish stage complete"
  );

  return { polished, cost: result.cost };
}
