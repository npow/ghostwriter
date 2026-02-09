import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { ChannelConfigSchema, type ChannelConfig } from "./schemas/channel.js";
import { logger } from "./logger.js";

const DEFAULT_CHANNELS_DIR = "channels";

export function getChannelsDir(): string {
  return resolve(process.env.CHANNELS_DIR ?? DEFAULT_CHANNELS_DIR);
}

export async function loadChannelConfig(
  channelId: string
): Promise<ChannelConfig> {
  const channelsDir = getChannelsDir();
  const configPath = join(channelsDir, channelId, "config.yml");

  logger.debug({ configPath }, "Loading channel config");

  const raw = await readFile(configPath, "utf-8");
  const parsed = parseYaml(raw);

  const result = ChannelConfigSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `Invalid channel config for "${channelId}":\n${errors.join("\n")}`
    );
  }

  return result.data;
}

export async function listChannels(): Promise<string[]> {
  const channelsDir = getChannelsDir();

  try {
    const entries = await readdir(channelsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function loadAllChannels(): Promise<ChannelConfig[]> {
  const ids = await listChannels();
  const configs: ChannelConfig[] = [];

  for (const id of ids) {
    try {
      configs.push(await loadChannelConfig(id));
    } catch (err) {
      logger.warn({ channelId: id, err }, "Failed to load channel config");
    }
  }

  return configs;
}
