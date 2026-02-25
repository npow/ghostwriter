import { createChildLogger } from "@ghostwriter/core";

const logger = createChildLogger({ module: "pipeline:verify-links" });

export interface LinkCheckResult {
  url: string;
  text: string;
  status: number | null;
  ok: boolean;
  error?: string;
}

export interface LinkVerificationResult {
  total: number;
  valid: number;
  broken: LinkCheckResult[];
  all: LinkCheckResult[];
}

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;

/**
 * Extract all markdown links from content.
 */
function extractMarkdownLinks(content: string): { text: string; url: string }[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: { text: string; url: string }[] = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2].trim();
    // Skip anchors and relative links
    if (url.startsWith("http://") || url.startsWith("https://")) {
      links.push({ text: match[1], url });
    }
  }
  return links;
}

/**
 * Check if a single URL is reachable via HEAD request, falling back to GET.
 */
async function checkUrl(url: string): Promise<{ status: number | null; ok: boolean; error?: string }> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": "Ghostwriter-LinkChecker/1.0" },
    });
    if (resp.ok) return { status: resp.status, ok: true };

    // Some servers reject HEAD — retry with GET
    if (resp.status === 405 || resp.status === 403) {
      const getResp = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
        headers: { "User-Agent": "Ghostwriter-LinkChecker/1.0" },
      });
      return { status: getResp.status, ok: getResp.ok };
    }

    return { status: resp.status, ok: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: null, ok: false, error: message };
  }
}

/**
 * Verify all links in markdown content. Returns broken links and stats.
 */
export async function verifyLinks(content: string): Promise<LinkVerificationResult> {
  const links = extractMarkdownLinks(content);
  // Dedupe by URL
  const seen = new Set<string>();
  const unique = links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  logger.info({ count: unique.length }, "Verifying links");

  const results: LinkCheckResult[] = [];

  // Check in batches for concurrency control
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (link) => {
        const check = await checkUrl(link.url);
        return { ...link, ...check };
      })
    );
    results.push(...batchResults);
  }

  const broken = results.filter((r) => !r.ok);

  if (broken.length > 0) {
    logger.warn(
      { broken: broken.map((b) => ({ url: b.url, status: b.status, error: b.error })) },
      "Broken links found"
    );
  } else {
    logger.info({ total: results.length }, "All links valid");
  }

  return {
    total: results.length,
    valid: results.length - broken.length,
    broken,
    all: results,
  };
}
