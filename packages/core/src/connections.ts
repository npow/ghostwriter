import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

/**
 * Stored credentials for a platform connection.
 * Saved to ~/.ghostwriter/connections.json so credentials
 * aren't tied to a single .env file or channel.
 */
export interface ConnectionEntry {
  id: string; // User-chosen name (e.g. "tech-blog", "recipes-site")
  platform: string;
  url?: string;
  credentials: Record<string, string>;
  createdAt: string;
}

interface ConnectionsFile {
  connections: ConnectionEntry[];
}

function getConnectionsPath(): string {
  const home =
    process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  return join(home, ".ghostwriter", "connections.json");
}

export async function loadConnections(): Promise<ConnectionEntry[]> {
  const path = getConnectionsPath();
  try {
    const data = await readFile(path, "utf-8");
    const parsed = JSON.parse(data) as ConnectionsFile;
    return parsed.connections ?? [];
  } catch {
    return [];
  }
}

export async function saveConnection(entry: ConnectionEntry): Promise<void> {
  const path = getConnectionsPath();
  const existing = await loadConnections();

  // Upsert: replace if same id+platform exists
  const idx = existing.findIndex(
    (c) => c.id === entry.id && c.platform === entry.platform
  );
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ connections: existing }, null, 2),
    "utf-8"
  );
}

export async function removeConnection(
  id: string,
  platform: string
): Promise<boolean> {
  const path = getConnectionsPath();
  const existing = await loadConnections();
  const filtered = existing.filter(
    (c) => !(c.id === id && c.platform === platform)
  );

  if (filtered.length === existing.length) return false;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ connections: filtered }, null, 2),
    "utf-8"
  );
  return true;
}

/**
 * Find a connection by ID and platform.
 */
export async function getConnection(
  id: string,
  platform: string
): Promise<ConnectionEntry | undefined> {
  const connections = await loadConnections();
  return connections.find(
    (c) => c.id === id && c.platform === platform
  );
}

/**
 * Find all connections for a given platform.
 */
export async function getConnectionsForPlatform(
  platform: string
): Promise<ConnectionEntry[]> {
  const connections = await loadConnections();
  return connections.filter((c) => c.platform === platform);
}

/**
 * Resolve a publish target ID. If no explicit ID is set,
 * generate a deterministic one from the platform + index.
 */
export function resolveTargetId(
  target: { platform: string; id?: string },
  index: number
): string {
  if (target.id) return target.id;
  return index === 0 ? target.platform : `${target.platform}-${index + 1}`;
}
