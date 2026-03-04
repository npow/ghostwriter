import { loadChannelConfig, env } from "@ghostwriter/core";
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

        case "wordpress":
          if (
            (target.url || env.wordpressUrl) &&
            (target.username || env.wordpressUsername) &&
            (target.password || env.wordpressPassword)
          ) {
            console.log(chalk.green("  [PASS] WordPress credentials found"));
          } else {
            console.log(
              chalk.red(
                "  [FAIL] WordPress credentials missing — run: ghostwriter connect wordpress"
              )
            );
            hasErrors = true;
          }
          break;
      }
    }

    // 4. Check LLM provider credentials
    const hasOpenAICompat = process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL;
    const hasAnthropic = process.env.ANTHROPIC_API_KEY;
    const hasGemini = process.env.GEMINI_API_KEY;
    if (hasOpenAICompat) {
      console.log(chalk.green(`  [PASS] LLM provider: OpenAI-compat (${process.env.OPENAI_BASE_URL})`));
    } else if (hasAnthropic) {
      console.log(chalk.green("  [PASS] LLM provider: Anthropic"));
    } else if (hasGemini) {
      console.log(chalk.green("  [PASS] LLM provider: Gemini"));
    } else {
      console.log(chalk.red("  [FAIL] No LLM provider: set OPENAI_API_KEY+OPENAI_BASE_URL, ANTHROPIC_API_KEY, or GEMINI_API_KEY"));
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
        `\n  Run: ghostwriter run ${channelName} --dry-run`
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
