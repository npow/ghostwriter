import type {
  ChannelConfig,
  SourceMaterial,
  ResearchBrief,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { callLlmJson, findArraysOfObjects, findStringArrays, findLongestString, snakeToCamel } from "../llm.js";

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

  // ─── Shape-based normalization ───
  // Instead of guessing field names, search the response by data shape.

  // 1. Summary: find the longest string (likely the overview/summary)
  const summary = String(raw.summary ?? raw.executive_summary ?? raw.overview ?? "")
    || findLongestString(raw);

  // 2. keyFacts: find arrays of objects, then pick the one that looks like facts
  let keyFacts: ResearchBrief["keyFacts"] = [];
  // First try explicit field names (fast path)
  const explicitFactsKey = Object.keys(raw).find((k) => {
    const camel = snakeToCamel(k);
    return ["keyFacts", "findings", "keyThemes", "facts", "researchFindings", "primaryTopics", "topics", "keyFindings", "insights"].includes(camel);
  });
  if (explicitFactsKey && Array.isArray(raw[explicitFactsKey])) {
    keyFacts = normalizeFactArray(raw[explicitFactsKey] as unknown[]);
  }
  // Fallback: find the largest array of objects in the entire response
  if (keyFacts.length === 0) {
    const objectArrays = findArraysOfObjects(raw);
    for (const arr of objectArrays) {
      const normalized = normalizeFactArray(arr);
      if (normalized.length > 0) {
        keyFacts = normalized;
        break;
      }
    }
  }

  // 3. narrativeAngles: find string arrays
  let narrativeAngles: string[] = [];
  const explicitAnglesKey = Object.keys(raw).find((k) => {
    const camel = snakeToCamel(k);
    return ["narrativeAngles", "angles", "suggestedAngles", "contentAngles", "perspectives"].includes(camel);
  });
  if (explicitAnglesKey && Array.isArray(raw[explicitAnglesKey])) {
    narrativeAngles = (raw[explicitAnglesKey] as unknown[]).filter((x): x is string => typeof x === "string");
  }
  if (narrativeAngles.length === 0) {
    // Find string arrays that aren't the keyFacts source fields
    const stringArrays = findStringArrays(raw);
    if (stringArrays.length > 0) {
      narrativeAngles = stringArrays[0];
    }
  }

  // 4. dataPoints: find any remaining object that isn't an array
  const dataPoints = (raw.dataPoints ?? raw.data_points ?? raw.data ?? raw.statistics ?? {}) as Record<string, unknown>;

  const brief: ResearchBrief = {
    channelId: config.id,
    summary,
    keyFacts,
    narrativeAngles,
    dataPoints,
    sources,
  };

  logger.info(
    { channelId: config.id, factCount: brief.keyFacts.length, cost },
    "Research stage complete"
  );

  return { brief, cost };
}

/**
 * Normalize an array of unknown objects into fact objects.
 * Handles many different field name conventions the LLM might use.
 */
function normalizeFactArray(arr: unknown[]): ResearchBrief["keyFacts"] {
  return arr
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .map((obj) => {
      // Find the main fact/description text — try many possible field names
      const fact = String(
        obj.fact ?? obj.finding ?? obj.theme ?? obj.title ?? obj.description
        ?? obj.summary ?? obj.topic ?? obj.insight ?? obj.point ?? obj.content
        ?? obj.key_fact ?? obj.key_finding ?? obj.observation ?? obj.detail
        ?? ""
      );
      if (!fact) return null;

      const source = String(
        obj.source ?? obj.sources ?? obj.sourceUrl ?? obj.source_url ?? obj.url
        ?? obj.reference ?? obj.origin ?? "analysis"
      );
      const sourceUrl = String(
        obj.sourceUrl ?? obj.source_url ?? obj.url ?? obj.link ?? obj.href ?? ""
      );

      return { fact, source, sourceUrl };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.fact.length > 0);
}
