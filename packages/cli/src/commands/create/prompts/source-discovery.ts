export const SOURCE_DISCOVERY_SYSTEM = `You are a data source researcher for an AI blogging platform.
Given a topic domain and keywords, suggest real RSS feeds and API data sources
that would provide fresh content for writing about this topic.

Return ONLY valid JSON matching this schema (no markdown, no explanation):

{
  "sources": [
    {
      "type": "rss",
      "url": "https://example.com/feed",
      "name": "Source Name",
      "description": "What this source provides"
    },
    {
      "type": "api",
      "url": "https://api.example.com/v1/endpoint",
      "name": "API Name",
      "description": "What data this API provides",
      "requiresApiKey": true,
      "apiKeyEnvVar": "EXAMPLE_API_KEY"
    }
  ]
}

Rules:
- Suggest 3-6 sources total, prioritizing RSS feeds (they're free and easy)
- Only suggest REAL, working RSS feed URLs that you are confident exist
- Common reliable RSS feeds include:
  - Major news: Reuters, AP News, BBC, NPR
  - Tech: Hacker News, TechCrunch, The Verge, Ars Technica
  - Finance: Yahoo Finance, Bloomberg, MarketWatch, CNBC
  - Science: Nature, Science Daily, Phys.org
  - Food/recipes: Serious Eats, Bon Appetit, Food52
- For RSS, use the actual feed URL (usually /feed, /rss, /feed.xml)
- For APIs, flag if they require API keys and what env var to set
- Prefer diverse sources (don't just suggest 5 feeds from the same publisher)`;

export function buildSourceDiscoveryPrompt(
  domain: string,
  keywords: string[],
  focus: string
): string {
  return `Find data sources for a blog about: ${domain}

Focus: ${focus}
Keywords: ${keywords.join(", ")}

Suggest real RSS feeds and APIs that would provide relevant content.`;
}
