import type { StyleProfile } from "./types.js";

export type FormatMode = "prompt" | "detailed" | "compact";

/**
 * Format a StyleProfile as human/LLM-readable text.
 *
 * - "prompt": Two-layer output for LLM system prompts (dimensions + metrics)
 * - "detailed": Full verbose output with all fields
 * - "compact": Single-paragraph summary
 */
export function formatStyleProfile(
  profile: StyleProfile,
  mode: FormatMode = "prompt"
): string {
  switch (mode) {
    case "prompt":
      return formatPrompt(profile);
    case "detailed":
      return formatDetailed(profile);
    case "compact":
      return formatCompact(profile);
  }
}

/**
 * Describe a 0-1 value on a human-readable scale between two labels.
 */
export function describeScale(
  value: number,
  lowLabel: string,
  highLabel: string
): string {
  if (value <= 0.2) return `${lowLabel} (${value.toFixed(2)})`;
  if (value <= 0.4) return `somewhat ${lowLabel} (${value.toFixed(2)})`;
  if (value <= 0.6) return `moderate (${value.toFixed(2)})`;
  if (value <= 0.8) return `somewhat ${highLabel} (${value.toFixed(2)})`;
  return `${highLabel} (${value.toFixed(2)})`;
}

// ─── Prompt mode ─────────────────────────────────────────────────────────────

function formatPrompt(profile: StyleProfile): string {
  const lines: string[] = [];
  const d = profile.dimensions;
  const p = profile.patterns;
  const r = profile.raw;

  lines.push("STYLE PROFILE:");
  lines.push(`  Verbosity: ${describeScale(d.verbosity, "terse", "verbose")}`);
  lines.push(`  Formality: ${describeScale(d.formality, "casual", "formal")}`);
  lines.push(
    `  Structure: ${describeScale(d.structure, "free-flowing", "highly structured")}`
  );
  lines.push(
    `  Technicality: ${describeScale(d.technicality, "non-technical", "very technical")}`
  );
  lines.push(
    `  Emoji usage: ${describeScale(d.emojiUsage, "never uses emoji", "frequently uses emoji")}`
  );
  lines.push(
    `  Response length: ${describeScale(d.responseLength, "very short", "very long")}`
  );

  lines.push("");
  lines.push("DETAILED METRICS:");
  lines.push(
    `  Average sentence length: ${r.avgSentenceLength.toFixed(1)} words (std dev: ${r.sentenceLengthStdDev.toFixed(1)})`
  );
  lines.push(
    `  Average paragraph length: ${r.avgParagraphLength.toFixed(1)} words (std dev: ${r.paragraphLengthStdDev.toFixed(1)})`
  );
  lines.push(
    `  Contraction frequency: ${(r.contractionFrequency * 100).toFixed(0)}% of sentences`
  );
  lines.push(
    `  Question frequency: ${(r.questionFrequency * 100).toFixed(0)}% of sentences`
  );
  lines.push(
    `  First-person usage: ${(r.firstPersonFrequency * 100).toFixed(0)}% of sentences`
  );
  lines.push(
    `  Second-person usage: ${(r.secondPersonFrequency * 100).toFixed(0)}% of sentences`
  );
  lines.push(`  Vocabulary richness: ${r.vocabularyRichness.toFixed(2)}`);
  lines.push(`  Readability (Flesch-Kincaid): ${r.readabilityScore.toFixed(1)}`);
  lines.push(`  Opening style: ${r.openingStyle}`);
  lines.push(`  Closing style: ${r.closingStyle}`);

  if (r.topBigrams.length > 0) {
    lines.push(`  Top bigrams: ${r.topBigrams.map((b) => `"${b}"`).join(", ")}`);
  }
  if (r.topTrigrams.length > 0) {
    lines.push(
      `  Top trigrams: ${r.topTrigrams.map((t) => `"${t}"`).join(", ")}`
    );
  }

  // Patterns
  if (p.greetingStyle) {
    lines.push(`  Greeting style: "${p.greetingStyle}"`);
  }
  if (p.signoffStyle) {
    lines.push(`  Sign-off style: "${p.signoffStyle}"`);
  }

  const formatPrefs: string[] = [];
  if (p.usesHeadings) formatPrefs.push("headings");
  if (p.usesBulletPoints) formatPrefs.push("bullet points");
  if (p.usesNumberedLists) formatPrefs.push("numbered lists");
  if (p.usesTables) formatPrefs.push("tables");
  if (formatPrefs.length > 0) {
    lines.push(`  Formatting preferences: uses ${formatPrefs.join(", ")}`);
  }

  return lines.join("\n");
}

// ─── Detailed mode ───────────────────────────────────────────────────────────

function formatDetailed(profile: StyleProfile): string {
  const lines: string[] = [];
  const d = profile.dimensions;
  const p = profile.patterns;
  const r = profile.raw;

  lines.push(`Style Profile v${profile.version}`);
  lines.push(`Analyzed: ${profile.analyzedAt}`);
  lines.push(`Samples: ${profile.sampleCount}`);
  lines.push("");

  lines.push("── Dimensions ──");
  lines.push(`  Verbosity:       ${d.verbosity.toFixed(2)}`);
  lines.push(`  Formality:       ${d.formality.toFixed(2)}`);
  lines.push(`  Structure:       ${d.structure.toFixed(2)}`);
  lines.push(`  Technicality:    ${d.technicality.toFixed(2)}`);
  lines.push(`  Emoji usage:     ${d.emojiUsage.toFixed(2)}`);
  lines.push(`  Response length: ${d.responseLength.toFixed(2)}`);
  lines.push("");

  lines.push("── Patterns ──");
  lines.push(`  Greeting:         ${p.greetingStyle || "(none)"}`);
  lines.push(`  Sign-off:         ${p.signoffStyle || "(none)"}`);
  lines.push(`  Preferred format: ${p.preferredFormat}`);
  lines.push(`  Uses headings:    ${p.usesHeadings}`);
  lines.push(`  Uses bullets:     ${p.usesBulletPoints}`);
  lines.push(`  Uses num. lists:  ${p.usesNumberedLists}`);
  lines.push(`  Uses tables:      ${p.usesTables}`);
  lines.push(`  Avg sentence len: ${p.averageSentenceLength} words`);
  lines.push(`  Avg message len:  ${p.averageMessageLength} words`);
  lines.push("");

  lines.push("── Raw Metrics ──");
  lines.push(`  Avg sentence length:     ${r.avgSentenceLength.toFixed(1)} (σ ${r.sentenceLengthStdDev.toFixed(1)})`);
  lines.push(`  Avg paragraph length:    ${r.avgParagraphLength.toFixed(1)} (σ ${r.paragraphLengthStdDev.toFixed(1)})`);
  lines.push(`  Vocabulary richness:     ${r.vocabularyRichness.toFixed(3)}`);
  lines.push(`  Avg word length:         ${r.avgWordLength.toFixed(1)}`);
  lines.push(`  Contraction freq:        ${(r.contractionFrequency * 100).toFixed(1)}%`);
  lines.push(`  Question freq:           ${(r.questionFrequency * 100).toFixed(1)}%`);
  lines.push(`  Exclamation freq:        ${(r.exclamationFrequency * 100).toFixed(1)}%`);
  lines.push(`  Transition word freq:    ${(r.transitionWordFrequency * 100).toFixed(1)}%`);
  lines.push(`  First-person freq:       ${(r.firstPersonFrequency * 100).toFixed(1)}%`);
  lines.push(`  Second-person freq:      ${(r.secondPersonFrequency * 100).toFixed(1)}%`);
  lines.push(`  Passive voice freq:      ${(r.passiveVoiceFrequency * 100).toFixed(1)}%`);
  lines.push(`  Adverb freq:             ${(r.adverbFrequency * 100).toFixed(1)}%`);
  lines.push(`  Readability (FK):        ${r.readabilityScore.toFixed(1)}`);
  lines.push(`  Data reference density:  ${(r.dataReferenceDensity * 100).toFixed(1)}%`);
  lines.push(`  Dialogue freq:           ${(r.dialogueFrequency * 100).toFixed(1)}%`);
  lines.push(`  List usage freq:         ${(r.listUsageFrequency * 100).toFixed(1)}%`);
  lines.push(`  Avg section length:      ${r.avgSectionLength.toFixed(1)} words`);
  lines.push(`  Opening style:           ${r.openingStyle}`);
  lines.push(`  Closing style:           ${r.closingStyle}`);
  lines.push(
    `  Sentiment range:         [${r.sentimentRange.min.toFixed(2)}, ${r.sentimentRange.max.toFixed(2)}] avg ${r.sentimentRange.avg.toFixed(2)}`
  );

  if (r.topBigrams.length > 0) {
    lines.push(`  Top bigrams:   ${r.topBigrams.join(", ")}`);
  }
  if (r.topTrigrams.length > 0) {
    lines.push(`  Top trigrams:  ${r.topTrigrams.join(", ")}`);
  }

  const punctKeys = Object.keys(r.punctuationProfile);
  if (punctKeys.length > 0) {
    const punctParts = punctKeys.map(
      (k) => `'${k}': ${r.punctuationProfile[k].toFixed(3)}`
    );
    lines.push(`  Punctuation:   { ${punctParts.join(", ")} }`);
  }

  return lines.join("\n");
}

// ─── Compact mode ────────────────────────────────────────────────────────────

function formatCompact(profile: StyleProfile): string {
  const d = profile.dimensions;
  const parts: string[] = [
    describeScale(d.verbosity, "terse", "verbose"),
    describeScale(d.formality, "casual", "formal"),
    `${profile.raw.avgSentenceLength.toFixed(0)}w/sentence`,
    `readability ${profile.raw.readabilityScore.toFixed(0)}`,
    `${profile.sampleCount} samples`,
  ];
  return parts.join(" | ");
}
