import type { MessageAnalysis, StyleDimensions } from "../types.js";
import { mean, clamp } from "./helpers.js";

/**
 * Compute normalized 0-1 style dimensions from per-message analyses.
 * Ported from Prism's analyzer.ts dimension scoring logic.
 */
export function computeDimensions(analyses: MessageAnalysis[]): StyleDimensions {
  if (analyses.length === 0) {
    return {
      verbosity: 0.5,
      formality: 0.5,
      structure: 0.5,
      technicality: 0.5,
      emojiUsage: 0,
      responseLength: 0.5,
    };
  }

  const avgMessageLength = mean(analyses.map((a) => a.wordCount));
  const emojiFrequency = mean(analyses.map((a) => a.emojiFrequency));
  const bulletFrequency = mean(analyses.map((a) => (a.hasBullets ? 1 : 0)));
  const headingFrequency = mean(analyses.map((a) => (a.hasHeadings ? 1 : 0)));
  const numberedListFrequency = mean(
    analyses.map((a) => (a.hasNumberedLists ? 1 : 0))
  );
  const tableFrequency = mean(analyses.map((a) => (a.hasTables ? 1 : 0)));

  const verbosity = clamp(avgMessageLength / 500);
  const formality = computeFormality(analyses);
  const structure = clamp(
    bulletFrequency * 0.3 +
      headingFrequency * 0.3 +
      numberedListFrequency * 0.2 +
      tableFrequency * 0.2
  );
  const technicality = computeTechnicality(analyses);
  const emojiUsage = clamp(emojiFrequency * 10);
  const responseLength = clamp(avgMessageLength / 300);

  return { verbosity, formality, structure, technicality, emojiUsage, responseLength };
}

function computeFormality(analyses: MessageAnalysis[]): number {
  if (analyses.length === 0) return 0.5;

  const scores = analyses.map((a) => {
    const wordCount = Math.max(a.wordCount, 1);
    const formalRatio = a.formalWords / wordCount;
    const informalRatio = a.informalWords / wordCount;
    const contractionPenalty =
      Math.min(a.contractionCount / wordCount, 0.1) * 5;

    let score = 0.5;
    score += formalRatio * 3;
    score -= informalRatio * 3;
    score -= contractionPenalty;

    if (a.greeting) {
      if (/^dear\b/i.test(a.greeting)) score += 0.15;
      else if (/^hey\b/i.test(a.greeting)) score -= 0.15;
      else if (/^hi\b/i.test(a.greeting)) score -= 0.05;
    }

    return clamp(score);
  });

  return mean(scores);
}

function computeTechnicality(analyses: MessageAnalysis[]): number {
  if (analyses.length === 0) return 0.5;

  const scores = analyses.map((a) => {
    const wordCount = Math.max(a.wordCount, 1);
    const techRatio = a.technicalWords / wordCount;
    return clamp(techRatio * 15);
  });

  return mean(scores);
}
