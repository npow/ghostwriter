import chalk from "chalk";
import {
  loadLearnedPatterns,
  saveLearnedPatterns,
} from "@ghostwriter/core";

interface PatternsOptions {
  days?: string;
}

export async function patternsCommand(
  subcommand: string,
  channelId: string,
  options: PatternsOptions
) {
  if (!subcommand || !channelId) {
    console.log(chalk.red("Usage: ghostwriter patterns <list|prune> <channel-id>"));
    return;
  }

  switch (subcommand) {
    case "list":
      return listPatterns(channelId);
    case "prune":
      return prunePatterns(channelId, options);
    default:
      console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
      console.log(chalk.gray("Available: list, prune"));
  }
}

async function listPatterns(channelId: string) {
  const patterns = await loadLearnedPatterns(channelId);

  if (patterns.length === 0) {
    console.log(chalk.gray(`\n  No learned patterns for channel: ${channelId}`));
    console.log(
      chalk.gray("  Patterns are discovered automatically during review.\n")
    );
    return;
  }

  console.log(
    chalk.blue(`\nLearned patterns for ${channelId} (${patterns.length}):\n`)
  );

  const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);

  for (const p of sorted) {
    const age = Math.round(
      (Date.now() - new Date(p.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const confidenceColor =
      p.confidence >= 0.8
        ? chalk.green
        : p.confidence >= 0.6
          ? chalk.yellow
          : chalk.gray;

    console.log(
      `  ${confidenceColor("●")} ${chalk.bold(p.phrase)}  ${chalk.gray(`[${p.category}]`)}  conf: ${confidenceColor(p.confidence.toFixed(2))}  seen: ${p.occurrences}x  last: ${age}d ago`
    );
  }

  console.log();
}

async function prunePatterns(channelId: string, options: PatternsOptions) {
  const days = parseInt(options.days ?? "90", 10);
  const patterns = await loadLearnedPatterns(channelId);

  if (patterns.length === 0) {
    console.log(chalk.gray(`\n  No patterns to prune for channel: ${channelId}\n`));
    return;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const kept = patterns.filter(
    (p) => new Date(p.lastSeenAt).getTime() >= cutoff
  );
  const pruned = patterns.length - kept.length;

  await saveLearnedPatterns(channelId, kept);

  console.log(
    chalk.blue(
      `\n  Pruned ${pruned} pattern(s) not seen in ${days} days. ${kept.length} remaining.\n`
    )
  );
}
