import type { StyleProfile, StyleDimensions, StylePatterns, RawStyleMetrics } from "./types.js";
import { analyzeText } from "./analyzers/text-metrics.js";
import { computeDimensions } from "./analyzers/dimensions.js";
import { computePatterns, analyzeMessage } from "./analyzers/patterns.js";
import {
  mean,
  extractTopNgrams,
  mergePunctuationProfiles,
} from "./analyzers/helpers.js";
import {
  FORMAL_WORDS,
  INFORMAL_WORDS,
  TECHNICAL_WORDS,
} from "./analyzers/word-lists.js";

/**
 * Analyze an array of text samples and produce a unified StyleProfile.
 * Merges raw metric extraction (auto_blogger) with normalized dimension
 * scoring (Prism). Pure computation — no LLM calls, no dependencies.
 */
export function analyzeStyle(texts: string[]): StyleProfile {
  if (texts.length === 0) {
    return emptyProfile();
  }

  // --- Raw metrics (from auto_blogger's fingerprint logic) ---
  const textMetrics = texts.map(analyzeText);

  const avg = <K extends keyof (typeof textMetrics)[0]>(key: K) =>
    mean(
      textMetrics.map((m) => m[key] as number)
    );

  const raw: RawStyleMetrics = {
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
    dataReferenceDensity: avg("dataReferenceDensity"),
    dialogueFrequency: avg("dialogueFrequency"),
    listUsageFrequency: avg("listUsageFrequency"),
    avgSectionLength: avg("avgSectionLength"),
    openingStyle: textMetrics[0]?.openingStyle ?? "direct",
    closingStyle: textMetrics[0]?.closingStyle ?? "summary",
    topBigrams: extractTopNgrams(texts, 2, 10),
    topTrigrams: extractTopNgrams(texts, 3, 10),
    sentimentRange: {
      min: Math.min(...textMetrics.map((m) => m.sentimentMin)),
      max: Math.max(...textMetrics.map((m) => m.sentimentMax)),
      avg: avg("sentimentAvg"),
    },
    punctuationProfile: mergePunctuationProfiles(
      textMetrics.map((m) => m.punctuationProfile)
    ),
  };

  // --- Dimension + pattern analysis (from Prism's analyzer logic) ---
  const wordLists = {
    formal: FORMAL_WORDS,
    informal: INFORMAL_WORDS,
    technical: TECHNICAL_WORDS,
  };
  const messageAnalyses = texts.map((t) => analyzeMessage(t, wordLists));
  const dimensions = computeDimensions(messageAnalyses);
  const patterns = computePatterns(messageAnalyses, texts);

  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    sampleCount: texts.length,
    dimensions,
    patterns,
    raw,
  };
}

/**
 * Merge multiple StyleProfiles into one.
 * Averages numeric dimensions and raw metrics, merges ngrams,
 * and uses majority vote for boolean patterns.
 */
export function mergeStyleProfiles(profiles: StyleProfile[]): StyleProfile {
  if (profiles.length === 0) return emptyProfile();
  if (profiles.length === 1) return profiles[0];

  const avgDim = <K extends keyof StyleDimensions>(key: K): number =>
    mean(profiles.map((p) => p.dimensions[key]));

  const dimensions: StyleDimensions = {
    verbosity: avgDim("verbosity"),
    formality: avgDim("formality"),
    structure: avgDim("structure"),
    technicality: avgDim("technicality"),
    emojiUsage: avgDim("emojiUsage"),
    responseLength: avgDim("responseLength"),
  };

  // Majority vote for booleans
  const majority = (fn: (p: StyleProfile) => boolean): boolean =>
    profiles.filter(fn).length > profiles.length / 2;

  const patterns: StylePatterns = {
    greetingStyle: profiles[0].patterns.greetingStyle,
    signoffStyle: profiles[0].patterns.signoffStyle,
    preferredFormat: profiles[0].patterns.preferredFormat,
    usesHeadings: majority((p) => p.patterns.usesHeadings),
    usesBulletPoints: majority((p) => p.patterns.usesBulletPoints),
    usesNumberedLists: majority((p) => p.patterns.usesNumberedLists),
    usesTables: majority((p) => p.patterns.usesTables),
    averageSentenceLength: mean(
      profiles.map((p) => p.patterns.averageSentenceLength)
    ),
    averageMessageLength: mean(
      profiles.map((p) => p.patterns.averageMessageLength)
    ),
  };

  const avgRaw = <K extends keyof RawStyleMetrics>(key: K): number =>
    mean(profiles.map((p) => p.raw[key] as number));

  // Merge ngrams by collecting unique ones ordered by frequency across profiles
  const allBigrams = new Map<string, number>();
  const allTrigrams = new Map<string, number>();
  for (const p of profiles) {
    for (const [i, bg] of p.raw.topBigrams.entries()) {
      allBigrams.set(bg, (allBigrams.get(bg) ?? 0) + (10 - i));
    }
    for (const [i, tg] of p.raw.topTrigrams.entries()) {
      allTrigrams.set(tg, (allTrigrams.get(tg) ?? 0) + (10 - i));
    }
  }

  const raw: RawStyleMetrics = {
    avgSentenceLength: avgRaw("avgSentenceLength"),
    sentenceLengthStdDev: avgRaw("sentenceLengthStdDev"),
    avgParagraphLength: avgRaw("avgParagraphLength"),
    paragraphLengthStdDev: avgRaw("paragraphLengthStdDev"),
    vocabularyRichness: avgRaw("vocabularyRichness"),
    avgWordLength: avgRaw("avgWordLength"),
    contractionFrequency: avgRaw("contractionFrequency"),
    questionFrequency: avgRaw("questionFrequency"),
    exclamationFrequency: avgRaw("exclamationFrequency"),
    transitionWordFrequency: avgRaw("transitionWordFrequency"),
    firstPersonFrequency: avgRaw("firstPersonFrequency"),
    secondPersonFrequency: avgRaw("secondPersonFrequency"),
    passiveVoiceFrequency: avgRaw("passiveVoiceFrequency"),
    adverbFrequency: avgRaw("adverbFrequency"),
    readabilityScore: avgRaw("readabilityScore"),
    dataReferenceDensity: avgRaw("dataReferenceDensity"),
    dialogueFrequency: avgRaw("dialogueFrequency"),
    listUsageFrequency: avgRaw("listUsageFrequency"),
    avgSectionLength: avgRaw("avgSectionLength"),
    openingStyle: profiles[0].raw.openingStyle,
    closingStyle: profiles[0].raw.closingStyle,
    topBigrams: [...allBigrams.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([bg]) => bg),
    topTrigrams: [...allTrigrams.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tg]) => tg),
    sentimentRange: {
      min: Math.min(...profiles.map((p) => p.raw.sentimentRange.min)),
      max: Math.max(...profiles.map((p) => p.raw.sentimentRange.max)),
      avg: mean(profiles.map((p) => p.raw.sentimentRange.avg)),
    },
    punctuationProfile: mergePunctuationProfiles(
      profiles.map((p) => p.raw.punctuationProfile)
    ),
  };

  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    sampleCount: profiles.reduce((sum, p) => sum + p.sampleCount, 0),
    dimensions,
    patterns,
    raw,
  };
}

function emptyProfile(): StyleProfile {
  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    sampleCount: 0,
    dimensions: {
      verbosity: 0.5,
      formality: 0.5,
      structure: 0.5,
      technicality: 0.5,
      emojiUsage: 0,
      responseLength: 0.5,
    },
    patterns: {
      greetingStyle: "",
      signoffStyle: "",
      preferredFormat: "plain",
      usesHeadings: false,
      usesBulletPoints: false,
      usesNumberedLists: false,
      usesTables: false,
      averageSentenceLength: 0,
      averageMessageLength: 0,
    },
    raw: {
      avgSentenceLength: 0,
      sentenceLengthStdDev: 0,
      avgParagraphLength: 0,
      paragraphLengthStdDev: 0,
      vocabularyRichness: 0,
      avgWordLength: 0,
      contractionFrequency: 0,
      questionFrequency: 0,
      exclamationFrequency: 0,
      transitionWordFrequency: 0,
      firstPersonFrequency: 0,
      secondPersonFrequency: 0,
      passiveVoiceFrequency: 0,
      adverbFrequency: 0,
      readabilityScore: 0,
      dataReferenceDensity: 0,
      dialogueFrequency: 0,
      listUsageFrequency: 0,
      avgSectionLength: 0,
      openingStyle: "direct",
      closingStyle: "summary",
      topBigrams: [],
      topTrigrams: [],
      sentimentRange: { min: 0, max: 0, avg: 0 },
      punctuationProfile: {},
    },
  };
}
