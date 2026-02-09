import { Connection, Client, WorkflowHandle } from "@temporalio/client";
import { env, createChildLogger } from "@auto-blogger/core";
import type { contentGenerationWorkflow } from "./workflows.js";

const logger = createChildLogger({ module: "temporal:client" });

let _client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (!_client) {
    const connection = await Connection.connect({
      address: env.temporalAddress,
    });
    _client = new Client({
      connection,
      namespace: env.temporalNamespace,
    });
  }
  return _client;
}

/**
 * Start a content generation workflow.
 */
export async function startContentGeneration(
  channelId: string,
  dryRun = false
): Promise<string> {
  const client = await getTemporalClient();
  const workflowId = `content-gen-${channelId}-${Date.now()}`;

  logger.info({ workflowId, channelId, dryRun }, "Starting workflow");

  const handle = await client.workflow.start("contentGenerationWorkflow", {
    taskQueue: "auto-blogger",
    workflowId,
    args: [channelId, dryRun],
  });

  return handle.workflowId;
}

/**
 * Schedule recurring content generation for a channel.
 */
export async function scheduleChannel(
  channelId: string,
  cronExpression: string
): Promise<string> {
  const client = await getTemporalClient();
  const scheduleId = `schedule-${channelId}`;

  logger.info({ scheduleId, channelId, cron: cronExpression }, "Creating schedule");

  await client.schedule.create({
    scheduleId,
    spec: {
      cronExpressions: [cronExpression],
    },
    action: {
      type: "startWorkflow",
      workflowType: "scheduledContentWorkflow",
      taskQueue: "auto-blogger",
      args: [channelId],
    },
  });

  return scheduleId;
}

/**
 * Get the status of a running workflow.
 */
export async function getWorkflowStatus(workflowId: string) {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);

  const describe = await handle.describe();
  return {
    workflowId: describe.workflowId,
    status: describe.status.name,
    startTime: describe.startTime,
    closeTime: describe.closeTime,
  };
}

/**
 * Cancel a running workflow.
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);
  await handle.signal("cancel");
}
