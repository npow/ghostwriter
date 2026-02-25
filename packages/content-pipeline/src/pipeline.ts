import type {
  ChannelConfig,
  SourceMaterial,
  ContentDraft,
  PlatformContent,
  ReviewResult,
  StyleFingerprint,
  PublicationHistory,
} from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import {
  runResearchStage,
  runDifferentiationStage,
  applyDifferentiation,
  runOutlineStage,
  runDraftStage,
  runPolishStage,
  runSeoStage,
  runAdaptStage,
} from "./stages/index.js";
import { runReviewStage, runFactCheckerReview } from "./review/index.js";
import type { SeoResult } from "./stages/seo.js";
import type { DifferentiationBrief } from "./stages/differentiate.js";

const logger = createChildLogger({ module: "content-pipeline" });

export interface PipelineResult {
  channelId: string;
  draft: ContentDraft;
  review: ReviewResult;
  adaptations: PlatformContent[];
  seo?: SeoResult;
  differentiation?: DifferentiationBrief;
  totalCost: number;
  revisions: number;
  passed: boolean;
}

export interface PipelineCallbacks {
  onStageStart?: (stage: string) => void;
  onStageComplete?: (stage: string, cost: number) => void;
  onRevision?: (revision: number, feedback: string[]) => void;
}

/**
 * Run the full content pipeline:
 * Research → Differentiate → Outline → Draft → Review → Polish → SEO → Adapt
 */
export async function runPipeline(
  config: ChannelConfig,
  sources: SourceMaterial[],
  options?: {
    fingerprint?: StyleFingerprint;
    callbacks?: PipelineCallbacks;
    skipAdapt?: boolean;
    skipSeo?: boolean;
    skipDifferentiation?: boolean;
    performanceContext?: string;
    publicationHistoryPrompt?: string;
    publicationHistory?: PublicationHistory;
  }
): Promise<PipelineResult> {
  const { fingerprint, callbacks, skipAdapt, skipSeo, skipDifferentiation, performanceContext, publicationHistoryPrompt, publicationHistory } =
    options ?? {};
  let totalCost = 0;

  // Stage 1: Research
  callbacks?.onStageStart?.("research");
  const { brief, cost: researchCost } = await runResearchStage(config, sources, publicationHistoryPrompt);
  totalCost += researchCost;
  callbacks?.onStageComplete?.("research", researchCost);

  // Stage 2: Differentiation (find content gaps and contrarian angles)
  let differentiation: DifferentiationBrief | undefined;
  if (!skipDifferentiation) {
    callbacks?.onStageStart?.("differentiate");
    const diffResult = await runDifferentiationStage(config, brief, publicationHistoryPrompt);
    differentiation = diffResult.differentiation;
    totalCost += diffResult.cost;
    callbacks?.onStageComplete?.("differentiate", diffResult.cost);
  }

  // Stage 3: Outline
  callbacks?.onStageStart?.("outline");
  let { outline, cost: outlineCost } = await runOutlineStage(config, brief, performanceContext);
  totalCost += outlineCost;
  callbacks?.onStageComplete?.("outline", outlineCost);

  // Apply differentiation insights to the outline
  if (differentiation) {
    outline = applyDifferentiation(outline, differentiation);
  }

  // Stage 4: Draft (with performance insights from past content)
  callbacks?.onStageStart?.("draft");
  let { draft, cost: draftCost } = await runDraftStage(
    config,
    brief,
    outline,
    fingerprint,
    undefined,
    performanceContext
  );
  totalCost += draftCost;
  callbacks?.onStageComplete?.("draft", draftCost);

  // Stage 5: Review + Revision Loop
  const maxRevisions = config.qualityGate.maxRevisions;
  let review: ReviewResult | undefined;
  let revisionCount = 0;

  for (let i = 0; i <= maxRevisions; i++) {
    callbacks?.onStageStart?.("review");
    const reviewResult = await runReviewStage(config, draft, brief, publicationHistory);
    review = reviewResult.review;
    totalCost += reviewResult.cost;
    callbacks?.onStageComplete?.("review", reviewResult.cost);

    if (review.passed) {
      logger.info(
        { channelId: config.id, revision: i },
        "Review passed"
      );
      break;
    }

    if (i === maxRevisions) {
      logger.warn(
        { channelId: config.id, revision: i },
        "Max revisions reached, content going to dead letter queue"
      );
      break;
    }

    // Polish and re-draft
    revisionCount++;
    const allFeedback = review.agentResults.flatMap((r) => r.feedback);
    callbacks?.onRevision?.(revisionCount, allFeedback);

    callbacks?.onStageStart?.("polish");
    const { polished, cost: polishCost } = await runPolishStage(
      config,
      draft,
      review,
      brief
    );
    draft = polished;
    totalCost += polishCost;
    callbacks?.onStageComplete?.("polish", polishCost);

    // Re-run fact-checker on polished content to catch introduced hallucinations
    callbacks?.onStageStart?.("fact-check-post-polish");
    const factCheck = await runFactCheckerReview(config, draft, brief);
    totalCost += factCheck.cost;
    callbacks?.onStageComplete?.("fact-check-post-polish", factCheck.cost);

    if (!factCheck.result.passed) {
      logger.warn(
        { channelId: config.id, revision: revisionCount },
        "Polish introduced factual issues, feedback will be included in next review"
      );
    }
  }

  if (!review) {
    throw new Error(
      "Review stage did not execute — check qualityGate.maxRevisions"
    );
  }

  // Stage 6: SEO Optimization (after quality gate, so we don't SEO-ify bad content)
  let seo: SeoResult | undefined;
  if (!skipSeo && review.passed) {
    callbacks?.onStageStart?.("seo");
    const seoResult = await runSeoStage(config, draft);
    seo = seoResult.seo;
    totalCost += seoResult.cost;
    callbacks?.onStageComplete?.("seo", seoResult.cost);

    // Use the SEO-optimized content for adaptation
    if (seo.optimizedContent) {
      draft = {
        ...draft,
        content: seo.optimizedContent,
        headline: seo.metaTitle || draft.headline,
      };
    }
  }

  // Stage 7: Adapt for platforms
  let adaptations: PlatformContent[] = [];
  if (!skipAdapt) {
    callbacks?.onStageStart?.("adapt");
    const adaptResult = await runAdaptStage(config, draft);
    adaptations = adaptResult.adaptations;
    totalCost += adaptResult.cost;
    callbacks?.onStageComplete?.("adapt", adaptResult.cost);
  }

  return {
    channelId: config.id,
    draft,
    review,
    adaptations,
    seo,
    differentiation,
    totalCost,
    revisions: revisionCount,
    passed: review.passed,
  };
}
