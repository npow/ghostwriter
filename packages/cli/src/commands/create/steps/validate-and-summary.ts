import type { Ora } from "ora";
import chalk from "chalk";
import { ChannelConfigSchema } from "@ghostwriter/core";
import type { CreateContext } from "../types.js";

export async function validateAndSummary(
  ctx: CreateContext,
  spinner: Ora
): Promise<void> {
  spinner.start("Validating configuration...");

  const config = ctx.config!;

  // Validate the config against the schema
  const result = ChannelConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    spinner.fail("Config validation failed:");
    console.log(chalk.red(errors.join("\n")));
    return;
  }

  spinner.succeed("Config validated successfully");

  // Summary
  console.log("");
  console.log(chalk.blue.bold("  Channel Created"));
  console.log(chalk.blue("  " + "─".repeat(50)));
  console.log("");

  console.log(`  ${chalk.dim("Name:")}         ${config.name}`);
  console.log(`  ${chalk.dim("ID:")}           ${config.id}`);
  console.log(`  ${chalk.dim("Type:")}         ${config.contentType}`);
  console.log(`  ${chalk.dim("Topic:")}        ${config.topic.focus}`);
  console.log(`  ${chalk.dim("Voice:")}        ${config.voice.name} (${config.voice.tone})`);
  console.log(`  ${chalk.dim("Sources:")}      ${config.dataSources.length} data source(s)`);
  console.log(`  ${chalk.dim("Schedule:")}     ${config.schedule.cron} (${config.schedule.timezone})`);
  console.log(`  ${chalk.dim("Word count:")}   ${config.targetWordCount}`);

  if (ctx.siteResult) {
    const sr = ctx.siteResult;
    console.log("");
    console.log(`  ${chalk.dim("Site setup:")}`);
    if (sr.categories.length > 0) {
      console.log(`    Categories: ${sr.categories.map((c) => c.name).join(", ")}`);
    }
    if (sr.pages.length > 0) {
      console.log(`    Pages: ${sr.pages.map((p) => p.title).join(", ")}`);
    }
    if (sr.errors.length > 0) {
      console.log(chalk.yellow(`    Errors: ${sr.errors.length}`));
      for (const err of sr.errors) {
        console.log(chalk.yellow(`      - ${err}`));
      }
    }
  }

  console.log("");
  console.log(`  ${chalk.dim("LLM cost:")}     $${ctx.totalCost.toFixed(4)}`);
  console.log("");

  if (ctx.options.dryRun) {
    console.log(
      chalk.yellow("  Dry run complete — no files were written.")
    );
    console.log(
      chalk.dim(`  Run without --dry-run to create the channel.\n`)
    );
  } else {
    console.log(chalk.green("  Next steps:"));
    console.log(
      chalk.dim(`    ghostwriter run ${config.id} --dry-run    # Test the pipeline`)
    );
    console.log(
      chalk.dim(`    ghostwriter validate ${config.id}         # Validate config + API keys`)
    );
    console.log(
      chalk.dim(`    ghostwriter run ${config.id}              # Run for real`)
    );
    console.log("");
  }
}
