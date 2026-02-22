import type { StyleProfile } from "./types.js";
import { analyzeStyle } from "./analyze.js";

/**
 * Fetch a URL and extract text blocks from the HTML.
 * Uses Node 22+ built-in fetch — zero external dependencies.
 */
export async function fetchAndExtract(url: string): Promise<string[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; StyleFingerprint/1.0; +https://github.com/ghostwriter)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }

  const html = await response.text();
  return extractTextBlocks(html);
}

/**
 * Fetch a URL, extract text, and analyze the style.
 */
export async function analyzeUrl(url: string): Promise<StyleProfile> {
  const texts = await fetchAndExtract(url);
  if (texts.length === 0) {
    throw new Error(`No text content extracted from ${url}`);
  }
  return analyzeStyle(texts);
}

// ─── HTML text extraction ────────────────────────────────────────────────────

/**
 * Extract text blocks from HTML. Simple regex-based approach — no DOM parser
 * dependency. Targets <article>, <main>, or falls back to <body>.
 */
function extractTextBlocks(html: string): string[] {
  // Try to find the main content region
  let region = extractRegion(html, "article")
    ?? extractRegion(html, "main")
    ?? extractRegion(html, "body")
    ?? html;

  // Strip elements that are not content
  region = stripTags(region, "script");
  region = stripTags(region, "style");
  region = stripTags(region, "nav");
  region = stripTags(region, "header");
  region = stripTags(region, "footer");
  region = stripTags(region, "aside");
  region = stripTags(region, "noscript");

  // Extract text from content-bearing elements
  const blocks: string[] = [];

  // Paragraphs
  for (const match of region.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripAllTags(match[1]).trim();
    if (text.length > 20) blocks.push(text);
  }

  // Headings
  for (const match of region.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    const text = stripAllTags(match[1]).trim();
    if (text.length > 3) blocks.push(text);
  }

  // List items
  for (const match of region.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = stripAllTags(match[1]).trim();
    if (text.length > 10) blocks.push(text);
  }

  // Blockquotes
  for (const match of region.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
    const text = stripAllTags(match[1]).trim();
    if (text.length > 20) blocks.push(text);
  }

  // If we didn't find structured elements, fall back to stripping all tags
  if (blocks.length === 0) {
    const plainText = stripAllTags(region).trim();
    const paragraphs = plainText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);
    blocks.push(...paragraphs);
  }

  return blocks;
}

function extractRegion(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1] : null;
}

function stripTags(html: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(regex, "");
}

function stripAllTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&#\d+;/g, "")
    .replace(/&\w+;/g, "")
    .replace(/\s+/g, " ");
}
