import type { StyleFingerprint } from "@auto-blogger/core";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "pipeline:style" });

/**
 * Analyze example content to extract a quantitative style fingerprint.
 * This fingerprint is used to constrain the draft prompt for voice consistency.
 */
export function analyzeStyleFingerprint(
  channelId: string,
  exampleTexts: string[]
): StyleFingerprint {
  logger.info(
    { channelId, exampleCount: exampleTexts.length },
    "Analyzing style fingerprint"
  );

  const metrics = exampleTexts.map(analyzeText);

  // Average all metrics across examples
  const avg = <K extends keyof TextMetrics>(key: K) =>
    metrics.reduce((sum, m) => sum + (m[key] as number), 0) / metrics.length;

  const fingerprint: StyleFingerprint = {
    channelId,
    avgSentenceLength: avg("avgSentenceLength"),
    sentenceLengthStdDev: avg("sentenceLengthStdDev"),
    avgParagraphLength: avg("avgParagraphLength"),
    paragraphLengthStdDev: avg("paragraphLengthStdDev"),
    vocabularyRichness: avg("vocabularyRichness"),
    avgWordLength: avg("avgWordLength"),
    contractionFrequency: avg("contractionFrequency"),
    questionFrequency: avg("questionFrequency"),
    exclamationFrequency: avg("exclamationFrequency"),
    transitionWordFrequency: avg("transitionWordFrequency"),
    firstPersonFrequency: avg("firstPersonFrequency"),
    secondPersonFrequency: avg("secondPersonFrequency"),
    passiveVoiceFrequency: avg("passiveVoiceFrequency"),
    adverbFrequency: avg("adverbFrequency"),
    readabilityScore: avg("readabilityScore"),
    humorDensity: avg("humorDensity"),
    metaphorDensity: avg("metaphorDensity"),
    dataReferenceDensity: avg("dataReferenceDensity"),
    dialogueFrequency: avg("dialogueFrequency"),
    listUsageFrequency: avg("listUsageFrequency"),
    avgSectionLength: avg("avgSectionLength"),
    openingStyle: metrics[0]?.openingStyle ?? "direct",
    closingStyle: metrics[0]?.closingStyle ?? "summary",
    topBigrams: extractTopNgrams(exampleTexts, 2, 10),
    topTrigrams: extractTopNgrams(exampleTexts, 3, 10),
    sentimentRange: {
      min: Math.min(...metrics.map((m) => m.sentimentMin)),
      max: Math.max(...metrics.map((m) => m.sentimentMax)),
      avg: avg("sentimentAvg"),
    },
    punctuationProfile: mergePunctuationProfiles(
      metrics.map((m) => m.punctuationProfile)
    ),
  };

  return fingerprint;
}

interface TextMetrics {
  avgSentenceLength: number;
  sentenceLengthStdDev: number;
  avgParagraphLength: number;
  paragraphLengthStdDev: number;
  vocabularyRichness: number;
  avgWordLength: number;
  contractionFrequency: number;
  questionFrequency: number;
  exclamationFrequency: number;
  transitionWordFrequency: number;
  firstPersonFrequency: number;
  secondPersonFrequency: number;
  passiveVoiceFrequency: number;
  adverbFrequency: number;
  readabilityScore: number;
  humorDensity: number;
  metaphorDensity: number;
  dataReferenceDensity: number;
  dialogueFrequency: number;
  listUsageFrequency: number;
  avgSectionLength: number;
  openingStyle: string;
  closingStyle: string;
  sentimentMin: number;
  sentimentMax: number;
  sentimentAvg: number;
  punctuationProfile: Record<string, number>;
}

function analyzeText(text: string): TextMetrics {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));

  // Sentence metrics
  const sentLengths = sentences.map((s) => s.split(/\s+/).length);
  const avgSentLen = mean(sentLengths);
  const sentStdDev = stdDev(sentLengths);

  // Paragraph metrics
  const paraLengths = paragraphs.map((p) => p.split(/\s+/).length);
  const avgParaLen = mean(paraLengths);
  const paraStdDev = stdDev(paraLengths);

  // Word metrics
  const wordLens = words.map((w) => w.replace(/[^a-zA-Z]/g, "").length);

  // Frequency counts
  const contractions = (text.match(/\w+'\w+/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const exclamations = (text.match(/!/g) ?? []).length;

  const transitionWords = [
    "however",
    "but",
    "although",
    "meanwhile",
    "instead",
    "still",
    "yet",
    "though",
    "while",
    "whereas",
  ];
  const transitionCount = words.filter((w) =>
    transitionWords.includes(w.toLowerCase())
  ).length;

  const firstPerson = (text.match(/\b(I|me|my|mine|we|our|us)\b/gi) ?? [])
    .length;
  const secondPerson = (text.match(/\b(you|your|yours)\b/gi) ?? []).length;

  // Passive voice (rough heuristic)
  const passiveMatches = (
    text.match(/\b(was|were|been|being|is|are)\s+\w+ed\b/gi) ?? []
  ).length;

  // Adverbs (rough: words ending in -ly)
  const adverbs = words.filter(
    (w) => w.endsWith("ly") && w.length > 3
  ).length;

  // Sections (headers)
  const sections = text.split(/^#{1,3}\s/m).filter((s) => s.trim().length > 0);
  const sectionLengths = sections.map((s) => s.split(/\s+/).length);

  // Data references (numbers, percentages, dollar amounts)
  const dataRefs = (text.match(/\$?\d[\d,]*\.?\d*%?/g) ?? []).length;

  // Lists
  const lists = (text.match(/^[-*]\s/gm) ?? []).length;

  // Dialogue/quotes
  const quotes = (text.match(/[""][^""]*[""]/g) ?? []).length;

  // Punctuation profile
  const punctuationProfile: Record<string, number> = {};
  for (const char of ".,;:!?-—()\"'") {
    const count = (text.match(new RegExp(`\\${char}`, "g")) ?? []).length;
    punctuationProfile[char] = words.length > 0 ? count / words.length : 0;
  }

  // Opening/closing style detection
  const firstSentence = sentences[0]?.toLowerCase() ?? "";
  const lastParagraph = paragraphs[paragraphs.length - 1]?.toLowerCase() ?? "";

  let openingStyle = "direct";
  if (firstSentence.includes("?")) openingStyle = "question";
  else if (firstSentence.match(/\d/)) openingStyle = "statistic";
  else if (firstSentence.length < 40) openingStyle = "short-punchy";

  let closingStyle = "summary";
  if (lastParagraph.includes("?")) closingStyle = "question";
  else if (
    lastParagraph.includes("will") ||
    lastParagraph.includes("going to")
  )
    closingStyle = "forward-looking";

  return {
    avgSentenceLength: avgSentLen,
    sentenceLengthStdDev: sentStdDev,
    avgParagraphLength: avgParaLen,
    paragraphLengthStdDev: paraStdDev,
    vocabularyRichness:
      words.length > 0 ? uniqueWords.size / words.length : 0,
    avgWordLength: mean(wordLens),
    contractionFrequency:
      sentences.length > 0 ? contractions / sentences.length : 0,
    questionFrequency:
      sentences.length > 0 ? questions / sentences.length : 0,
    exclamationFrequency:
      sentences.length > 0 ? exclamations / sentences.length : 0,
    transitionWordFrequency:
      sentences.length > 0 ? transitionCount / sentences.length : 0,
    firstPersonFrequency:
      sentences.length > 0 ? firstPerson / sentences.length : 0,
    secondPersonFrequency:
      sentences.length > 0 ? secondPerson / sentences.length : 0,
    passiveVoiceFrequency:
      sentences.length > 0 ? passiveMatches / sentences.length : 0,
    adverbFrequency: words.length > 0 ? adverbs / words.length : 0,
    readabilityScore: computeFleschKincaid(words.length, sentences.length, countSyllables(text)),
    humorDensity: 0, // Would need NLP model to detect
    metaphorDensity: 0, // Would need NLP model to detect
    dataReferenceDensity:
      sentences.length > 0 ? dataRefs / sentences.length : 0,
    dialogueFrequency:
      sentences.length > 0 ? quotes / sentences.length : 0,
    listUsageFrequency:
      paragraphs.length > 0 ? lists / paragraphs.length : 0,
    avgSectionLength: mean(sectionLengths),
    openingStyle,
    closingStyle,
    sentimentMin: -0.5, // Simplified — would need sentiment analysis
    sentimentMax: 0.5,
    sentimentAvg: 0,
    punctuationProfile,
  };
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  const variance =
    arr.reduce((sum, val) => sum + (val - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  return words.reduce((total, word) => {
    word = word.replace(/[^a-z]/g, "");
    if (word.length <= 3) return total + 1;
    const vowelGroups = word.match(/[aeiouy]+/g);
    let count = vowelGroups ? vowelGroups.length : 1;
    if (word.endsWith("e") && !word.endsWith("le")) count--;
    return total + Math.max(count, 1);
  }, 0);
}

function computeFleschKincaid(
  wordCount: number,
  sentenceCount: number,
  syllableCount: number
): number {
  if (sentenceCount === 0 || wordCount === 0) return 0;
  return (
    206.835 -
    1.015 * (wordCount / sentenceCount) -
    84.6 * (syllableCount / wordCount)
  );
}

function extractTopNgrams(
  texts: string[],
  n: number,
  topK: number
): string[] {
  const counts = new Map<string, number>();

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(" ");
      counts.set(ngram, (counts.get(ngram) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([ngram]) => ngram);
}

function mergePunctuationProfiles(
  profiles: Record<string, number>[]
): Record<string, number> {
  const merged: Record<string, number> = {};
  const keys = new Set(profiles.flatMap((p) => Object.keys(p)));

  for (const key of keys) {
    const values = profiles
      .map((p) => p[key])
      .filter((v) => v !== undefined);
    merged[key] = mean(values);
  }

  return merged;
}
