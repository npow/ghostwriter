import type {
  ChannelConfig,
  ResearchBrief,
  ContentOutline,
  ContentDraft,
  StyleFingerprint,
} from "@auto-blogger/core";
import { AI_PHRASE_BLACKLIST, createChildLogger } from "@auto-blogger/core";
import { callLlm } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:draft" });

/**
 * Draft Stage: Generate full content using Opus for highest quality.
 * Applies style fingerprint, persona, and anti-slop constraints.
 */
export async function runDraftStage(
  config: ChannelConfig,
  brief: ResearchBrief,
  outline: ContentOutline,
  fingerprint?: StyleFingerprint,
  revision?: { number: number; feedback: string[] }
): Promise<{ draft: ContentDraft; cost: number }> {
  logger.info(
    { channelId: config.id, revision: revision?.number ?? 0 },
    "Starting draft stage"
  );

  const voice = config.voice;
  const persona = buildPersonaBlock(voice);
  const styleConstraints = fingerprint
    ? buildStyleConstraints(fingerprint)
    : "";
  const forbiddenPhrases = [
    ...AI_PHRASE_BLACKLIST,
    ...voice.vocabulary.forbidden,
  ];

  const systemPrompt = `You are ${voice.name}, writing a ${config.contentType} about ${config.topic.focus}.

${persona}

WRITING STYLE:
- Tone: ${voice.tone}
- Preferred vocabulary: ${voice.vocabulary.preferred.join(", ") || "no specific preferences"}
${styleConstraints}

ANTI-SLOP RULES (CRITICAL):
1. NEVER use any of these AI-typical phrases: ${forbiddenPhrases.slice(0, 30).join(", ")}
2. ONLY state facts that appear in the Research Brief below. Do NOT invent or hallucinate ANY information.
3. Vary your sentence lengths dramatically — mix 5-word punches with 30+ word flowing sentences.
4. Vary paragraph lengths — some should be 1 sentence, others 4-5 sentences.
5. Use contractions naturally (don't, won't, can't — not "do not", "will not").
6. Start sentences in different ways — never start 3 consecutive sentences the same way.
7. Include at least one sentence fragment or incomplete thought (as humans do).
8. Write like you're talking to a friend who's smart but not an expert.

${revision ? `REVISION ${revision.number}: Address this feedback:\n${revision.feedback.map((f) => `- ${f}`).join("\n")}` : ""}

Write the full ${config.contentType} in markdown format. Target: ${config.targetWordCount} words.`;

  const userPrompt = `RESEARCH BRIEF:
${JSON.stringify(brief.keyFacts, null, 2)}

DATA POINTS:
${JSON.stringify(brief.dataPoints, null, 2)}

OUTLINE:
${JSON.stringify(outline, null, 2)}

Write the full article now. Start with the headline as an H1, then the content. Remember: ONLY use facts from the research brief.`;

  const result = await callLlm("opus", systemPrompt, userPrompt, {
    maxTokens: 8192,
    temperature: 1,
  });

  const wordCount = result.content.split(/\s+/).length;

  const draft: ContentDraft = {
    channelId: config.id,
    headline: outline.headline,
    content: result.content,
    wordCount,
    revision: revision?.number ?? 0,
  };

  logger.info(
    { channelId: config.id, wordCount, cost: result.cost },
    "Draft stage complete"
  );

  return { draft, cost: result.cost };
}

function buildPersonaBlock(voice: ChannelConfig["voice"]): string {
  const parts = [`PERSONA: ${voice.name}`];

  if (voice.age) parts.push(`Age: ${voice.age}`);
  if (voice.backstory) parts.push(`Backstory: ${voice.backstory}`);
  if (voice.opinions?.length) {
    parts.push(`Strong opinions: ${voice.opinions.join("; ")}`);
  }
  if (voice.verbalTics?.length) {
    parts.push(`Verbal tics/habits: ${voice.verbalTics.join(", ")}`);
  }
  parts.push(`Personality: ${voice.persona}`);

  return parts.join("\n");
}

function buildStyleConstraints(fp: StyleFingerprint): string {
  return `
STYLE FINGERPRINT (match these metrics):
- Average sentence length: ${fp.avgSentenceLength.toFixed(1)} words (std dev: ${fp.sentenceLengthStdDev.toFixed(1)})
- Average paragraph length: ${fp.avgParagraphLength.toFixed(1)} words (std dev: ${fp.paragraphLengthStdDev.toFixed(1)})
- Contraction frequency: ${(fp.contractionFrequency * 100).toFixed(0)}% of eligible contractions used
- Question frequency: ${(fp.questionFrequency * 100).toFixed(0)}% of sentences are questions
- First-person usage: ${(fp.firstPersonFrequency * 100).toFixed(0)}% of sentences
- Second-person usage: ${(fp.secondPersonFrequency * 100).toFixed(0)}% of sentences
- Opening style: ${fp.openingStyle}
- Closing style: ${fp.closingStyle}`;
}
