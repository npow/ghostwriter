export function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  const variance =
    arr.reduce((sum, val) => sum + (val - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function countSyllables(text: string): number {
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

export function computeFleschKincaid(
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

export function extractTopNgrams(
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

export function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export function extractSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function countMatches(words: string[], dictionary: Set<string>): number {
  let count = 0;
  for (const word of words) {
    if (dictionary.has(word)) count++;
  }
  return count;
}

export function mergePunctuationProfiles(
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
