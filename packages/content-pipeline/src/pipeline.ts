import type {
  ChannelConfig,
  SourceMaterial,
  ContentDraft,
  PlatformContent,
  ReviewResult,
  StyleFingerprint,
} from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";
import {
  runResearchStage,
  runOutlineStage,
  runDraftStage,
  runPolishStage,
  runAdaptStage,
} from "./stages/index.js";
import { runReviewStage } from "./review/index.js";

const logger = createChildLogger({ module: "content-pipeline" });

export interface PipelineResult {
  channelId: string;
  draft: ContentDraft;
  review: ReviewResult;
  adaptations: PlatformContent[];
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
 * Run the full content pipeline: Research → Outline → Draft → Review → Polish → Adapt
 */
export async function runPipeline(
  config: ChannelConfig,
  sources: SourceMaterial[],
  options?: {
    fingerprint?: StyleFingerprint;
    callbacks?: PipelineCallbacks;
    skipAdapt?: boolean;
  }
): Promise<PipelineResult> {
  const { fingerprint, callbacks, skipAdapt } = options ?? {};
  let totalCost = 0;

  // Stage 1: Research
  callbacks?.onStageStart?.("research");
  const { brief, cost: researchCost } = await runResearchStage(config, sources);
  totalCost += researchCost;
  callbacks?.onStageComplete?.("research", researchCost);

  // Stage 2: Outline
  callbacks?.onStageStart?.("outline");
  const { outline, cost: outlineCost } = await runOutlineStage(config, brief);
  totalCost += outlineCost;
  callbacks?.onStageComplete?.("outline", outlineCost);

  // Stage 3: Draft
  callbacks?.onStageStart?.("draft");
  let { draft, cost: draftCost } = await runDraftStage(
    config,
    brief,
    outline,
    fingerprint
  );
  totalCost += draftCost;
  callbacks?.onStageComplete?.("draft", draftCost);

  // Stage 4: Review + Revision Loop
  const maxRevisions = config.qualityGate.maxRevisions;
  let review: ReviewResult;
  let revisionCount = 0;

  for (let i = 0; i <= maxRevisions; i++) {
    callbacks?.onStageStart?.("review");
    const reviewResult = await runReviewStage(config, draft, brief);
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
      review
    );
    draft = polished;
    totalCost += polishCost;
    callbacks?.onStageComplete?.("polish", polishCost);
  }

  // Stage 5: Adapt for platforms
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
    review: review!,
    adaptations,
    totalCost,
    revisions: revisionCount,
    passed: review!.passed,
  };
}
