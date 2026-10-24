import type { LyricLine } from "@/types/project";
import { sanitizeTiming } from "./line-options";

/** What the detail timeline moves: whole words, or each character. */
export type TimingUnit = "word" | "char";

/** Characters of a word, as the detail timeline counts them. */
const charsOf = (text: string): string[] => Array.from(text);

/** The unit a line is timed in now: characters once any word has its own character times. */
export const timingUnit = (line: LyricLine): TimingUnit =>
  line.words.some((w) => w.chars) ? "char" : "word";

/** One label per mark: each word, or each character. */
export function timingLabels(line: LyricLine, unit: TimingUnit): string[] {
  return unit === "word" ? line.words.map((w) => w.text) : line.words.flatMap((w) => charsOf(w.text));
}

/** Index of the first mark of each word, for drawing word borders between character marks. */
export function wordStarts(line: LyricLine, unit: TimingUnit): number[] {
  if (unit === "word") return line.words.map((_, i) => i);
  let at = 0;
  return line.words.map((w) => {
    const start = at;
    at += charsOf(w.text).length;
    return start;
  });
}

/**
 * The line's marks as shares of its length in the given unit. A word turned
 * into characters spreads them over the word's own time; characters turned
 * into words keep each word's first character.
 */
export function currentTiming(line: LyricLine, unit: TimingUnit): number[] {
  const span = Math.max(0.01, line.endTime - line.startTime);
  const share = (sec: number) => Math.min(1, Math.max(0, sec / span));
  if (unit === "word") return line.words.map((w) => share(w.startOffset));
  return line.words.flatMap((w) => {
    const n = charsOf(w.text).length;
    if (w.chars && w.chars.length === n) return w.chars.map(share);
    const step = (w.endOffset - w.startOffset) / Math.max(1, n);
    return Array.from({ length: n }, (_, k) => share(w.startOffset + step * k));
  });
}

/** Mark i moved to share v, kept between its neighbors so the order never changes. */
export function moveMark(timing: readonly number[], i: number, v: number): number[] {
  const lo = i > 0 ? timing[i - 1] : 0;
  const hi = i + 1 < timing.length ? timing[i + 1] : 1;
  const out = [...timing];
  out[i] = Math.min(hi, Math.max(lo, v));
  return out;
}

/**
 * Mark i set to share v by tapping along with the song: the marks after it
 * that would now come before it are pushed along with it.
 */
export function stampMark(timing: readonly number[], i: number, v: number): number[] {
  const out = [...timing];
  out[i] = Math.min(1, Math.max(i > 0 ? out[i - 1] : 0, v));
  for (let k = i + 1; k < out.length; k++) out[k] = Math.max(out[k], out[i]);
  return sanitizeTiming(out) ?? out;
}
