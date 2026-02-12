import type { Ora } from "ora";
import type { DataSource } from "@auto-blogger/core";
import { callLlmJson } from "@auto-blogger/content-pipeline";
import { validateRssFeed } from "@auto-blogger/data-ingestion";
import type { CreateContext, DiscoveredSources } from "../types.js";
import {
  SOURCE_DISCOVERY_SYSTEM,
  buildSourceDiscoveryPrompt,
} from "../prompts/source-discovery.js";

export async function discoverSources(
  ctx: CreateContext,
  spinner: Ora
): Promise<DataSource[]> {
  spinner.start("Discovering data sources...");

  const intent = ctx.intent!;

  const { data, cost } = await callLlmJson<DiscoveredSources>(
    "sonnet",
    SOURCE_DISCOVERY_SYSTEM,
    buildSourceDiscoveryPrompt(
      intent.topic.domain,
      intent.topic.keywords,
      intent.topic.focus
    ),
    { temperature: 0.3 }
  );

  ctx.totalCost += cost;

  // Validate RSS feeds
  const validSources: DataSource[] = [];
  let validated = 0;
  let failed = 0;

  for (const source of data.sources) {
    if (source.type === "rss") {
      spinner.text = `Validating RSS: ${source.name}...`;
      const result = await validateRssFeed(source.url);
      if (result.valid) {
        validSources.push({
          type: "rss",
          url: source.url,
          maxItems: 10,
        });
        validated++;
      } else {
        failed++;
      }
    } else if (source.type === "api") {
      // API sources are included but may need API keys
      validSources.push({
        type: "api",
        provider: source.name.toLowerCase().replace(/\s+/g, "-"),
        endpoint: source.url,
        headers: source.apiKeyEnvVar
          ? { Authorization: `Bearer \${${source.apiKeyEnvVar}}` }
          : undefined,
      });
    }
  }

  if (validSources.length === 0) {
    // Fallback: create a generic RSS source from the domain
    spinner.warn("No sources validated — adding a placeholder RSS source");
    validSources.push({
      type: "rss",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(intent.topic.keywords[0] ?? intent.topic.domain)}`,
      maxItems: 10,
    });
  }

  spinner.succeed(
    `Found ${validSources.length} source(s) (${validated} RSS validated, ${failed} failed)`
  );

  return validSources;
}
