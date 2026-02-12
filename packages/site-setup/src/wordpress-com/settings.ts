import type { WpComClient } from "./client.js";

interface WpSettings {
  title: string;
  description: string;
  [key: string]: unknown;
}

export async function updateSiteSettings(
  client: WpComClient,
  settings: { title: string; tagline: string }
): Promise<{ applied: boolean; changes: string[] }> {
  const changes: string[] = [];

  const current = await client.get<WpSettings>("/settings");

  const updates: Record<string, string> = {};

  if (current.title !== settings.title) {
    updates.title = settings.title;
    changes.push(`title: "${current.title}" → "${settings.title}"`);
  }

  if (current.description !== settings.tagline) {
    updates.description = settings.tagline;
    changes.push(`tagline: "${current.description}" → "${settings.tagline}"`);
  }

  if (Object.keys(updates).length > 0) {
    await client.post<WpSettings>("/settings", updates);
    return { applied: true, changes };
  }

  return { applied: false, changes: ["No changes needed"] };
}
