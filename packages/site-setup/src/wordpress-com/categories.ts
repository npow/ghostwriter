import type { WpComClient } from "./client.js";

interface WpCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export async function ensureCategories(
  client: WpComClient,
  categories: Array<{ name: string; slug: string; description?: string }>
): Promise<Array<{ name: string; id: number; created: boolean }>> {
  // Fetch existing categories
  const existing = await client.get<WpCategory[]>("/categories", {
    per_page: "100",
  });

  const results: Array<{ name: string; id: number; created: boolean }> = [];

  for (const cat of categories) {
    const found = existing.find(
      (e) => e.slug === cat.slug || e.name.toLowerCase() === cat.name.toLowerCase()
    );

    if (found) {
      results.push({ name: cat.name, id: found.id, created: false });
    } else {
      const created = await client.post<WpCategory>("/categories", {
        name: cat.name,
        slug: cat.slug,
        description: cat.description ?? "",
      });
      results.push({ name: cat.name, id: created.id, created: true });
    }
  }

  return results;
}
