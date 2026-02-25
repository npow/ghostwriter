import type {
  ChannelConfig,
  ResearchBrief,
  ContentOutline,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:differentiate" });

export interface DifferentiationBrief {
  contentGaps: string[];
  contrariangles: string[];
  uniqueDataInsights: string[];
  hookIdeas: string[];
  avoidTopics: string[];
}

/**
 * Content Differentiation Stage: Analyze what competitors are saying and find gaps.
 * Runs BEFORE outline to influence the content angle.
 *
 * Three strategies:
 * 1. Content Gap Analysis — what are competitors NOT covering?
 * 2. Hot-Take Injection — use the persona's opinions for contrarian angles
 * 3. Unique Data Cross-referencing — combine data sources for novel insights
 */
export async function runDifferentiationStage(
  config: ChannelConfig,
  brief: ResearchBrief,
  publicationHistoryPrompt?: string
): Promise<{ differentiation: DifferentiationBrief; cost: number }> {
  logger.info({ channelId: config.id }, "Starting differentiation stage");

  // If the research brief is empty, skip the LLM call — it'll just respond conversationally
  if (!brief.summary && brief.keyFacts.length === 0 && brief.narrativeAngles.length === 0) {
    logger.warn({ channelId: config.id }, "Research brief is empty, skipping differentiation");
    return {
      differentiation: {
        contentGaps: [],
        contrariangles: [],
        uniqueDataInsights: [],
        hookIdeas: [],
        avoidTopics: [],
      },
      cost: 0,
    };
  }

  const voice = config.voice;
  const opinions = voice.opinions ?? [];

  const systemPrompt = `You are a content strategist finding ways to make content stand out from the crowd.

CONTEXT:
- Topic: ${config.topic.focus}
- Domain: ${config.topic.domain}
- Content Type: ${config.contentType}
- Writer Persona: ${voice.name} — ${voice.persona}
- Writer's Strong Opinions: ${opinions.join("; ") || "none specified"}

Your job is to analyze the research brief and suggest how to make this piece DIFFERENT from what everyone else publishes about this topic.

Strategy 1 — CONTENT GAPS:
Think about what the typical article on this topic covers. Then identify 3-5 angles, subtopics, or questions that most articles MISS. These are opportunities to rank for long-tail searches and provide unique value.

Strategy 2 — CONTRARIAN ANGLES:
Based on the writer's opinions and persona, suggest 2-3 contrarian takes or hot opinions that would make the piece polarizing and shareable. The writer should disagree with conventional wisdom on something specific. But it must be defensible with data — not just controversial for clicks.

Strategy 3 — UNIQUE DATA INSIGHTS:
Look at the research data and find surprising combinations, correlations, or outliers that most writers would overlook. These become the "only we noticed this" moments.

Strategy 4 — HOOK IDEAS:
Suggest 3-4 opening hooks that are genuinely surprising, specific, or provocative. NO generic openers. Each hook should make someone stop scrolling.

Strategy 5 — TOPICS TO AVOID:
What are the most OVERDONE angles on this topic? List 3-5 things every article already says that we should deliberately skip or subvert.

Respond with JSON:
{
  "contentGaps": ["gap 1 — description", "gap 2 — description"],
  "contrariangles": ["hot take 1 — why it's defensible", "hot take 2"],
  "uniqueDataInsights": ["insight from combining X and Y data", ...],
  "hookIdeas": ["specific hook idea 1", ...],
  "avoidTopics": ["overdone topic 1", ...]
}`;

  const briefSummary = `RESEARCH BRIEF:
Summary: ${brief.summary}

Key Facts:
${brief.keyFacts.map((f) => `- ${f.fact} [${f.source}]`).join("\n")}

Data Points:
${JSON.stringify(brief.dataPoints, null, 2)}

Narrative Angles Already Identified:
${brief.narrativeAngles.join("\n")}`;

  let userPrompt = briefSummary;
  if (publicationHistoryPrompt) {
    userPrompt += `\n\n${publicationHistoryPrompt}\n\nAdd any overlapping topics from the publication history to the avoidTopics list.`;
  }

  const { data: raw, cost } = await callLlmJson<Partial<DifferentiationBrief>>(
    "sonnet",
    systemPrompt,
    userPrompt
  );

  // Normalize: handle both camelCase and snake_case from LLM
  const r = raw as Record<string, unknown>;
  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? (v as string[]) : [];

  const data: DifferentiationBrief = {
    contentGaps: asArr(r.contentGaps ?? r.content_gaps ?? r.gaps ?? []),
    contrariangles: asArr(r.contrariangles ?? r.contrarian_angles ?? r.hotTakes ?? r.hot_takes ?? []),
    uniqueDataInsights: asArr(r.uniqueDataInsights ?? r.unique_data_insights ?? r.uniqueInsights ?? r.unique_insights ?? r.insights ?? []),
    hookIdeas: asArr(r.hookIdeas ?? r.hook_ideas ?? r.hooks ?? []),
    avoidTopics: asArr(r.avoidTopics ?? r.avoid_topics ?? r.topicsToAvoid ?? r.topics_to_avoid ?? []),
  };

  logger.info(
    {
      channelId: config.id,
      gaps: data.contentGaps.length,
      hotTakes: data.contrariangles.length,
      cost,
    },
    "Differentiation stage complete"
  );

  return { differentiation: data, cost };
}

/**
 * Inject differentiation insights into the outline.
 * Modifies the outline to incorporate gap analysis and hot takes.
 */
export function applyDifferentiation(
  outline: ContentOutline,
  diff: DifferentiationBrief
): ContentOutline {
  return {
    ...outline,
    // Upgrade the hook with the best hook idea
    hook: diff.hookIdeas[0] ?? outline.hook,
    sections: outline.sections.map((section, idx) => {
      // Inject a contrarian angle into one section
      if (idx === 1 && diff.contrariangles.length > 0) {
        return {
          ...section,
          keyPoints: [
            ...section.keyPoints,
            `CONTRARIAN TAKE: ${diff.contrariangles[0]}`,
          ],
        };
      }
      // Inject a unique data insight into another section
      if (idx === 2 && diff.uniqueDataInsights.length > 0) {
        return {
          ...section,
          keyPoints: [
            ...section.keyPoints,
            `UNIQUE INSIGHT: ${diff.uniqueDataInsights[0]}`,
          ],
        };
      }
      return section;
    }),
  };
}
