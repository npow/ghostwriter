import type { WpComClient } from "./client.js";

interface WpPage {
  id: number;
  title: { rendered: string };
  slug: string;
  link: string;
  status: string;
}

export async function ensurePages(
  client: WpComClient,
  pages: Array<{
    title: string;
    slug: string;
    content: string;
    status: "publish" | "draft";
  }>
): Promise<Array<{ title: string; id: number; url: string }>> {
  // Fetch existing pages to avoid duplicates
  const existing = await client.get<WpPage[]>("/pages", {
    per_page: "100",
    status: "publish,draft",
  });

  const results: Array<{ title: string; id: number; url: string }> = [];

  for (const page of pages) {
    const found = existing.find((e) => e.slug === page.slug);

    if (found) {
      // Update existing page content
      const updated = await client.post<WpPage>(`/pages/${found.id}`, {
        title: page.title,
        content: page.content,
        status: page.status,
      });
      results.push({
        title: page.title,
        id: updated.id,
        url: updated.link,
      });
    } else {
      const created = await client.post<WpPage>("/pages", {
        title: page.title,
        slug: page.slug,
        content: page.content,
        status: page.status,
      });
      results.push({
        title: page.title,
        id: created.id,
        url: created.link,
      });
    }
  }

  return results;
}
