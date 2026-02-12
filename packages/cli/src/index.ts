#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { listCommand } from "./commands/list.js";
import { logsCommand } from "./commands/logs.js";
import { connectCommand } from "./commands/connect.js";
import { fingerprintCommand } from "./commands/fingerprint.js";
import { createCommand } from "./commands/create/index.js";

const program = new Command();

program
  .name("auto_blogger")
  .description("Autonomous AI content engine with anti-slop quality gates")
  .version("0.1.0");

program
  .command("init <channel-name>")
  .description("Scaffold a new channel config")
  .action(initCommand);

program
  .command("validate <channel-name>")
  .description("Validate channel config and test API keys")
  .action(validateCommand);

program
  .command("run <channel-name>")
  .description("Run the content pipeline for a channel")
  .option("--dry-run", "Generate content without publishing", false)
  .action(runCommand);

program
  .command("status [channel-name]")
  .description("Show pipeline status")
  .action(statusCommand);

program
  .command("list")
  .description("List all channels")
  .action(listCommand);

program
  .command("logs <channel-name>")
  .description("Show recent pipeline logs")
  .option("-n, --lines <number>", "Number of log entries", "20")
  .action(logsCommand);

program
  .command("connect [platform]")
  .description("Connect a publishing platform (wordpress, wordpress-com, ghost, twitter)")
  .action(connectCommand);

program
  .command("fingerprint <input>")
  .description("Analyze writing style from a URL or file")
  .option("-o, --output <format>", "Output format: json, prompt, detailed, compact", "prompt")
  .action(fingerprintCommand);

program
  .command("create [description...]")
  .description("Create a channel from a natural language description")
  .option("--interactive", "Pause for confirmation at each step", false)
  .option("--no-site-setup", "Skip WordPress site configuration")
  .option("--dry-run", "Show what would be created without writing", false)
  .action(createCommand);

program
  .command("dashboard")
  .description("Open the Temporal web monitoring UI")
  .action(async () => {
    const { exec } = await import("node:child_process");
    const url = "http://localhost:8233";
    console.log(`Opening Temporal UI at ${url}`);
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${cmd} ${url}`);
  });

program.parse();
