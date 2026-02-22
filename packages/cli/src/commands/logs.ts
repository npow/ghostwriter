import chalk from "chalk";
import { getRecentRuns } from "@ghostwriter/monitoring";

interface LogsOptions {
  lines: string;
}

export async function logsCommand(channelName: string, options: LogsOptions) {
  const limit = parseInt(options.lines, 10) || 20;

  console.log(
    chalk.blue(
      `\nRecent pipeline runs for channel: ${channelName} (last ${limit})\n`
    )
  );

  try {
    const runs = await getRecentRuns(channelName, limit);

    if (runs.length === 0) {
      console.log(chalk.gray("  No pipeline runs found for this channel."));
      console.log(
        chalk.gray(
          "  Run your first pipeline with: ghostwriter run " + channelName
        )
      );
      console.log();
      return;
    }

    for (const run of runs) {
      const statusColor =
        run.status === "completed"
          ? chalk.green
          : run.status === "failed" || run.status === "dead_letter"
            ? chalk.red
            : chalk.yellow;

      const startedAt = run.startedAt
        ? new Date(run.startedAt).toLocaleString()
        : "unknown";

      const duration =
        run.completedAt && run.startedAt
          ? `${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
          : "—";

      const cost =
        run.totalCost != null ? `$${run.totalCost.toFixed(4)}` : "—";

      console.log(
        `  ${statusColor("●")} ${chalk.bold(run.id.slice(0, 8))}  ${statusColor(run.status.padEnd(12))}  ${startedAt}  ${chalk.gray(`duration: ${duration}`)}  ${chalk.gray(`cost: ${cost}`)}`
      );

      if (run.error) {
        console.log(chalk.red(`    Error: ${run.error}`));
      }

      if (run.currentStage) {
        console.log(chalk.gray(`    Stage: ${run.currentStage}`));
      }
    }

    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("DATABASE_URL")) {
      console.log(
        chalk.gray(
          "  Database not configured. Set DATABASE_URL to enable run history."
        )
      );
      console.log(
        chalk.gray(
          "  Alternatively, use the Temporal UI at http://localhost:8233 for workflow logs."
        )
      );
    } else {
      console.log(chalk.red(`  Failed to fetch logs: ${message}`));
    }
    console.log();
  }
}
