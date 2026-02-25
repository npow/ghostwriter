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
  const sourceData = ranked
    .map((s, i) => {
      const engagement = (s.metadata?.engagementScore as number | undefined);
      const tag = engagement != null ? ` [engagement: ${engagement}]` : "";
      return `--- Source ${i + 1} [${s.provider}]${tag} ${s.title ?? ""} ---\n${s.content}`;
    })
    .join("\n\n");

  let userPrompt = `Here is the source data to analyze:\n\n${sourceData}\n\nProduce a research brief as JSON.`;

  if (publicationHistoryPrompt) {
    userPrompt += `\n\n${publicationHistoryPrompt}\n\nDEPRIORITIZE overlapping topics — find fresh angles or skip topics already covered.`;
  }

  const { data, cost } = await callLlmJson<Omit<ResearchBrief, "channelId" | "sources">>(
    "sonnet",
    systemPrompt,
    userPrompt
  );

  const brief: ResearchBrief = {
    channelId: config.id,
    ...data,
    sources,
  };

  logger.info(
    { channelId: config.id, factCount: brief.keyFacts.length, cost },
    "Research stage complete"
  );

  return { brief, cost };
}
