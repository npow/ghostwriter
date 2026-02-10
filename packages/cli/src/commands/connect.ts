import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { input, password, select, confirm } from "@inquirer/prompts";
import {
  saveConnection,
  loadConnections,
  type ConnectionEntry,
} from "@auto-blogger/core";

type Platform = "wordpress" | "ghost" | "twitter";

export async function connectCommand(platform?: string) {
  if (!platform) {
    platform = await select({
      message: "Which platform do you want to connect?",
      choices: [
        { value: "wordpress", name: "WordPress" },
        { value: "ghost", name: "Ghost CMS" },
        { value: "twitter", name: "Twitter / X" },
        { value: "list", name: "List existing connections" },
      ],
    });
  }

  switch (platform) {
    case "wordpress":
      await connectWordPress();
      break;
    case "ghost":
      await connectGhost();
      break;
    case "twitter":
      await connectTwitter();
      break;
    case "list":
      await listConnections();
      break;
    default:
      console.log(chalk.red(`\n  Unknown platform: ${platform}`));
      console.log(`  Supported: wordpress, ghost, twitter\n`);
      process.exitCode = 1;
  }
}

async function listConnections() {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log(chalk.dim("\n  No connections yet. Run: auto_blogger connect\n"));
    return;
  }

  console.log(chalk.blue("\n  Saved connections:\n"));
  for (const conn of connections) {
    console.log(
      `    ${chalk.green(conn.id)} — ${conn.platform}${conn.url ? ` (${conn.url})` : ""}`
    );
  }
  console.log();
}

// ─── WordPress ─────────────────────────────────────────────────────────────

async function connectWordPress() {
  console.log(chalk.blue("\n  Connect WordPress\n"));
  console.log(
    chalk.dim(
      "  This uses WordPress Application Passwords (available in WP 5.6+).\n" +
        "  No plugins needed — it's built into WordPress core.\n"
    )
  );

  // Step 1: Name this connection
  const existingWp = (await loadConnections()).filter(
    (c) => c.platform === "wordpress"
  );
  const defaultName =
    existingWp.length === 0
      ? "wordpress"
      : `wordpress-${existingWp.length + 1}`;

  const connectionId = await input({
    message: "Connection name (used as target ID in channel config):",
    default: defaultName,
    validate: (val) =>
      /^[a-z0-9-]+$/.test(val) ||
      "Use lowercase letters, numbers, and hyphens only",
  });

  // Step 2: Get site URL
  const siteUrl = await input({
    message: "WordPress site URL:",
    validate: (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return "Enter a valid URL (e.g. https://your-site.com)";
      }
    },
  });

  const baseUrl = siteUrl.replace(/\/$/, "");

  // Step 3: Verify it's a WordPress site
  console.log(chalk.dim("\n  Checking WordPress REST API..."));
  const wpCheck = await checkWordPressApi(baseUrl);

  if (!wpCheck.ok) {
    console.log(
      chalk.red(`\n  Could not reach WordPress REST API at ${baseUrl}`)
    );
    console.log(chalk.dim(`  Error: ${wpCheck.error}`));
    console.log(chalk.dim("  Make sure:"));
    console.log(chalk.dim("    - The URL is correct"));
    console.log(
      chalk.dim("    - The site is accessible from this machine")
    );
    console.log(
      chalk.dim(
        "    - The REST API is enabled (not blocked by a security plugin)\n"
      )
    );

    const proceed = await confirm({
      message: "Continue anyway?",
      default: false,
    });
    if (!proceed) return;
  } else {
    console.log(
      chalk.green(
        `  Found: ${wpCheck.name} (WordPress ${wpCheck.version})`
      )
    );
  }

  // Step 4: Get credentials
  console.log(
    chalk.dim(
      "\n  To create an Application Password:\n" +
        `    1. Go to ${baseUrl}/wp-admin/profile.php\n` +
        '    2. Scroll to "Application Passwords"\n' +
        '    3. Enter a name (e.g. "auto_blogger") and click "Add New Application Password"\n' +
        "    4. Copy the generated password\n"
    )
  );

  const openBrowser = await confirm({
    message: "Open your browser to the Application Passwords page?",
    default: true,
  });

  if (openBrowser) {
    const { exec } = await import("node:child_process");
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(
      `${cmd} "${baseUrl}/wp-admin/profile.php#application-passwords-section"`
    );
    console.log(
      chalk.dim(
        "  Browser opened. Create the password, then come back here.\n"
      )
    );
  }

  const username = await input({
    message: "WordPress username:",
  });

  const appPassword = await password({
    message: "Application password (paste it here):",
    mask: "*",
  });

  const normalizedPassword = appPassword.trim();

  // Step 5: Test the connection
  console.log(chalk.dim("\n  Testing connection..."));
  const testResult = await testWordPressAuth(
    baseUrl,
    username,
    normalizedPassword
  );

  if (!testResult.ok) {
    console.log(
      chalk.red(`\n  Authentication failed: ${testResult.error}`)
    );
    console.log(chalk.dim("  Check that:"));
    console.log(chalk.dim("    - Username is correct"));
    console.log(
      chalk.dim(
        "    - Application Password was copied correctly (spaces are OK)"
      )
    );
    console.log(
      chalk.dim("    - The user has permission to create posts\n")
    );

    const saveAnyway = await confirm({
      message: "Save credentials anyway?",
      default: false,
    });
    if (!saveAnyway) return;
  } else {
    console.log(
      chalk.green(
        `  Connected as: ${testResult.displayName} (${testResult.role})`
      )
    );

    if (testResult.capabilities?.publish_posts) {
      console.log(chalk.green("  Can publish posts: yes"));
    } else {
      console.log(
        chalk.yellow(
          "  Warning: this user may not have permission to publish posts"
        )
      );
    }
  }

  // Step 6: Save to connections store
  await saveConnection({
    id: connectionId,
    platform: "wordpress",
    url: baseUrl,
    credentials: {
      url: baseUrl,
      username,
      password: normalizedPassword,
    },
    createdAt: new Date().toISOString(),
  });

  console.log(chalk.green("\n  WordPress connected successfully!"));
  console.log(
    chalk.dim(
      `  Saved as "${connectionId}" in ~/.auto-blogger/connections.json\n`
    )
  );

  // Show config example
  const allWp = (await loadConnections()).filter(
    (c) => c.platform === "wordpress"
  );
  if (allWp.length > 1) {
    console.log("  You have multiple WordPress sites. Use the ID to target each one:\n");
    console.log(chalk.cyan("  publishTargets:"));
    for (const wp of allWp) {
      console.log(chalk.cyan(`    - platform: wordpress`));
      console.log(chalk.cyan(`      id: ${wp.id}`));
      console.log(chalk.cyan(`      url: ${wp.url}`));
    }
  } else {
    console.log("  Add this to your channel config:\n");
    console.log(
      chalk.cyan(
        "  publishTargets:\n" +
          `    - platform: wordpress\n` +
          `      id: ${connectionId}\n` +
          `      url: ${baseUrl}\n`
      )
    );
  }
  console.log();
}

// ─── Ghost ─────────────────────────────────────────────────────────────────

async function connectGhost() {
  console.log(chalk.blue("\n  Connect Ghost CMS\n"));

  const existingGhost = (await loadConnections()).filter(
    (c) => c.platform === "ghost"
  );
  const defaultName =
    existingGhost.length === 0
      ? "ghost"
      : `ghost-${existingGhost.length + 1}`;

  const connectionId = await input({
    message: "Connection name:",
    default: defaultName,
    validate: (val) =>
      /^[a-z0-9-]+$/.test(val) ||
      "Use lowercase letters, numbers, and hyphens only",
  });

  const siteUrl = await input({
    message: "Ghost site URL:",
    validate: (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return "Enter a valid URL (e.g. https://your-blog.ghost.io)";
      }
    },
  });

  const baseUrl = siteUrl.replace(/\/$/, "");

  console.log(
    chalk.dim(
      "\n  To get your Admin API key:\n" +
        `    1. Go to ${baseUrl}/ghost/#/settings/integrations\n` +
        '    2. Click "Add custom integration"\n' +
        '    3. Name it "auto_blogger"\n' +
        "    4. Copy the Admin API Key\n"
    )
  );

  const openBrowser = await confirm({
    message: "Open your browser to Ghost integrations?",
    default: true,
  });

  if (openBrowser) {
    const { exec } = await import("node:child_process");
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(`${cmd} "${baseUrl}/ghost/#/settings/integrations"`);
  }

  const apiKey = await password({
    message: "Admin API Key:",
    mask: "*",
  });

  // Test connection
  console.log(chalk.dim("\n  Testing connection..."));
  const testResult = await testGhostAuth(baseUrl, apiKey.trim());

  if (!testResult.ok) {
    console.log(
      chalk.red(`\n  Connection failed: ${testResult.error}`)
    );
    const saveAnyway = await confirm({
      message: "Save credentials anyway?",
      default: false,
    });
    if (!saveAnyway) return;
  } else {
    console.log(chalk.green(`  Connected to: ${testResult.title}`));
  }

  await saveConnection({
    id: connectionId,
    platform: "ghost",
    url: baseUrl,
    credentials: {
      url: baseUrl,
      apiKey: apiKey.trim(),
    },
    createdAt: new Date().toISOString(),
  });

  console.log(chalk.green("\n  Ghost connected successfully!"));
  console.log(
    chalk.dim(
      `  Saved as "${connectionId}" in ~/.auto-blogger/connections.json\n`
    )
  );
}

// ─── Twitter ───────────────────────────────────────────────────────────────

async function connectTwitter() {
  console.log(chalk.blue("\n  Connect Twitter / X\n"));
  console.log(
    chalk.dim(
      "  You need a Twitter Developer account with v2 API access.\n" +
        "  Create an app at https://developer.twitter.com/en/portal/dashboard\n"
    )
  );

  const existingTw = (await loadConnections()).filter(
    (c) => c.platform === "twitter"
  );
  const defaultName =
    existingTw.length === 0
      ? "twitter"
      : `twitter-${existingTw.length + 1}`;

  const connectionId = await input({
    message: "Connection name:",
    default: defaultName,
    validate: (val) =>
      /^[a-z0-9-]+$/.test(val) ||
      "Use lowercase letters, numbers, and hyphens only",
  });

  const openBrowser = await confirm({
    message: "Open Twitter Developer Portal?",
    default: true,
  });

  if (openBrowser) {
    const { exec } = await import("node:child_process");
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(
      `${cmd} "https://developer.twitter.com/en/portal/dashboard"`
    );
  }

  const apiKey = await password({ message: "API Key:", mask: "*" });
  const apiSecret = await password({ message: "API Secret:", mask: "*" });
  const accessToken = await password({
    message: "Access Token:",
    mask: "*",
  });
  const accessSecret = await password({
    message: "Access Token Secret:",
    mask: "*",
  });

  await saveConnection({
    id: connectionId,
    platform: "twitter",
    credentials: {
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      accessToken: accessToken.trim(),
      accessSecret: accessSecret.trim(),
    },
    createdAt: new Date().toISOString(),
  });

  console.log(chalk.green("\n  Twitter connected successfully!"));
  console.log(
    chalk.dim(
      `  Saved as "${connectionId}" in ~/.auto-blogger/connections.json\n`
    )
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function checkWordPressApi(
  baseUrl: string
): Promise<
  | { ok: true; name: string; version: string }
  | { ok: false; error: string }
> {
  try {
    const resp = await fetch(`${baseUrl}/wp-json/`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as {
      name?: string;
      namespaces?: string[];
    };

    const hasWpV2 = data.namespaces?.includes("wp/v2");
    if (!hasWpV2) {
      return {
        ok: false,
        error: "wp/v2 namespace not found — REST API may be disabled",
      };
    }

    return {
      ok: true,
      name: data.name ?? "Unknown",
      version: "5.6+",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testWordPressAuth(
  baseUrl: string,
  username: string,
  appPassword: string
): Promise<
  | {
      ok: true;
      displayName: string;
      role: string;
      capabilities?: Record<string, boolean>;
    }
  | { ok: false; error: string }
> {
  try {
    const credentials = Buffer.from(
      `${username}:${appPassword}`
    ).toString("base64");

    const resp = await fetch(
      `${baseUrl}/wp-json/wp/v2/users/me?context=edit`,
      {
        headers: { Authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (resp.status === 401) {
      return {
        ok: false,
        error: "Invalid username or application password",
      };
    }

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }

    const user = (await resp.json()) as {
      name: string;
      roles: string[];
      capabilities?: Record<string, boolean>;
    };

    return {
      ok: true,
      displayName: user.name,
      role: user.roles?.[0] ?? "unknown",
      capabilities: user.capabilities,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testGhostAuth(
  baseUrl: string,
  adminApiKey: string
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  try {
    const [id, secret] = adminApiKey.split(":");
    if (!id || !secret) {
      return {
        ok: false,
        error: "Invalid API key format — expected 'id:secret'",
      };
    }

    const { createHmac } = await import("node:crypto");
    const keyBuf = Buffer.from(secret, "hex");
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT", kid: id })
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" })
    ).toString("base64url");
    const signature = createHmac("sha256", keyBuf)
      .update(`${header}.${payload}`)
      .digest("base64url");
    const token = `${header}.${payload}.${signature}`;

    const resp = await fetch(`${baseUrl}/ghost/api/admin/site/`, {
      headers: { Authorization: `Ghost ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }

    const data = (await resp.json()) as {
      site?: { title?: string };
    };
    return { ok: true, title: data.site?.title ?? "Ghost site" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
