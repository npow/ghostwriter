import { loadChannelConfig } from "@auto-blogger/core";
import { ingestData } from "@auto-blogger/data-ingestion";
import { runPipeline, analyzeStyleFingerprint } from "@auto-blogger/content-pipeline";
import { publishAll } from "@auto-blogger/publishing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getChannelsDir } from "@auto-blogger/core";
import chalk from "chalk";
import ora from "ora";

interface RunOptions {
  dryRun: boolean;
}

export async function runCommand(channelName: string, options: RunOptions) {
  console.log(
    chalk.blue(
      `\n${options.dryRun ? "[DRY RUN] " : ""}Running pipeline for: ${channelName}\n`
    )
  );

  const spinner = ora();

  try {
    // Load config
    spinner.start("Loading channel config...");
    const config = await loadChannelConfig(channelName);
    spinner.succeed(`Loaded config: ${config.name}`);

    // Ingest data
    spinner.start("Ingesting data from sources...");
    const sources = await ingestData(config.id, config.dataSources);
    spinner.succeed(`Ingested ${sources.length} source materials`);

    // Load style fingerprint
    let fingerprint;
    if (config.voice.exampleContent.length > 0) {
      spinner.start("Analyzing style fingerprint...");
      const channelsDir = getChannelsDir();
      const exampleTexts: string[] = [];
      for (const examplePath of config.voice.exampleContent) {
        try {
          const text = await readFile(
            join(channelsDir, config.id, examplePath),
            "utf-8"
          );
          exampleTexts.push(text);
        } catch {
          // Skip missing
        }
      }
      if (exampleTexts.length > 0) {
        fingerprint = analyzeStyleFingerprint(config.id, exampleTexts);
        spinner.succeed(
          `Style fingerprint computed from ${exampleTexts.length} example(s)`
        );
      } else {
        spinner.warn("No example content found, skipping fingerprint");
      }
    }

    // Run pipeline with progress callbacks
    const result = await runPipeline(config, sources, {
      fingerprint,
      skipAdapt: false,
      callbacks: {
        onStageStart: (stage) => {
          spinner.start(`Running ${stage} stage...`);
        },
        onStageComplete: (stage, cost) => {
          spinner.succeed(
            `${stage} complete ${chalk.gray(`($${cost.toFixed(3)})`)}`
          );
        },
        onRevision: (revision, feedback) => {
          console.log(
            chalk.yellow(`\n  Revision ${revision} — Feedback:`)
          );
          for (const f of feedback.slice(0, 5)) {
            console.log(chalk.yellow(`    - ${f}`));
          }
          console.log();
        },
      },
    });

    // Display results
    console.log(chalk.blue("\n─── Results ───\n"));

    console.log(
      `  Status: ${result.passed ? chalk.green("PASSED") : chalk.red("FAILED")}`
    );
    console.log(`  Revisions: ${result.revisions}`);
    console.log(`  Total Cost: $${result.totalCost.toFixed(3)}`);
    console.log(`  Word Count: ${result.draft.wordCount}`);

    console.log(chalk.blue("\n─── Quality Scores ───\n"));
    const scores = result.review.aggregateScores;
    for (const [key, value] of Object.entries(scores)) {
      const color = value >= 8 ? chalk.green : value >= 7 ? chalk.yellow : chalk.red;
      const bar = "█".repeat(value) + "░".repeat(10 - value);
      console.log(`  ${key.padEnd(22)} ${color(bar)} ${color(value.toString())}/10`);
    }

    // Show agent feedback
    console.log(chalk.blue("\n─── Agent Feedback ───\n"));
    for (const agent of result.review.agentResults) {
      const icon = agent.passed ? chalk.green("✓") : chalk.red("✗");
      console.log(`  ${icon} ${agent.agent}`);
      for (const f of agent.feedback.slice(0, 3)) {
        console.log(chalk.gray(`    ${f}`));
      }
    }

    // Preview
    console.log(chalk.blue("\n─── Content Preview ───\n"));
    const preview = result.draft.content.slice(0, 500);
    console.log(chalk.gray(preview));
    if (result.draft.content.length > 500) {
      console.log(chalk.gray("  ..."));
    }

    // Publish
    if (!options.dryRun && result.passed) {
      console.log(chalk.blue("\n─── Publishing ───\n"));
      spinner.start("Publishing to platforms...");
      const publishResults = await publishAll(config, result.adaptations);

      for (const pub of publishResults) {
        if (pub.success) {
          spinner.succeed(
            `Published to ${pub.platform}${pub.url ? `: ${pub.url}` : ""}`
          );
        } else {
          spinner.fail(
            `Failed to publish to ${pub.platform}: ${pub.error}`
          );
        }
      }
    } else if (!options.dryRun && !result.passed) {
      console.log(
        chalk.red(
          "\n  Content did not pass quality gate. Not publishing."
        )
      );
    }

    console.log();
  } catch (err) {
    spinner.fail(
      `Pipeline failed: ${err instanceof Error ? err.message : err}`
    );
    process.exitCode = 1;
  }
}
