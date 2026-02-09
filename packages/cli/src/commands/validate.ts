import { loadChannelConfig, env } from "@auto-blogger/core";
import chalk from "chalk";

export async function validateCommand(channelName: string) {
  console.log(chalk.blue(`\nValidating channel: ${channelName}\n`));

  let hasErrors = false;

  // 1. Validate config schema
  try {
    const config = await loadChannelConfig(channelName);
    console.log(chalk.green("  [PASS] Config schema is valid"));

    // 2. Check data sources
    for (const source of config.dataSources) {
      console.log(
        chalk.green(
          `  [PASS] Data source configured: ${source.type}${source.type === "api" ? ` (${source.provider})` : ""}`
        )
      );
    }

    // 3. Check publish targets have required env vars
    for (const target of config.publishTargets) {
      switch (target.platform) {
        case "ghost":
          if (env.ghostUrl && env.ghostAdminApiKey) {
            console.log(chalk.green("  [PASS] Ghost credentials found"));
          } else {
            console.log(
              chalk.red(
                "  [FAIL] Ghost credentials missing (GHOST_URL, GHOST_ADMIN_API_KEY)"
              )
            );
            hasErrors = true;
          }
          break;

        case "twitter":
          if (
            env.twitterApiKey &&
            env.twitterApiSecret &&
            env.twitterAccessToken &&
            env.twitterAccessSecret
          ) {
            console.log(chalk.green("  [PASS] Twitter credentials found"));
          } else {
            console.log(
              chalk.red("  [FAIL] Twitter credentials incomplete")
            );
            hasErrors = true;
          }
          break;

        case "podcast":
          if (env.elevenLabsApiKey) {
            console.log(chalk.green("  [PASS] ElevenLabs API key found"));
          } else {
            console.log(
              chalk.red("  [FAIL] ELEVENLABS_API_KEY missing")
            );
            hasErrors = true;
          }
          break;
      }
    }

    // 4. Check Anthropic API key
    try {
      env.anthropicApiKey;
      console.log(chalk.green("  [PASS] Anthropic API key found"));
    } catch {
      console.log(chalk.red("  [FAIL] ANTHROPIC_API_KEY missing"));
      hasErrors = true;
    }

    // 5. Check voice examples exist
    if (config.voice.exampleContent.length > 0) {
      console.log(
        chalk.green(
          `  [PASS] ${config.voice.exampleContent.length} example content file(s) configured`
        )
      );
    } else {
      console.log(
        chalk.yellow(
          "  [WARN] No example content — style fingerprinting will be skipped"
        )
      );
    }

    console.log();
    if (hasErrors) {
      console.log(
        chalk.red(
          "  Validation failed. Fix the errors above before running."
        )
      );
      process.exitCode = 1;
    } else {
      console.log(chalk.green("  All checks passed!"));
      console.log(
        `\n  Run: auto_blogger run ${channelName} --dry-run`
      );
    }
  } catch (err) {
    console.log(
      chalk.red(
        `  [FAIL] Config error: ${err instanceof Error ? err.message : err}`
      )
    );
    process.exitCode = 1;
  }

  console.log();
}
