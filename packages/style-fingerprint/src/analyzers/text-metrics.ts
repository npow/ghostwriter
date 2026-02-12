import type { TextMetrics } from "../types.js";
import {
  mean,
  stdDev,
  countSyllables,
  computeFleschKincaid,
} from "./helpers.js";

const TRANSITION_WORDS = [
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

/**
 * Extract raw text metrics from a single text sample.
 * Ported from content-pipeline/src/style/fingerprint.ts
 */
export function analyzeText(text: string): TextMetrics {
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

  const transitionCount = words.filter((w) =>
    TRANSITION_WORDS.includes(w.toLowerCase())
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
  const quotes = (text.match(/[""\u201C][^""\u201D]*[""\u201D]/g) ?? []).length;

  // Punctuation profile
  const punctuationProfile: Record<string, number> = {};
  for (const char of ".,;:!?-\u2014()\"'") {
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
    readabilityScore: computeFleschKincaid(
      words.length,
      sentences.length,
      countSyllables(text)
    ),
    dataReferenceDensity:
      sentences.length > 0 ? dataRefs / sentences.length : 0,
    dialogueFrequency:
      sentences.length > 0 ? quotes / sentences.length : 0,
    listUsageFrequency:
      paragraphs.length > 0 ? lists / paragraphs.length : 0,
    avgSectionLength: mean(sectionLengths),
    openingStyle,
    closingStyle,
    sentimentMin: -0.5,
    sentimentMax: 0.5,
    sentimentAvg: 0,
    punctuationProfile,
  };
}
