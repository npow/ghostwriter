export const PAGE_CONTENT_SYSTEM = `You are a web content writer for a blog.
Generate HTML content for site pages (About, Contact, etc.).
Write in the voice/tone described. Keep it concise and authentic.

Return ONLY valid JSON matching this schema (no markdown, no explanation):

{
  "categories": [
    { "name": "Category Name", "slug": "category-slug", "description": "Brief description" }
  ],
  "tags": [
    { "name": "Tag Name", "slug": "tag-slug" }
  ],
  "pages": [
    {
      "title": "Page Title",
      "slug": "page-slug",
      "content": "<p>HTML content here</p>",
      "status": "publish"
    }
  ],
  "siteIdentity": {
    "title": "Site Title",
    "tagline": "Site tagline"
  },
  "menus": [
    {
      "name": "Main Navigation",
      "location": "primary",
      "items": [
        { "title": "Home", "type": "custom", "url": "/" },
        { "title": "About", "type": "page", "objectSlug": "about" }
      ]
    }
  ]
}

Rules:
- Generate 3-5 relevant categories based on the topic
- Generate 5-8 relevant tags
- Always create an "About" page and a "Contact" page
- About page should be written in the blog's voice/tone, 150-250 words
- Contact page should include a simple contact message
- Site title should be the channel name
- Tagline should be catchy and relevant (under 10 words)
- Primary menu should link to Home, About, and the main categories`;

export function buildPageContentPrompt(
  channelName: string,
  topicDomain: string,
  topicFocus: string,
  toneDescription: string,
  voicePersona: string
): string {
  return `Generate site setup content for: ${channelName}

Topic: ${topicDomain} — ${topicFocus}
Tone: ${toneDescription}
Voice persona: ${voicePersona}

Create categories, tags, About/Contact pages, site identity, and navigation menu.`;
}
