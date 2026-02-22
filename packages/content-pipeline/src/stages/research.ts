import type {
  ChannelConfig,
  SourceMaterial,
  ResearchBrief,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:research" });

/**
 * Research Stage: Analyze ingested data and produce a structured research brief.
 * Uses Sonnet for cost efficiency.
 */
export async function runResearchStage(
  config: ChannelConfig,
  sources: SourceMaterial[]
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

Respond with JSON matching this structure:
{
  "summary": "2-3 sentence overview of what the data shows",
  "keyFacts": [{"fact": "...", "source": "provider name or URL", "sourceUrl": "..."}],
  "narrativeAngles": ["angle 1", "angle 2", ...],
  "dataPoints": { "key": "value pairs of structured data" }
}`;

  const sourceData = sources
    .map(
      (s, i) =>
        `--- Source ${i + 1} [${s.provider}] ${s.title ?? ""} ---\n${s.content}`
    )
    .join("\n\n");

  const userPrompt = `Here is the source data to analyze:\n\n${sourceData}\n\nProduce a research brief as JSON.`;

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
