import { loadChannelConfig, listChannels } from "@auto-blogger/core";
import chalk from "chalk";
import Table from "cli-table3";

export async function statusCommand(channelName?: string) {
  if (channelName) {
    await showChannelStatus(channelName);
  } else {
    await showAllStatus();
  }
}

async function showChannelStatus(channelName: string) {
  try {
    const config = await loadChannelConfig(channelName);

    console.log(chalk.blue(`\nChannel: ${config.name}\n`));
    console.log(`  ID:           ${config.id}`);
    console.log(`  Content Type: ${config.contentType}`);
    console.log(`  Topic:        ${config.topic.focus}`);
    console.log(`  Voice:        ${config.voice.name} (${config.voice.tone})`);
    console.log(`  Schedule:     ${config.schedule.cron}`);
    console.log(`  Enabled:      ${config.schedule.enabled}`);
    console.log(
      `  Platforms:    ${config.publishTargets.map((t) => t.platform).join(", ")}`
    );
    console.log(
      `  Data Sources: ${config.dataSources.map((d) => d.type).join(", ")}`
    );
    console.log(`  Word Target:  ${config.targetWordCount}`);
    console.log();
  } catch (err) {
    console.log(
      chalk.red(
        `Error: ${err instanceof Error ? err.message : err}`
      )
    );
    process.exitCode = 1;
  }
}

async function showAllStatus() {
  const channelIds = await listChannels();

  if (channelIds.length === 0) {
    console.log(
      chalk.yellow(
        "\nNo channels found. Run: auto_blogger init <channel-name>\n"
      )
    );
    return;
  }

  const table = new Table({
    head: [
      chalk.blue("ID"),
      chalk.blue("Name"),
      chalk.blue("Type"),
      chalk.blue("Schedule"),
      chalk.blue("Platforms"),
      chalk.blue("Enabled"),
    ],
  });

  for (const id of channelIds) {
    try {
      const config = await loadChannelConfig(id);
      table.push([
        config.id,
        config.name,
        config.contentType,
        config.schedule.cron,
        config.publishTargets.map((t) => t.platform).join(", "),
        config.schedule.enabled ? chalk.green("yes") : chalk.red("no"),
      ]);
    } catch {
      table.push([id, chalk.red("(invalid config)"), "", "", "", ""]);
    }
  }

  console.log(`\n${table.toString()}\n`);
}
