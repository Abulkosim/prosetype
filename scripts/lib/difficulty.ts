/**
 * Difficulty scoring per plan §6.4. Pure functions only.
 *
 *   raw = 2.0 * avgWordLength
 *       + 2.5 * punctuationCharsPer100Chars
 *       + 0.4 * percentWordsOfLength8Plus
 *       + 0.2 * avgSentenceLengthInWords
 *   difficulty = clamp(raw, 0, 100)
 *
 * Bands: warmup < 30 ≤ standard < 45 ≤ hard < 60 ≤ brutal.
 */

export const BANDS = ['warmup', 'standard', 'hard', 'brutal'] as const;
export type Band = (typeof BANDS)[number];

/** Punctuation characters of the §6.2 canonical set. */
const PUNCTUATION_RE = /[.,;:!?'"()-]/g;

export interface DifficultyBreakdown {
  avgWordLength: number;
  punctuationPer100Chars: number;
  percentWordsLength8Plus: number;
  avgSentenceLengthWords: number;
  /** clamp(raw, 0, 100), rounded to 2 decimals (numeric(5,2) in Postgres). */
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute the difficulty breakdown for normalized (§6.2-canonical) text.
 * Word length counts letters/digits only — punctuation weight is already
 * carried by the punctuation term. Sentence count = number of `.!?` runs
 * (minimum 1).
 */
export function computeDifficulty(text: string): DifficultyBreakdown {
  if (text.length === 0) throw new Error('computeDifficulty requires non-empty text');

  const words = text.split(' ');
  const wordCount = words.length;
  const letterLengths = words.map((word) => word.replace(/[^A-Za-z0-9]/g, '').length);

  const avgWordLength = letterLengths.reduce((a, b) => a + b, 0) / wordCount;
  const punctuationCount = (text.match(PUNCTUATION_RE) ?? []).length;
  const punctuationPer100Chars = (punctuationCount / text.length) * 100;
  const longWordCount = letterLengths.filter((n) => n >= 8).length;
  const percentWordsLength8Plus = (longWordCount / wordCount) * 100;
  const sentenceCount = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const avgSentenceLengthWords = wordCount / sentenceCount;

  const raw =
    2.0 * avgWordLength +
    2.5 * punctuationPer100Chars +
    0.4 * percentWordsLength8Plus +
    0.2 * avgSentenceLengthWords;

  return {
    avgWordLength,
    punctuationPer100Chars,
    percentWordsLength8Plus,
    avgSentenceLengthWords,
    score: round2(clamp(raw, 0, 100)),
  };
}

/** Band thresholds per §6.4: warmup < 30 ≤ standard < 45 ≤ hard < 60 ≤ brutal. */
export function bandForScore(score: number): Band {
  if (score < 30) return 'warmup';
  if (score < 45) return 'standard';
  if (score < 60) return 'hard';
  return 'brutal';
}

/** Apply a curator `band_override` from the YAML when present. */
export function resolveBand(score: number, override?: Band): Band {
  return override ?? bandForScore(score);
}
