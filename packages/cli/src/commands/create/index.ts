import ora from "ora";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import type { CreateContext, CreateOptions } from "./types.js";
import { parseIntent } from "./steps/parse-intent.js";
import { resolveConnection } from "./steps/resolve-connection.js";
import { fingerprintStyle } from "./steps/fingerprint-style.js";
import { generateVoice } from "./steps/generate-voice.js";
import { discoverSources } from "./steps/discover-sources.js";
import { resolveSchedule } from "./steps/resolve-schedule.js";
import { assembleConfig } from "./steps/assemble-config.js";
import { validateSiteAccess } from "./steps/validate-site-access.js";
import { setupSite } from "./steps/setup-site.js";
import { generateExample } from "./steps/generate-example.js";
import { validateAndSummary } from "./steps/validate-and-summary.js";

export async function createCommand(
  descriptionParts: string[],
  options: { interactive?: boolean; siteSetup?: boolean; dryRun?: boolean }
): Promise<void> {
  const rawDescription = descriptionParts.join(" ").trim();

  if (!rawDescription) {
    console.log(
      chalk.red("\n  Please provide a description of the channel to create.\n")
    );
    console.log(
      chalk.dim(
        '  Example: ghostwriter create "weekly stock market recap blog, casual and funny"\n'
      )
    );
    process.exitCode = 1;
    return;
  }

  const opts: CreateOptions = {
    interactive: options.interactive ?? false,
    siteSetup: options.siteSetup !== false, // default true (--no-site-setup sets to false)
    dryRun: options.dryRun ?? false,
  };

  const ctx: CreateContext = {
    rawDescription,
    options: opts,
    totalCost: 0,
  };

  console.log("");
  if (opts.dryRun) {
    console.log(chalk.yellow("  Dry run mode — no files will be written\n"));
  }

  const spinner = ora({ indent: 2 });

  try {
    // Stage 1: Parse intent
    ctx.intent = await parseIntent(ctx, spinner);
    if (opts.interactive && !(await confirmStep("Continue with this intent?"))) return;

    // Stage 2: Resolve connection
    ctx.connection = await resolveConnection(ctx, spinner);
    if (opts.interactive && !(await confirmStep("Continue with this connection?"))) return;

    // Stage 2.5: Validate site access
    if (ctx.connection) {
      await validateSiteAccess(ctx, spinner);
    }

    // Stage 3: Fingerprint style
    ctx.styleProfile = await fingerprintStyle(ctx, spinner);
    if (opts.interactive && ctx.styleProfile && !(await confirmStep("Continue with this style profile?"))) return;

    // Stage 4: Generate voice
    ctx.voice = await generateVoice(ctx, spinner);
    if (opts.interactive && !(await confirmStep("Continue with this voice?"))) return;

    // Stage 5: Discover sources
    ctx.dataSources = await discoverSources(ctx, spinner);
    if (opts.interactive && !(await confirmStep("Continue with these sources?"))) return;

    // Stage 6: Resolve schedule
    ctx.schedule = resolveSchedule(ctx, spinner);

    // Stage 7: Assemble config
    ctx.config = await assembleConfig(ctx, spinner);

    // Stage 8: Setup site (if enabled)
    if (opts.siteSetup && ctx.intent.publishPlatform === "wordpress-com") {
      if (opts.interactive && !(await confirmStep("Configure WordPress site?"))) {
        // Skip site setup
      } else {
        ctx.siteResult = await setupSite(ctx, spinner);
      }
    }

    // Stage 9: Generate example
    await generateExample(ctx, spinner);

    // Stage 10: Validate & summary
    await validateAndSummary(ctx, spinner);
  } catch (err) {
    spinner.fail(
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exitCode = 1;
  }
}

async function confirmStep(message: string): Promise<boolean> {
  return confirm({ message, default: true });
}
