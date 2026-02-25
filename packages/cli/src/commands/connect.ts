import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { input, password, select, confirm } from "@inquirer/prompts";
import {
  saveConnection,
  loadConnections,
  type ConnectionEntry,
} from "@ghostwriter/core";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  fetchUserSites,
  startCallbackServer,
  generateState,
  findAvailablePort,
  type WpComOAuthConfig,
  type WpComSite,
} from "@ghostwriter/site-setup";

type Platform = "wordpress" | "wordpress-com" | "twitter" | "hugo";

export async function connectCommand(platform?: string) {
  if (!platform) {
    platform = await select({
      message: "Which platform do you want to connect?",
      choices: [
        { value: "wordpress-com", name: "WordPress.com (OAuth)" },
        { value: "wordpress", name: "WordPress (self-hosted)" },
        { value: "twitter", name: "Twitter / X" },
        { value: "hugo", name: "Hugo (Git Blog)" },
        { value: "list", name: "List existing connections" },
      ],
    });
  }

  switch (platform) {
    case "wordpress":
      await connectWordPress();
      break;
    case "wordpress-com":
      await connectWordPressCom();
      break;
    case "twitter":
      await connectTwitter();
      break;
    case "hugo":
      await connectHugo();
      break;
    case "list":
      await listConnections();
      break;
    default:
      console.log(chalk.red(`\n  Unknown platform: ${platform}`));
      console.log(`  Supported: wordpress, wordpress-com, twitter, hugo\n`);
      process.exitCode = 1;
  }
}

async function listConnections() {
  const connections = await loadConnections();
  if (connections.length === 0) {
    console.log(chalk.dim("\n  No connections yet. Run: ghostwriter connect\n"));
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

/**
 * Interactive WordPress connection setup.
 * Exported so the `create` command can call it programmatically.
 */
export async function connectWordPress() {
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
        '    3. Enter a name (e.g. "ghostwriter") and click "Add New Application Password"\n' +
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
      `  Saved as "${connectionId}" in ~/.ghostwriter/connections.json\n`
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

// ─── WordPress.com OAuth ────────────────────────────────────────────────────

/**
 * Interactive WordPress.com OAuth connection setup.
 * Exported so the `create` command can call it programmatically.
 */
export async function connectWordPressCom(): Promise<
  ConnectionEntry | undefined
> {
  console.log(chalk.blue("\n  Connect WordPress.com (OAuth)\n"));

  // Step 1: Check env vars
  const clientId = process.env.WPCOM_CLIENT_ID;
  const clientSecret = process.env.WPCOM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log(
      chalk.red("  Missing environment variables: WPCOM_CLIENT_ID and/or WPCOM_CLIENT_SECRET\n")
    );
    console.log(chalk.dim("  To set up a WordPress.com OAuth app:"));
    console.log(chalk.dim("    1. Go to https://developer.wordpress.com/apps/"));
    console.log(chalk.dim("    2. Create a new application"));
    console.log(chalk.dim('    3. Set the redirect URL to "http://localhost:{port}/callback"'));
    console.log(chalk.dim("    4. Export WPCOM_CLIENT_ID and WPCOM_CLIENT_SECRET\n"));
    process.exitCode = 1;
    return undefined;
  }

  // Step 2: Connection name
  const existingWpCom = (await loadConnections()).filter(
    (c) => c.platform === "wordpress-com"
  );
  const defaultName =
    existingWpCom.length === 0
      ? "wordpress-com"
      : `wordpress-com-${existingWpCom.length + 1}`;

  const connectionId = await input({
    message: "Connection name (used as target ID in channel config):",
    default: defaultName,
    validate: (val) =>
      /^[a-z0-9-]+$/.test(val) ||
      "Use lowercase letters, numbers, and hyphens only",
  });

  // Step 3: Start local callback server (fixed port so it matches the registered redirect URI)
  const port = 3456;
  const redirectUri = `http://localhost:${port}/callback`;
  const config: WpComOAuthConfig = {
    clientId,
    clientSecret,
    redirectUri,
  };

  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl(config, state);
  const callbackPromise = startCallbackServer(port, state);

  // Step 4: Open browser
  const { exec } = await import("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${authorizeUrl}"`);

  console.log(chalk.dim("\n  Browser opened for authorization."));
  console.log(chalk.dim("  If it didn't open, visit this URL:\n"));
  console.log(`  ${chalk.cyan(authorizeUrl)}\n`);
  console.log(chalk.dim("  Waiting for authorization..."));

  // Step 5: Wait for callback
  let callbackResult: { code: string; state: string };
  try {
    callbackResult = await callbackPromise;
  } catch (err) {
    console.log(
      chalk.red(
        `\n  Authorization failed: ${err instanceof Error ? err.message : String(err)}\n`
      )
    );
    return undefined;
  }

  // Step 6: Exchange code for token
  console.log(chalk.dim("  Exchanging authorization code for token..."));
  let tokenResponse;
  try {
    tokenResponse = await exchangeCodeForToken(config, callbackResult.code);
  } catch (err) {
    console.log(
      chalk.red(
        `\n  Token exchange failed: ${err instanceof Error ? err.message : String(err)}\n`
      )
    );
    return undefined;
  }

  // Step 7: Fetch user info
  const user = await fetchCurrentUser(tokenResponse.access_token);
  console.log(
    chalk.green(
      `  Authenticated as: ${user.display_name} (@${user.username})`
    )
  );

  // Step 8: Resolve site — token response includes blog_id and blog_url
  let siteUrl = tokenResponse.blog_url;
  const blogId = tokenResponse.blog_id;

  if (siteUrl) {
    console.log(chalk.green(`  Site: ${siteUrl} (blog ID: ${blogId})`));
  } else {
    // Fallback: try to list sites
    try {
      const sites = await fetchUserSites(tokenResponse.access_token);
      const readySites = sites.filter((s) => s.visible && !s.is_coming_soon);

      if (readySites.length === 1) {
        siteUrl = readySites[0].URL;
        console.log(
          chalk.green(`  Auto-selected site: ${readySites[0].name} (${siteUrl})`)
        );
      } else if (readySites.length > 1) {
        siteUrl = await select({
          message: "Which site do you want to connect?",
          choices: readySites.map((s) => ({
            value: s.URL,
            name: `${s.name} — ${s.URL}`,
          })),
        });
      }
    } catch {
      // Site listing failed — ask manually
    }

    if (!siteUrl) {
      siteUrl = await input({
        message: "WordPress.com site URL (e.g. https://yoursite.wordpress.com):",
        validate: (val) => {
          try { new URL(val); return true; } catch { return "Enter a valid URL"; }
        },
      });
    }
  }

  // Step 9: Save connection
  const conn: ConnectionEntry = {
    id: connectionId,
    platform: "wordpress-com",
    url: siteUrl,
    credentials: {
      token: tokenResponse.access_token,
    },
    createdAt: new Date().toISOString(),
  };

  await saveConnection(conn);

  console.log(chalk.green("\n  WordPress.com connected successfully!"));
  console.log(
    chalk.dim(
      `  Saved as "${connectionId}" in ~/.ghostwriter/connections.json\n`
    )
  );

  // Show config example
  console.log("  Add this to your channel config:\n");
  console.log(
    chalk.cyan(
      "  publishTargets:\n" +
        `    - platform: wordpress\n` +
        `      id: ${connectionId}\n`
    )
  );
  console.log();

  return conn;
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
      `  Saved as "${connectionId}" in ~/.ghostwriter/connections.json\n`
    )
  );
}

// ─── Hugo ───────────────────────────────────────────────────────────────────

async function connectHugo() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { access } = await import("node:fs/promises");
  const execFileAsync = promisify(execFile);

  console.log(chalk.blue("\n  Connect Hugo (Git Blog)\n"));
  console.log(
    chalk.dim(
      "  Publishes markdown posts to a local Hugo git repo.\n" +
        "  Commits and pushes via SSH — your CI/CD handles the deploy.\n"
    )
  );

  // Step 1: Connection name
  const existingHugo = (await loadConnections()).filter(
    (c) => c.platform === "hugo"
  );
  const defaultName =
    existingHugo.length === 0
      ? "hugo"
      : `hugo-${existingHugo.length + 1}`;

  const connectionId = await input({
    message: "Connection name:",
    default: defaultName,
    validate: (val) =>
      /^[a-z0-9-]+$/.test(val) ||
      "Use lowercase letters, numbers, and hyphens only",
  });

  // Step 2: Local repo path
  const repoPath = await input({
    message: "Path to local Hugo git repo:",
    validate: async (val) => {
      const resolved = resolve(val.replace(/^~/, process.env.HOME ?? ""));
      try {
        await execFileAsync("git", ["-C", resolved, "rev-parse", "--git-dir"], {
          timeout: 5_000,
        });
        return true;
      } catch {
        return "Not a git repository. Check the path and try again.";
      }
    },
  });

  const resolvedRepo = resolve(repoPath.replace(/^~/, process.env.HOME ?? ""));

  // Step 3: Detect default branch
  let defaultBranch = "main";
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", resolvedRepo, "symbolic-ref", "refs/remotes/origin/HEAD"],
      { timeout: 5_000 }
    );
    const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)/);
    if (match) defaultBranch = match[1];
  } catch {
    // Fall back to "main"
  }

  const branch = await input({
    message: "Git branch to publish to:",
    default: defaultBranch,
  });

  // Step 4: Verify SSH push access
  console.log(chalk.dim("\n  Verifying remote access..."));
  try {
    await execFileAsync("git", ["-C", resolvedRepo, "ls-remote", "--exit-code", "origin"], {
      timeout: 15_000,
    });
    console.log(chalk.green("  Remote access OK"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.yellow(`  Warning: could not reach remote — ${message}`));
    console.log(chalk.dim("  Push may fail. Check your SSH keys or remote URL.\n"));
    const proceed = await confirm({
      message: "Continue anyway?",
      default: true,
    });
    if (!proceed) return;
  }

  // Step 5: Detect Hugo config and infer content dir
  let contentDir = "content/posts";
  try {
    // Check for hugo.toml, config.toml, or config.yaml
    const configFiles = ["hugo.toml", "config.toml", "config.yaml", "hugo.yaml"];
    let foundConfig = false;
    for (const cf of configFiles) {
      try {
        await access(resolve(resolvedRepo, cf));
        foundConfig = true;
        console.log(chalk.green(`  Found Hugo config: ${cf}`));
        break;
      } catch {
        // not found, try next
      }
    }
    if (!foundConfig) {
      console.log(
        chalk.yellow("  No Hugo config found (hugo.toml/config.toml)")
      );
      console.log(chalk.dim("  Make sure this is a Hugo site.\n"));
    }
  } catch {
    // ignore
  }

  contentDir = await input({
    message: "Content directory (relative to repo root):",
    default: contentDir,
  });

  // Step 6: Save connection
  await saveConnection({
    id: connectionId,
    platform: "hugo",
    url: resolvedRepo,
    credentials: {
      repoPath: resolvedRepo,
      branch,
      contentDir,
    },
    createdAt: new Date().toISOString(),
  });

  console.log(chalk.green("\n  Hugo connected successfully!"));
  console.log(
    chalk.dim(
      `  Saved as "${connectionId}" in ~/.ghostwriter/connections.json\n`
    )
  );

  // Show config example
  console.log("  Add this to your channel config:\n");
  console.log(
    chalk.cyan(
      "  publishTargets:\n" +
        `    - platform: hugo\n` +
        `      id: ${connectionId}\n` +
        `      repoPath: ${resolvedRepo}\n`
    )
  );
  console.log();
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export async function checkWordPressApi(
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

export async function testWordPressAuth(
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

