import type { ChannelConfig, ContentDraft } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import { callLlmJson } from "../llm.js";

const logger = createChildLogger({ module: "pipeline:seo" });

export interface SeoResult {
  optimizedContent: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  focusKeyword: string;
  secondaryKeywords: string[];
  internalLinkSuggestions: string[];
  readabilityScore: number;
  seoScore: number;
}

/**
 * SEO Optimization Stage: Optimize content for search engines without destroying voice.
 * Runs AFTER the quality gate passes — SEO should enhance, not override the human feel.
 */
export async function runSeoStage(
  config: ChannelConfig,
  draft: ContentDraft
): Promise<{ seo: SeoResult; cost: number }> {
  logger.info({ channelId: config.id }, "Starting SEO optimization stage");

  const keywords = config.topic.keywords;
  const focusKeyword = keywords[0] ?? config.topic.focus;

  const systemPrompt = `You are an SEO specialist optimizing content for search.

CRITICAL RULE: Do NOT change the voice, tone, or personality of the writing. Your job is to make surgical, minimal edits that improve SEO without making the content sound like SEO spam.

Tasks:
1. Ensure the focus keyword "${focusKeyword}" appears naturally in:
   - The H1 headline
   - The first 100 words
   - At least 2 subheadings
   - The last paragraph
   But NEVER force it — if it sounds awkward, skip that placement.

2. Ensure secondary keywords appear at least once each: ${keywords.slice(1).join(", ") || "none specified"}

3. Optimize the headline for both click-through and search:
   - Keep it under 60 characters if possible
   - Include the focus keyword near the beginning
   - Make it compelling (question, number, or power word)

4. Generate meta description (150-160 chars, includes focus keyword, compelling CTA)

5. Generate URL slug (lowercase, hyphenated, 3-5 words, includes keyword)

6. Suggest 3-5 internal linking opportunities (topics that could be linked to related content)

7. Add schema-friendly structure:
   - Ensure there are H2 and H3 subheadings every 300-400 words
   - Add a FAQ section at the end if natural (2-3 questions, helps with featured snippets)

Return JSON:
{
  "optimizedContent": "the full article with SEO edits (markdown)",
  "metaTitle": "SEO title (max 60 chars)",
  "metaDescription": "Meta description (150-160 chars)",
  "slug": "url-slug",
  "focusKeyword": "${focusKeyword}",
  "secondaryKeywords": ["kw1", "kw2"],
  "internalLinkSuggestions": ["topic 1", "topic 2"],
  "readabilityScore": 8,
  "seoScore": 8
}`;

  const { data, cost } = await callLlmJson<SeoResult>(
    "sonnet",
    systemPrompt,
    `Optimize this ${config.contentType} for SEO:\n\n${draft.content}`,
    { maxTokens: 8192 }
  );

  logger.info(
    { channelId: config.id, seoScore: data.seoScore, cost },
    "SEO optimization complete"
  );

  return { seo: data, cost };
}
