import type { Ora } from "ora";
import { callLlmJson } from "@auto-blogger/content-pipeline";
import { executeSiteSetup, type SiteSetupPlan, type SiteSetupResult } from "@auto-blogger/site-setup";
import type { CreateContext } from "../types.js";
import {
  PAGE_CONTENT_SYSTEM,
  buildPageContentPrompt,
} from "../prompts/page-content.js";

interface SiteSetupLlmResponse {
  categories: Array<{ name: string; slug: string; description: string }>;
  tags: Array<{ name: string; slug: string }>;
  pages: Array<{
    title: string;
    slug: string;
    content: string;
    status: "publish" | "draft";
  }>;
  siteIdentity: { title: string; tagline: string };
  menus: Array<{
    name: string;
    location: string;
    items: Array<{
      title: string;
      type: "page" | "category" | "custom";
      objectSlug?: string;
      url?: string;
    }>;
  }>;
}

export async function setupSite(
  ctx: CreateContext,
  spinner: Ora
): Promise<SiteSetupResult> {
  spinner.start("Planning site setup...");

  const intent = ctx.intent!;
  const voice = ctx.voice!;

  // Use LLM to generate site setup content
  const { data, cost } = await callLlmJson<SiteSetupLlmResponse>(
    "sonnet",
    PAGE_CONTENT_SYSTEM,
    buildPageContentPrompt(
      intent.channelName,
      intent.topic.domain,
      intent.topic.focus,
      intent.toneDescription,
      voice.persona
    ),
    { temperature: 0.5 }
  );

  ctx.totalCost += cost;

  if (ctx.options.dryRun) {
    spinner.succeed(
      `Site plan: ${data.categories.length} categories, ${data.tags.length} tags, ` +
      `${data.pages.length} pages (dry run — not applying)`
    );
    return {
      categories: data.categories.map((c) => ({ name: c.name, id: 0, created: false })),
      tags: data.tags.map((t) => ({ name: t.name, id: 0, created: false })),
      pages: data.pages.map((p) => ({ title: p.title, id: 0, url: "" })),
      settings: { applied: false, changes: [] },
      menus: data.menus.map((m) => ({ name: m.name, id: 0 })),
      errors: [],
    };
  }

  // Build the site setup plan
  const siteId = intent.siteUrl
    ?? ctx.connection?.url?.replace(/^https?:\/\//, "")
    ?? intent.channelId;

  const plan: SiteSetupPlan = {
    platform: "wordpress-com",
    siteId,
    siteIdentity: data.siteIdentity,
    categories: data.categories,
    tags: data.tags,
    pages: data.pages,
    menus: data.menus,
  };

  spinner.text = "Configuring WordPress site...";

  const result = await executeSiteSetup(plan, ctx.connection!);

  const created = result.categories.filter((c) => c.created).length;
  const errors = result.errors.length;
  spinner.succeed(
    `Site configured: ${created} categories created, ${result.pages.length} pages, ${result.menus.length} menus` +
    (errors > 0 ? ` (${errors} errors)` : "")
  );

  return result;
}
