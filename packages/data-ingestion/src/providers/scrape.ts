import * as cheerio from "cheerio";
import type { SourceMaterial } from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";
import { withRetry, getCircuitBreaker } from "../retry.js";

const logger = createChildLogger({ module: "data-ingestion:scrape" });

export interface ScrapeProviderConfig {
  url: string;
  selector: string;
  dynamic: boolean;
  waitFor?: string;
}

/**
 * Scrape web content with retry and circuit breaking.
 */
export async function fetchScrapeData(
  config: ScrapeProviderConfig,
  channelId: string
): Promise<SourceMaterial[]> {
  logger.info(
    { url: config.url, dynamic: config.dynamic },
    "Scraping web content"
  );

  const domain = extractDomain(config.url);
  const cb = getCircuitBreaker(domain);
  const html = await cb.execute(
    () => withRetry(
      () => config.dynamic ? fetchDynamic(config) : fetchStatic(config.url),
      `scrape:${domain}`,
      { maxAttempts: 2, initialDelayMs: 3000 }
    ),
    `scrape:${domain}`
  );

  const $ = cheerio.load(html);
  const elements = $(config.selector);

  const materials: SourceMaterial[] = [];

  elements.each((idx, el) => {
    const text = $(el).text().trim();
    if (text) {
      materials.push({
        id: `${channelId}-scrape-${Date.now()}-${idx}`,
        sourceType: "scrape" as const,
        provider: extractDomain(config.url),
        title: $(el).find("h1, h2, h3").first().text().trim() || undefined,
        content: text,
        url: config.url,
        metadata: {
          selector: config.selector,
          html: $(el).html() ?? undefined,
        },
        fetchedAt: new Date().toISOString(),
      });
    }
  });

  return materials;
}

async function fetchStatic(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Ghostwriter/1.0; +https://github.com/ghostwriter)",
    },
  });

  if (!response.ok) {
    throw new Error(`Scrape failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchDynamic(config: ScrapeProviderConfig): Promise<string> {
  // Lazy-load Playwright to avoid startup cost when not needed
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: "networkidle" });

    if (config.waitFor) {
      await page.waitForSelector(config.waitFor, { timeout: 10_000 });
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}
