import type { WpComClient } from "./client.js";

interface WpTag {
  id: number;
  name: string;
  slug: string;
}

export async function ensureTags(
  client: WpComClient,
  tags: Array<{ name: string; slug: string }>
): Promise<Array<{ name: string; id: number; created: boolean }>> {
  const existing = await client.get<WpTag[]>("/tags", {
    per_page: "100",
  });

  const results: Array<{ name: string; id: number; created: boolean }> = [];

  for (const tag of tags) {
    const found = existing.find(
      (e) => e.slug === tag.slug || e.name.toLowerCase() === tag.name.toLowerCase()
    );

    if (found) {
      results.push({ name: tag.name, id: found.id, created: false });
    } else {
      const created = await client.post<WpTag>("/tags", {
        name: tag.name,
        slug: tag.slug,
      });
      results.push({ name: tag.name, id: created.id, created: true });
    }
  }

  return results;
}
