export const EXAMPLE_ARTICLE_SYSTEM = `You are a blog writer. Write a sample article that demonstrates the voice, style, and topic focus described.
This article will be used as a reference example for future content generation.

Rules:
- Write approximately 500 words
- Use the voice persona's verbal tics and preferred vocabulary
- Match the described tone exactly
- Include the kind of structure (headings, lists, etc.) typical for this content type
- Make it feel authentic and natural — not like AI-generated content
- Vary sentence length significantly (some short punchy sentences, some longer flowing ones)
- Use contractions naturally
- Include specific details, even if fictional/example data
- Do NOT use any phrases from the forbidden vocabulary list
- Output ONLY the article in markdown format (no meta-commentary)`;

export function buildExampleArticlePrompt(
  channelName: string,
  contentType: string,
  topicFocus: string,
  voiceName: string,
  voicePersona: string,
  verbalTics: string[],
  preferredVocab: string[],
  forbiddenVocab: string[],
  tone: string
): string {
  return `Write a sample ${contentType} for "${channelName}".

Topic focus: ${topicFocus}

Voice: ${voiceName}
${voicePersona}

Verbal tics to use naturally: ${verbalTics.join(", ") || "none"}
Preferred vocabulary: ${preferredVocab.join(", ") || "none"}
Tone: ${tone}

FORBIDDEN phrases (never use these):
${forbiddenVocab.map((p) => `- "${p}"`).join("\n")}

Write the article now (~500 words, markdown format).`;
}
