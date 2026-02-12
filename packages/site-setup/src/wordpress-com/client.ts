import type { ConnectionEntry } from "@auto-blogger/core";

export class WpComClient {
  private token: string;
  private siteId: string;
  private baseUrl: string;

  constructor(siteId: string, token: string) {
    this.siteId = siteId;
    this.token = token;
    this.baseUrl = `https://public-api.wordpress.com/wp/v2/sites/${siteId}`;
  }

  /**
   * Create a client from a ConnectionEntry.
   * Supports both WordPress.com (bearer token) and self-hosted WP (basic auth).
   */
  static fromConnection(conn: ConnectionEntry): WpComClient {
    const siteId = conn.url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? conn.id;

    // If the connection has a bearer token, use it directly
    if (conn.credentials.token) {
      return new WpComClient(siteId, conn.credentials.token);
    }

    // For basic auth connections, encode as base64 for the Authorization header
    const { username, password } = conn.credentials;
    if (username && password) {
      const basic = Buffer.from(`${username}:${password}`).toString("base64");
      const client = new WpComClient(siteId, basic);
      client.baseUrl = `${conn.url}/wp-json/wp/v2`;
      (client as WpComClientWithAuthType)._authType = "basic";
      return client;
    }

    throw new Error(
      `Connection "${conn.id}" has no usable credentials (need token or username+password)`
    );
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const resp = await fetch(url.toString(), {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`WP API GET ${path} failed: HTTP ${resp.status} — ${body}`);
    }

    return resp.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`WP API POST ${path} failed: HTTP ${resp.status} — ${text}`);
    }

    return resp.json() as Promise<T>;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`WP API PUT ${path} failed: HTTP ${resp.status} — ${text}`);
    }

    return resp.json() as Promise<T>;
  }

  async delete(path: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`WP API DELETE ${path} failed: HTTP ${resp.status} — ${text}`);
    }
  }

  async uploadMedia(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ id: number; url: string }> {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append("file", blob, filename);

    const resp = await fetch(`${this.baseUrl}/media`, {
      method: "POST",
      headers: this.authHeaders(),
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`WP API media upload failed: HTTP ${resp.status} — ${text}`);
    }

    const data = (await resp.json()) as { id: number; source_url: string };
    return { id: data.id, url: data.source_url };
  }

  private authHeaders(): Record<string, string> {
    if ((this as WpComClientWithAuthType)._authType === "basic") {
      return { Authorization: `Basic ${this.token}` };
    }
    return { Authorization: `Bearer ${this.token}` };
  }
}

interface WpComClientWithAuthType extends WpComClient {
  _authType?: "basic" | "bearer";
}
