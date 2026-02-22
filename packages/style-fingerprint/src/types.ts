// ─── StyleProfile: Unified style analysis result ─────────────────────────────

export interface StyleProfile {
  version: 1;
  analyzedAt: string;
  sampleCount: number;
  dimensions: StyleDimensions;
  patterns: StylePatterns;
  raw: RawStyleMetrics;
}

// ─── Normalized 0-1 dimensions (from Prism) ──────────────────────────────────

export interface StyleDimensions {
  verbosity: number;
  formality: number;
  structure: number;
  technicality: number;
  emojiUsage: number;
  responseLength: number;
}

// ─── Qualitative patterns ────────────────────────────────────────────────────

export interface StylePatterns {
  greetingStyle: string;
  signoffStyle: string;
  preferredFormat: string;
  usesHeadings: boolean;
  usesBulletPoints: boolean;
  usesNumberedLists: boolean;
  usesTables: boolean;
  averageSentenceLength: number;
  averageMessageLength: number;
}

// ─── Detailed raw metrics (from auto_blogger) ────────────────────────────────

export interface RawStyleMetrics {
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
  dataReferenceDensity: number;
  dialogueFrequency: number;
  listUsageFrequency: number;
  avgSectionLength: number;
  openingStyle: string;
  closingStyle: string;
  topBigrams: string[];
  topTrigrams: string[];
  sentimentRange: { min: number; max: number; avg: number };
  punctuationProfile: Record<string, number>;
}

// ─── Per-text intermediate metrics ───────────────────────────────────────────

export interface TextMetrics {
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

// ─── Per-message analysis for dimensions ─────────────────────────────────────

export interface MessageAnalysis {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  emojiCount: number;
  emojiFrequency: number;
  hasBullets: boolean;
  hasHeadings: boolean;
  hasNumberedLists: boolean;
  hasTables: boolean;
  greeting: string | null;
  signoff: string | null;
  formalWords: number;
  informalWords: number;
  technicalWords: number;
  contractionCount: number;
}

// ─── Legacy compat type ──────────────────────────────────────────────────────

export interface StyleFingerprint {
  channelId: string;
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
  dataReferenceDensity: number;
  dialogueFrequency: number;
  listUsageFrequency: number;
  avgSectionLength: number;
  openingStyle: string;
  closingStyle: string;
  topBigrams: string[];
  topTrigrams: string[];
  sentimentRange: { min: number; max: number; avg: number };
  punctuationProfile: Record<string, number>;
}
