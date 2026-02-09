import {
  proxyActivities,
  sleep,
  defineSignal,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "./activities.js";

const {
  loadConfig,
  ingestSources,
  loadStyleFingerprint,
  runContentPipeline,
  publishContent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
  },
});

// Signals & queries for monitoring
export const cancelSignal = defineSignal("cancel");
export const statusQuery = defineQuery<WorkflowStatus>("status");

interface WorkflowStatus {
  stage: string;
  channelId: string;
  startedAt: string;
  error?: string;
}

/**
 * Main content generation workflow.
 * Orchestrates: Config → Ingest → Pipeline → Publish
 */
export async function contentGenerationWorkflow(
  channelId: string,
  dryRun = false
): Promise<{
  success: boolean;
  publishResults?: Awaited<ReturnType<typeof publishContent>>;
  error?: string;
  totalCost: number;
}> {
  let cancelled = false;
  let currentStatus: WorkflowStatus = {
    stage: "init",
    channelId,
    startedAt: new Date().toISOString(),
  };

  setHandler(cancelSignal, () => {
    cancelled = true;
  });

  setHandler(statusQuery, () => currentStatus);

  try {
    // Step 1: Load config
    currentStatus.stage = "loading_config";
    const config = await loadConfig(channelId);
    if (cancelled) return { success: false, error: "Cancelled", totalCost: 0 };

    // Step 2: Ingest data
    currentStatus.stage = "ingesting_data";
    const sources = await ingestSources(channelId, config.dataSources);
    if (cancelled) return { success: false, error: "Cancelled", totalCost: 0 };

    // Step 3: Load style fingerprint
    currentStatus.stage = "loading_style";
    const fingerprint = await loadStyleFingerprint(config);

    // Step 4: Run content pipeline
    currentStatus.stage = "generating_content";
    const pipelineResult = await runContentPipeline(
      config,
      sources,
      fingerprint
    );

    if (!pipelineResult.passed) {
      currentStatus.stage = "dead_letter";
      currentStatus.error = "Content failed quality gate after max revisions";
      return {
        success: false,
        error: currentStatus.error,
        totalCost: pipelineResult.totalCost,
      };
    }

    // Step 5: Publish (skip in dry-run mode)
    if (dryRun) {
      currentStatus.stage = "completed_dry_run";
      return {
        success: true,
        totalCost: pipelineResult.totalCost,
      };
    }

    currentStatus.stage = "publishing";
    const publishResults = await publishContent(
      config,
      pipelineResult.adaptations
    );

    currentStatus.stage = "completed";
    return {
      success: true,
      publishResults,
      totalCost: pipelineResult.totalCost,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    currentStatus.stage = "failed";
    currentStatus.error = message;
    return {
      success: false,
      error: message,
      totalCost: 0,
    };
  }
}

/**
 * Scheduled workflow that triggers content generation on a cron schedule.
 * Temporal's cron scheduling handles the recurring execution.
 */
export async function scheduledContentWorkflow(
  channelId: string
): Promise<void> {
  await contentGenerationWorkflow(channelId, false);
}
