import type {
  ChannelConfig,
  SourceMaterial,
  ResearchBrief,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:research" });

/**
 * Sort sources by engagement score (highest first), unscored items last.
 */
function rankSources(sources: SourceMaterial[]): SourceMaterial[] {
  return [...sources].sort((a, b) => {
    const scoreA =
      (a.metadata?.engagementScore as number | undefined) ?? -1;
    const scoreB =
      (b.metadata?.engagementScore as number | undefined) ?? -1;
    return scoreB - scoreA;
  });
}

/**
 * Research Stage: Analyze ingested data and produce a structured research brief.
 * Uses Sonnet for cost efficiency.
 */
export async function runResearchStage(
  config: ChannelConfig,
  sources: SourceMaterial[],
  publicationHistoryPrompt?: string
): Promise<{ brief: ResearchBrief; cost: number }> {
  logger.info(
    { channelId: config.id, sourceCount: sources.length },
    "Starting research stage"
  );

  const systemPrompt = `You are a research analyst preparing a brief for a content writer.

Your job:
1. Analyze the provided source data
2. Extract key facts with their sources
3. Identify interesting narrative angles
4. Organize data points for the writer

Topic: ${config.topic.focus}
Domain: ${config.topic.domain}
Content Type: ${config.contentType}
${config.topic.constraints ? `Constraints: ${config.topic.constraints}` : ""}

CRITICAL RULES:
- ONLY include facts that appear in the source data. Do NOT invent or hallucinate any information.
- Every fact must be traceable to a specific source.
- If data is sparse, note gaps honestly — do not fill them with made-up information.
- PRIORITIZE topics with higher engagement scores — these are trending and resonate with audiences.

Respond with JSON matching this structure:
{
  "summary": "2-3 sentence overview of what the data shows",
  "keyFacts": [{"fact": "...", "source": "provider name or URL", "sourceUrl": "..."}],
  "narrativeAngles": ["angle 1", "angle 2", ...],
  "dataPoints": { "key": "value pairs of structured data" }
}`;

  const ranked = rankSources(sources);

  // Truncate each source to keep the prompt within LLM context limits.
  // 45 sources × 600 chars ≈ 27k chars, well within bounds.
  const MAX_SOURCE_CHARS = 600;

  const sourceData = ranked
    .map((s, i) => {
      const engagement = (s.metadata?.engagementScore as number | undefined);
      const tag = engagement != null ? ` [engagement: ${engagement}]` : "";
      const content = s.content.length > MAX_SOURCE_CHARS
        ? s.content.slice(0, MAX_SOURCE_CHARS) + "…"
        : s.content;
      return `--- Source ${i + 1} [${s.provider}]${tag} ${s.title ?? ""} ---\n${content}`;
    })
    .join("\n\n");

  let userPrompt = `Here is the source data to analyze:\n\n${sourceData}\n\nProduce a research brief as JSON.`;

  if (publicationHistoryPrompt) {
    userPrompt += `\n\n${publicationHistoryPrompt}\n\nDEPRIORITIZE overlapping topics — find fresh angles or skip topics already covered.`;
  }

  const { data: raw, cost } = await callLlmJson<Record<string, unknown>>(
    "sonnet",
    systemPrompt,
    userPrompt
  );

  // Normalize alternative field names the LLM may use
  const summary = String(raw.summary ?? raw.executive_summary ?? "");

  // Extract keyFacts from various formats
  let keyFacts: ResearchBrief["keyFacts"] = [];
  if (Array.isArray(raw.keyFacts)) {
    keyFacts = raw.keyFacts as ResearchBrief["keyFacts"];
  } else if (Array.isArray(raw.key_facts)) {
    keyFacts = raw.key_facts as ResearchBrief["keyFacts"];
  } else if (Array.isArray(raw.findings)) {
    keyFacts = raw.findings as ResearchBrief["keyFacts"];
  } else if (Array.isArray(raw.key_themes)) {
    // LLM sometimes returns themes instead of facts — convert them
    keyFacts = (raw.key_themes as Array<Record<string, unknown>>).map((t) => ({
      fact: String(t.theme ?? t.title ?? t.summary ?? JSON.stringify(t)),
      source: String(t.source ?? t.sources ?? "analysis"),
      sourceUrl: String(t.sourceUrl ?? t.source_url ?? t.url ?? ""),
    }));
  }

  // Extract narrative angles from various fields
  let narrativeAngles: string[] = [];
  if (Array.isArray(raw.narrativeAngles)) {
    narrativeAngles = raw.narrativeAngles as string[];
  } else if (Array.isArray(raw.narrative_angles)) {
    narrativeAngles = raw.narrative_angles as string[];
  } else if (Array.isArray(raw.angles)) {
    narrativeAngles = raw.angles as string[];
  }

  const brief: ResearchBrief = {
    channelId: config.id,
    summary,
    keyFacts,
    narrativeAngles,
    dataPoints: (raw.dataPoints ?? raw.data_points ?? raw.data ?? {}) as Record<string, unknown>,
    sources,
  };

  logger.info(
    { channelId: config.id, factCount: brief.keyFacts.length, cost },
    "Research stage complete"
  );

  return { brief, cost };
}
