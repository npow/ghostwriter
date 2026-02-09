/**
 * Anti-slop blacklist: AI-typical phrases that should never appear in output.
 * Used by the draft stage prompt and the AI Detection review agent.
 */
export const AI_PHRASE_BLACKLIST = [
  "delve into",
  "delve deeper",
  "it's important to note",
  "it is important to note",
  "it's worth noting",
  "it is worth noting",
  "navigate the landscape",
  "navigating the landscape",
  "in the realm of",
  "in today's rapidly",
  "in today's fast-paced",
  "in an era of",
  "in the ever-evolving",
  "ever-changing landscape",
  "a testament to",
  "stands as a testament",
  "it's crucial to",
  "it is crucial to",
  "let's dive in",
  "without further ado",
  "buckle up",
  "game-changer",
  "game changer",
  "paradigm shift",
  "synergy",
  "leverage",
  "robust",
  "holistic approach",
  "cutting-edge",
  "bleeding-edge",
  "at the end of the day",
  "the bottom line is",
  "when it comes to",
  "in terms of",
  "it goes without saying",
  "needless to say",
  "as we all know",
  "revolutionize",
  "transformative",
  "empower",
  "unlock the potential",
  "unlock the power",
  "harness the power",
  "in conclusion",
  "to summarize",
  "in summary",
  "overall",
  "furthermore",
  "moreover",
  "consequently",
  "subsequently",
  "nevertheless",
  "nonetheless",
  "in light of",
  "with that being said",
  "that being said",
  "having said that",
  "it's no secret that",
  "it is no secret that",
  "the landscape of",
  "a myriad of",
  "plethora of",
  "multifaceted",
  "nuanced",
  "comprehensive guide",
  "deep dive",
  "unpack",
  "unravel",
  "shed light on",
  "pave the way",
  "spearhead",
  "foster",
  "facilitate",
  "endeavor",
  "embark on",
  "embark upon",
  "realm",
  "tapestry",
  "vibrant tapestry",
  "rich tapestry",
  "intricate dance",
  "symphony of",
  "beacon of",
  "cornerstone of",
  "pivotal role",
  "plays a crucial role",
  "plays a pivotal role",
];

/**
 * Check content for blacklisted AI phrases.
 * Returns an array of found violations.
 */
export function detectAiPhrases(content: string): string[] {
  const lower = content.toLowerCase();
  return AI_PHRASE_BLACKLIST.filter((phrase) => lower.includes(phrase));
}

/**
 * Compute basic burstiness metrics for text.
 * High burstiness (variation in sentence length) is more human-like.
 */
export function computeBurstiness(text: string): {
  avgSentenceLength: number;
  stdDev: number;
  burstinessScore: number;
} {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return { avgSentenceLength: 0, stdDev: 0, burstinessScore: 0 };
  }

  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, len) => sum + (len - avg) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Burstiness: coefficient of variation. Higher = more human-like.
  // Typical AI: 0.3-0.5, Typical human: 0.6-1.2
  const burstinessScore = avg > 0 ? stdDev / avg : 0;

  return { avgSentenceLength: avg, stdDev, burstinessScore };
}

/**
 * Analyze paragraph length variation.
 * Uniform paragraph lengths are a strong AI signal.
 */
export function analyzeParagraphVariation(text: string): {
  avgParagraphWords: number;
  stdDev: number;
  variationScore: number;
} {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) {
    return { avgParagraphWords: 0, stdDev: 0, variationScore: 0 };
  }

  const lengths = paragraphs.map((p) => p.split(/\s+/).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, len) => sum + (len - avg) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  return {
    avgParagraphWords: avg,
    stdDev,
    variationScore: avg > 0 ? stdDev / avg : 0,
  };
}
