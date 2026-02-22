import type { Ora } from "ora";
import chalk from "chalk";
import { input, password, select } from "@inquirer/prompts";
import {
  getConnectionsForPlatform,
  getConnection,
  saveConnection,
  type ConnectionEntry,
} from "@ghostwriter/core";
import type { CreateContext } from "../types.js";
import { connectWordPressCom } from "../../connect.js";

export async function resolveConnection(
  ctx: CreateContext,
  spinner: Ora
): Promise<ConnectionEntry> {
  spinner.start("Resolving WordPress connection...");

  const intent = ctx.intent!;

  // If intent specifies a connectionId, look it up (try both platforms)
  if (intent.connectionId) {
    const conn =
      (await getConnection(intent.connectionId, "wordpress")) ??
      (await getConnection(intent.connectionId, "wordpress-com"));
    if (conn) {
      spinner.succeed(`Using existing connection: ${conn.id} (${conn.url})`);
      return conn;
    }
    spinner.warn(
      `Connection "${intent.connectionId}" not found, searching for alternatives...`
    );
  }

  // Find existing WordPress connections (both self-hosted and WordPress.com)
  const wpSelfHosted = await getConnectionsForPlatform("wordpress");
  const wpCom = await getConnectionsForPlatform("wordpress-com");
  const wpConnections = [...wpSelfHosted, ...wpCom];

  // If there's a site URL from intent, try to match it
  if (intent.siteUrl && wpConnections.length > 0) {
    const normalized = intent.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const match = wpConnections.find((c) => {
      const connUrl = (c.url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      return connUrl === normalized || connUrl.includes(normalized);
    });
    if (match) {
      spinner.succeed(`Matched connection: ${match.id} (${match.url})`);
      return match;
    }
  }

  // Use first available connection
  if (wpConnections.length > 0) {
    const conn = wpConnections[0];
    spinner.succeed(`Using connection: ${conn.id} (${conn.url})`);
    return conn;
  }

  // No existing connection — create one inline
  spinner.stop();
  console.log(
    chalk.yellow("\n  No WordPress connection found. Let's set one up.\n")
  );

  const method = await select({
    message: "How do you want to connect?",
    choices: [
      {
        value: "wordpress-com",
        name: "WordPress.com (OAuth) — easiest, opens browser to authorize",
      },
      {
        value: "wordpress",
        name: "Self-hosted WordPress (Application Password)",
      },
    ],
  });

  if (method === "wordpress-com") {
    const result = await connectWordPressCom();
    if (!result) {
      throw new Error("WordPress.com connection was not completed");
    }
    return result;
  }

  // Self-hosted flow (unchanged)
  const siteUrl = intent.siteUrl
    ? `https://${intent.siteUrl.replace(/^https?:\/\//, "")}`
    : await input({
        message: "WordPress site URL:",
        validate: (val) => {
          try {
            new URL(val);
            return true;
          } catch {
            return "Enter a valid URL";
          }
        },
      });

  const baseUrl = siteUrl.replace(/\/$/, "");
  const username = await input({ message: "WordPress username:" });
  const appPassword = await password({
    message: "Application password:",
    mask: "*",
  });

  const connectionId =
    intent.channelId + "-wp";

  const conn: ConnectionEntry = {
    id: connectionId,
    platform: "wordpress",
    url: baseUrl,
    credentials: {
      url: baseUrl,
      username,
      password: appPassword.trim(),
    },
    createdAt: new Date().toISOString(),
  };

  await saveConnection(conn);
  console.log(chalk.green(`  Saved connection "${connectionId}"\n`));

  return conn;
}
