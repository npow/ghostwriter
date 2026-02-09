import { listChannels, loadChannelConfig } from "@auto-blogger/core";
import chalk from "chalk";
import Table from "cli-table3";

export async function listCommand() {
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
      chalk.blue("Channel ID"),
      chalk.blue("Name"),
      chalk.blue("Content Type"),
      chalk.blue("Voice"),
      chalk.blue("Schedule"),
    ],
  });

  for (const id of channelIds) {
    try {
      const config = await loadChannelConfig(id);
      table.push([
        config.id,
        config.name,
        config.contentType,
        config.voice.name,
        config.schedule.cron,
      ]);
    } catch {
      table.push([id, chalk.red("(error)"), "", "", ""]);
    }
  }

  console.log(`\n${table.toString()}\n`);
}
