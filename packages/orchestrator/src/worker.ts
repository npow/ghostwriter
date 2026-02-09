import { Worker, NativeConnection } from "@temporalio/worker";
import { env, createChildLogger } from "@auto-blogger/core";
import * as activities from "./activities.js";

const logger = createChildLogger({ module: "temporal:worker" });

export async function startWorker() {
  logger.info("Starting Temporal worker");

  const connection = await NativeConnection.connect({
    address: env.temporalAddress,
  });

  const worker = await Worker.create({
    connection,
    namespace: env.temporalNamespace,
    taskQueue: "auto-blogger",
    workflowsPath: new URL("./workflows.js", import.meta.url).pathname,
    activities,
  });

  logger.info("Temporal worker started, listening on task queue: auto-blogger");

  await worker.run();
}

// Run directly when executed as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((err) => {
    logger.error({ err }, "Worker failed");
    process.exit(1);
  });
}
