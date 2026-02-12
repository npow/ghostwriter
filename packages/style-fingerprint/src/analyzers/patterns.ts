import type { MessageAnalysis, StylePatterns } from "../types.js";
import { mean } from "./helpers.js";

/**
 * Detect qualitative style patterns from per-message analyses.
 * Ported from Prism's analyzer.ts pattern detection logic.
 */
export function computePatterns(
  analyses: MessageAnalysis[],
  texts: string[]
): StylePatterns {
  if (analyses.length === 0) {
    return {
      greetingStyle: "",
      signoffStyle: "",
      preferredFormat: "plain",
      usesHeadings: false,
      usesBulletPoints: false,
      usesNumberedLists: false,
      usesTables: false,
      averageSentenceLength: 0,
      averageMessageLength: 0,
    };
  }

  const avgSentenceLength = mean(analyses.map((a) => a.avgSentenceLength));
  const avgMessageLength = mean(analyses.map((a) => a.wordCount));
  const bulletFrequency = mean(analyses.map((a) => (a.hasBullets ? 1 : 0)));
  const headingFrequency = mean(analyses.map((a) => (a.hasHeadings ? 1 : 0)));
  const numberedListFrequency = mean(
    analyses.map((a) => (a.hasNumberedLists ? 1 : 0))
  );
  const tableFrequency = mean(analyses.map((a) => (a.hasTables ? 1 : 0)));

  const greetingStyle =
    detectDominantPattern(
      analyses.map((a) => a.greeting).filter(Boolean) as string[]
    ) ?? "";

  const signoffStyle =
    detectDominantPattern(
      analyses.map((a) => a.signoff).filter(Boolean) as string[]
    ) ?? "";

  return {
    greetingStyle,
    signoffStyle,
    preferredFormat: detectPreferredFormat(texts),
    usesHeadings: headingFrequency > 0.3,
    usesBulletPoints: bulletFrequency > 0.3,
    usesNumberedLists: numberedListFrequency > 0.3,
    usesTables: tableFrequency > 0.1,
    averageSentenceLength: Math.round(avgSentenceLength),
    averageMessageLength: Math.round(avgMessageLength),
  };
}

/**
 * Analyze a single message for greeting, signoff, structural elements,
 * and word-list signals used by dimension and pattern computation.
 */
export function analyzeMessage(
  text: string,
  wordLists: {
    formal: Set<string>;
    informal: Set<string>;
    technical: Set<string>;
  }
): MessageAnalysis {
  const words = extractWords(text);
  const wordCount = words.length;
  const sentences = extractSentences(text);
  const sentenceCount = Math.max(sentences.length, 1);
  const avgSentenceLength = wordCount / sentenceCount;

  // Emoji detection
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  const emojiMatches = text.match(emojiRegex) ?? [];
  const emojiCount = emojiMatches.length;
  const emojiFrequency = wordCount > 0 ? emojiCount / wordCount : 0;

  // Structural elements
  const hasBullets = /^[\s]*[-*+]\s/m.test(text);
  const hasNumberedLists = /^[\s]*\d+[.)]\s/m.test(text);
  const hasHeadings =
    /^#{1,6}\s/m.test(text) || /^[A-Z][A-Za-z\s]{2,}:$/m.test(text);
  const hasTables = /\|.*\|.*\|/m.test(text);

  // Greeting / signoff
  const greeting = detectGreeting(text);
  const signoff = detectSignoff(text);

  // Word-list counts
  const formalWords = countMatches(words, wordLists.formal);
  const informalWords = countMatches(words, wordLists.informal);
  const technicalWords = countMatches(words, wordLists.technical);
  const contractionCount = (text.match(/\b\w+'\w+\b/g) ?? []).length;

  return {
    wordCount,
    sentenceCount,
    avgSentenceLength,
    emojiCount,
    emojiFrequency,
    hasBullets,
    hasHeadings,
    hasNumberedLists,
    hasTables,
    greeting,
    signoff,
    formalWords,
    informalWords,
    technicalWords,
    contractionCount,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function detectGreeting(text: string): string | null {
  const lines = text.split("\n").slice(0, 3);
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(
      /^(hey|hi|hello|dear|good\s+(?:morning|afternoon|evening)|greetings|howdy|yo)\b[^.!?]*/i
    );
    if (match) {
      const greeting = match[1].toLowerCase();
      if (trimmed.length < 50) return trimmed.replace(/[,:]?\s*$/, "");
      return greeting;
    }
  }
  return null;
}

function detectSignoff(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tail = lines.slice(-5);
  for (const line of tail) {
    const match = line.match(
      /^(best(?:\s+regards)?|regards|thanks|thank\s+you|cheers|sincerely|warm(?:ly|\s+regards)|kind\s+regards|all\s+the\s+best|take\s+care|talk\s+soon|sent\s+from)/i
    );
    if (match) {
      if (line.length < 50) return line.replace(/[,]?\s*$/, "");
      return match[1];
    }
  }
  return null;
}

function detectDominantPattern(patterns: string[]): string | null {
  if (patterns.length === 0) return null;

  const counts = new Map<string, number>();
  for (const p of patterns) {
    const normalized = p.toLowerCase().trim();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  let maxCount = 0;
  let dominant: string | null = null;
  for (const [pattern, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = pattern;
    }
  }

  if (dominant) {
    return (
      patterns.find((p) => p.toLowerCase().trim() === dominant) ?? dominant
    );
  }
  return null;
}

function detectPreferredFormat(messages: string[]): string {
  let htmlCount = 0;
  let markdownCount = 0;
  let plainCount = 0;

  for (const msg of messages) {
    if (/<[a-z][^>]*>/i.test(msg)) {
      htmlCount++;
    } else if (/^#{1,6}\s|^\*\*|^[-*+]\s|\[.*\]\(.*\)/m.test(msg)) {
      markdownCount++;
    } else {
      plainCount++;
    }
  }

  if (htmlCount >= markdownCount && htmlCount >= plainCount) return "html";
  if (markdownCount >= plainCount) return "markdown";
  return "plain";
}

function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function extractSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countMatches(words: string[], dictionary: Set<string>): number {
  let count = 0;
  for (const word of words) {
    if (dictionary.has(word)) count++;
  }
  return count;
}
