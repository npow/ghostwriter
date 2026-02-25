import type {
  ChannelConfig,
  ResearchBrief,
  ContentOutline,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:outline" });

/**
 * Outline Stage: Create section-by-section structure from the research brief.
 * Uses Sonnet for cost efficiency.
 */
export async function runOutlineStage(
  config: ChannelConfig,
  brief: ResearchBrief,
  articleHistory?: string
): Promise<{ outline: ContentOutline; cost: number }> {
  logger.info({ channelId: config.id }, "Starting outline stage");

  const systemPrompt = `You are a content strategist creating an outline for a ${config.contentType}.

Topic: ${config.topic.focus}
Target word count: ${config.targetWordCount}
Voice: ${config.voice.name} — ${config.voice.tone} tone

The outline should:
1. Start with a compelling hook/intro
2. Have 3-6 well-structured sections
3. Assign specific data points from the research brief to each section
4. End with a strong conclusion
5. Be designed for the "${config.contentType}" format

Create an outline that will keep readers engaged throughout. Vary section lengths — some should be short and punchy, others more detailed.

${articleHistory ? `\n${articleHistory}\n` : ""}Respond with JSON:
{
  "headline": "Compelling headline",
  "hook": "Opening hook paragraph concept",
  "sections": [
    {
      "title": "Section Title",
      "keyPoints": ["point 1", "point 2"],
      "assignedDataPoints": ["references to specific facts from the brief"],
      "targetWordCount": 250
    }
  ],
  "conclusion": "How to wrap up",
  "estimatedWordCount": 1500
}`;

  const userPrompt = `Research Brief:\n\n${JSON.stringify(brief, null, 2)}\n\nCreate an outline as JSON.`;

  const { data: raw, cost } = await callLlmJson<Record<string, unknown>>(
    "sonnet",
    systemPrompt,
    userPrompt
  );

  const outline: ContentOutline = {
    channelId: config.id,
    headline: (raw.headline ?? raw.title ?? "") as string,
    hook: (raw.hook ?? raw.opening_hook ?? raw.intro ?? "") as string,
    sections: (raw.sections ?? []) as ContentOutline["sections"],
    conclusion: (raw.conclusion ?? raw.closing ?? "") as string,
    estimatedWordCount: (raw.estimatedWordCount ?? raw.estimated_word_count ?? config.targetWordCount) as number,
  };

  logger.info(
    { channelId: config.id, sectionCount: outline.sections.length, cost },
    "Outline stage complete"
  );

  return { outline, cost };
}
