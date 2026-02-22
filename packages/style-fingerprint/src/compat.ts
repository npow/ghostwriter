import type { StyleFingerprint, StyleProfile } from "./types.js";
import { analyzeStyle } from "./analyze.js";

/**
 * Convert a StyleProfile to the legacy StyleFingerprint format.
 * Used by content-pipeline's draft stage which expects StyleFingerprint.
 */
export function toStyleFingerprint(
  profile: StyleProfile,
  channelId: string
): StyleFingerprint {
  return {
    channelId,
    avgSentenceLength: profile.raw.avgSentenceLength,
    sentenceLengthStdDev: profile.raw.sentenceLengthStdDev,
    avgParagraphLength: profile.raw.avgParagraphLength,
    paragraphLengthStdDev: profile.raw.paragraphLengthStdDev,
    vocabularyRichness: profile.raw.vocabularyRichness,
    avgWordLength: profile.raw.avgWordLength,
    contractionFrequency: profile.raw.contractionFrequency,
    questionFrequency: profile.raw.questionFrequency,
    exclamationFrequency: profile.raw.exclamationFrequency,
    transitionWordFrequency: profile.raw.transitionWordFrequency,
    firstPersonFrequency: profile.raw.firstPersonFrequency,
    secondPersonFrequency: profile.raw.secondPersonFrequency,
    passiveVoiceFrequency: profile.raw.passiveVoiceFrequency,
    adverbFrequency: profile.raw.adverbFrequency,
    readabilityScore: profile.raw.readabilityScore,
    dataReferenceDensity: profile.raw.dataReferenceDensity,
    dialogueFrequency: profile.raw.dialogueFrequency,
    listUsageFrequency: profile.raw.listUsageFrequency,
    avgSectionLength: profile.raw.avgSectionLength,
    openingStyle: profile.raw.openingStyle,
    closingStyle: profile.raw.closingStyle,
    topBigrams: profile.raw.topBigrams,
    topTrigrams: profile.raw.topTrigrams,
    sentimentRange: { ...profile.raw.sentimentRange },
    punctuationProfile: { ...profile.raw.punctuationProfile },
  };
}

/**
 * Convert a legacy StyleFingerprint to a StyleProfile.
 * Dimensions are approximated from the raw metrics since the original
 * fingerprint doesn't include dimension data.
 */
export function fromStyleFingerprint(fp: StyleFingerprint): StyleProfile {
  // Approximate dimensions from raw metrics
  const avgWords =
    fp.avgParagraphLength *
    (fp.avgSectionLength > 0
      ? fp.avgSectionLength / fp.avgParagraphLength
      : 3);

  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    sampleCount: 0, // Unknown from legacy format
    dimensions: {
      verbosity: clamp01(avgWords / 500),
      formality: clamp01(
        0.5 + (fp.passiveVoiceFrequency > 0.1 ? 0.15 : 0) - fp.contractionFrequency * 0.3
      ),
      structure: clamp01(fp.listUsageFrequency * 0.5),
      technicality: 0.5, // Cannot determine from raw metrics alone
      emojiUsage: 0,
      responseLength: clamp01(avgWords / 300),
    },
    patterns: {
      greetingStyle: "",
      signoffStyle: "",
      preferredFormat: "markdown",
      usesHeadings: fp.avgSectionLength > 0,
      usesBulletPoints: fp.listUsageFrequency > 0.3,
      usesNumberedLists: false,
      usesTables: false,
      averageSentenceLength: Math.round(fp.avgSentenceLength),
      averageMessageLength: Math.round(avgWords),
    },
    raw: {
      avgSentenceLength: fp.avgSentenceLength,
      sentenceLengthStdDev: fp.sentenceLengthStdDev,
      avgParagraphLength: fp.avgParagraphLength,
      paragraphLengthStdDev: fp.paragraphLengthStdDev,
      vocabularyRichness: fp.vocabularyRichness,
      avgWordLength: fp.avgWordLength,
      contractionFrequency: fp.contractionFrequency,
      questionFrequency: fp.questionFrequency,
      exclamationFrequency: fp.exclamationFrequency,
      transitionWordFrequency: fp.transitionWordFrequency,
      firstPersonFrequency: fp.firstPersonFrequency,
      secondPersonFrequency: fp.secondPersonFrequency,
      passiveVoiceFrequency: fp.passiveVoiceFrequency,
      adverbFrequency: fp.adverbFrequency,
      readabilityScore: fp.readabilityScore,
      dataReferenceDensity: fp.dataReferenceDensity,
      dialogueFrequency: fp.dialogueFrequency,
      listUsageFrequency: fp.listUsageFrequency,
      avgSectionLength: fp.avgSectionLength,
      openingStyle: fp.openingStyle,
      closingStyle: fp.closingStyle,
      topBigrams: [...fp.topBigrams],
      topTrigrams: [...fp.topTrigrams],
      sentimentRange: { ...fp.sentimentRange },
      punctuationProfile: { ...fp.punctuationProfile },
    },
  };
}

/**
 * @deprecated Use `analyzeStyle` from `@auto-blogger/style-fingerprint` instead.
 * Backwards-compatible shim that produces a legacy StyleFingerprint.
 */
export function analyzeStyleFingerprint(
  channelId: string,
  exampleTexts: string[]
): StyleFingerprint {
  const profile = analyzeStyle(exampleTexts);
  return toStyleFingerprint(profile, channelId);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
