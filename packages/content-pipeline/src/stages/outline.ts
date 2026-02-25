import type {
  ChannelConfig,
  ResearchBrief,
  ContentOutline,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson, findArraysOfObjects, findLongestString } from "../llm.js";

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

  // ─── Shape-based section extraction ───
  // The LLM uses different key names for sections across runs.
  // Try explicit keys first, then fall back to finding any array of objects.
  let sections: ContentOutline["sections"] = [];

  const normalizeSections = (arr: Array<Record<string, unknown>>): ContentOutline["sections"] =>
    arr.map((s) => ({
      title: String(s.title ?? s.heading ?? s.section ?? s.name ?? s.sectionTitle ?? s.section_title ?? ""),
      keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints as string[]
        : Array.isArray(s.key_points) ? s.key_points as string[]
        : Array.isArray(s.points) ? s.points as string[]
        : Array.isArray(s.topics) ? s.topics as string[]
        : Array.isArray(s.content) ? s.content as string[]
        : [],
      assignedDataPoints: Array.isArray(s.assignedDataPoints) ? s.assignedDataPoints as string[]
        : Array.isArray(s.assigned_data_points) ? s.assigned_data_points as string[]
        : Array.isArray(s.dataPoints) ? s.dataPoints as string[]
        : Array.isArray(s.data_points) ? s.data_points as string[]
        : [],
      targetWordCount: (s.targetWordCount ?? s.target_word_count ?? s.wordCount ?? s.word_count ?? 250) as number,
    })).filter((s) => s.title.length > 0);

  // Try explicit key names
  for (const key of ["sections", "outline", "content_sections", "body", "body_sections", "main_sections"]) {
    if (Array.isArray(raw[key]) && (raw[key] as unknown[]).length > 0) {
      sections = normalizeSections(raw[key] as Array<Record<string, unknown>>);
      if (sections.length > 0) break;
    }
  }

  // Fallback: find any array of objects that looks like sections
  if (sections.length === 0) {
    const objectArrays = findArraysOfObjects(raw);
    for (const arr of objectArrays) {
      // A section array should have objects with title-like fields
      if (arr.some((obj) => obj.title || obj.heading || obj.section || obj.name || obj.sectionTitle)) {
        sections = normalizeSections(arr);
        if (sections.length > 0) break;
      }
    }
  }

  // Log what keys we found if sections are still empty
  if (sections.length === 0) {
    logger.warn(
      { channelId: config.id, rawKeys: Object.keys(raw), rawKeysTypes: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? `array(${(v as unknown[]).length})` : typeof v])) },
      "Could not extract sections from outline response"
    );
  }

  const headline = String(raw.headline ?? raw.title ?? raw.working_title ?? raw.suggested_headline ?? "")
    || findLongestString(raw).slice(0, 200);

  const outline: ContentOutline = {
    channelId: config.id,
    headline,
    hook: (raw.hook ?? raw.opening_hook ?? raw.intro ?? "") as string,
    sections,
    conclusion: (raw.conclusion ?? raw.closing ?? "") as string,
    estimatedWordCount: (raw.estimatedWordCount ?? raw.estimated_word_count ?? config.targetWordCount) as number,
  };

  logger.info(
    { channelId: config.id, sectionCount: outline.sections.length, cost },
    "Outline stage complete"
  );

  return { outline, cost };
}
