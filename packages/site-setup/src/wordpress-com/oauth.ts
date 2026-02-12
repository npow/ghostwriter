import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WpComOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface WpComTokenResponse {
  access_token: string;
  blog_id: string;
  blog_url: string;
  token_type: string;
}

export interface WpComUser {
  ID: number;
  display_name: string;
  username: string;
  email: string;
  primary_blog: number;
  primary_blog_url: string;
}

export interface WpComSite {
  ID: number;
  name: string;
  URL: string;
  slug: string;
  visible: boolean;
  is_coming_soon: boolean;
}

// ─── OAuth helpers ──────────────────────────────────────────────────────────

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

export function buildAuthorizeUrl(config: WpComOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
  });
  return `https://public-api.wordpress.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  config: WpComOAuthConfig,
  code: string
): Promise<WpComTokenResponse> {
  const resp = await fetch("https://public-api.wordpress.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${body}`);
  }

  return (await resp.json()) as WpComTokenResponse;
}

export async function fetchCurrentUser(token: string): Promise<WpComUser> {
  const resp = await fetch("https://public-api.wordpress.com/rest/v1.1/me", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch user info (${resp.status})`);
  }

  return (await resp.json()) as WpComUser;
}

export async function fetchUserSites(token: string): Promise<WpComSite[]> {
  const resp = await fetch("https://public-api.wordpress.com/rest/v1.1/me/sites", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch sites (${resp.status})`);
  }

  const data = (await resp.json()) as { sites: WpComSite[] };
  return data.sites ?? [];
}

// ─── Local callback server ──────────────────────────────────────────────────

export async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("Could not determine port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Authorization Complete</title></head>
<body style="font-family:system-ui;text-align:center;padding:60px">
<h2>Authorization successful!</h2>
<p>You can close this tab and return to the terminal.</p>
</body></html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html><head><title>Authorization Error</title></head>
<body style="font-family:system-ui;text-align:center;padding:60px">
<h2>Authorization failed</h2>
<p>${msg}</p>
</body></html>`;

export function startCallbackServer(
  port: number,
  expectedState: string,
  timeoutMs = 120_000
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML(`OAuth error: ${error}`));
        cleanup();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML("Missing code or state parameter"));
        cleanup();
        reject(new Error("Missing code or state in callback"));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML("State mismatch — possible CSRF attack"));
        cleanup();
        reject(new Error("State mismatch in OAuth callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);
      cleanup();
      resolve({ code, state });
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("OAuth callback timed out — no response received within 2 minutes"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }

    server.listen(port);
  });
}
