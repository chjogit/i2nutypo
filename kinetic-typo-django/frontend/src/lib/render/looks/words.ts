import type { LyricLine } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { isSpaced, wrapText } from "../wrap";

export interface PlacedWord {
  text: string;
  /** Seconds since the word started; negative while still waiting. */
  e: number;
  accent: boolean;
  index: number;
  w: number;
  /** A character of the same word as the item before it: no space between them. */
  joined?: boolean;
}

/**
 * Breaks a line's words into rows no wider than maxW at the font the caller
 * set on ctx, starting a new row at each manual break. Spaced text keeps a
 * space between words; unspaced Japanese sits flush. Shrink the type with
 * fitScale first: a word still wider than a row is cut between characters
 * only as a last resort. Returns the rows and the widest row's width.
 */
export function wrapWords(
  ctx: Ctx2D,
  line: LyricLine,
  lineElapsed: number,
  maxW: number,
): { rows: PlacedWord[][]; gap: number; widest: number } {
  const spaced = isSpaced(line.cleanText);
  const gap = spaced ? ctx.measureText(" ").width : 0;
  const rows: PlacedWord[][] = [[]];
  let rowW = 0;
  const measure = (t: string) => ctx.measureText(t).width;
  line.words.forEach((word, index) => {
    const whole = measure(word.text);
    if (word.chars && whole <= maxW) {
      // Timed character by character: each character is its own item, kept on one row
      const row = rows[rows.length - 1];
      if (row.length > 0 && (word.breakBefore || rowW + gap + whole > maxW)) {
        rows.push([]);
        rowW = 0;
      }
      const cur = rows[rows.length - 1];
      rowW += (cur.length > 0 ? gap : 0) + whole;
      Array.from(word.text).forEach((text, k) => {
        const e = lineElapsed - (word.chars?.[k] ?? word.startOffset);
        cur.push({ text, e, accent: word.isAccent, index, w: measure(text), joined: k > 0 });
      });
      return;
    }
    // Last resort for a word wider than a row even after fitScale
    const pieces = measure(word.text) > maxW ? wrapText(word.text, maxW, measure) : [word.text];
    pieces.forEach((text, k) => {
      const w = measure(text);
      const row = rows[rows.length - 1];
      if (row.length > 0 && (k > 0 || (k === 0 && word.breakBefore) || rowW + gap + w > maxW)) {
        rows.push([]);
        rowW = 0;
      }
      const cur = rows[rows.length - 1];
      rowW += (cur.length > 0 ? gap : 0) + w;
      cur.push({ text, e: lineElapsed - word.startOffset, accent: word.isAccent, index, w });
    });
  });
  const widest = Math.max(...rows.map((r) => rowWidth(r, gap)));
  return { rows, gap, widest };
}

export const rowWidth = (row: readonly PlacedWord[], gap: number): number =>
  row.reduce((acc, it, i) => acc + it.w + (i > 0 && !it.joined ? gap : 0), 0);

/** Space to leave after an item in its row: the word gap, or none before the next character of the same word. */
export const gapAfter = (row: readonly PlacedWord[], it: PlacedWord, gap: number): number =>
  row[row.indexOf(it) + 1]?.joined ? 0 : gap;

/**
 * Splits the first `count` characters of a text across the rows wrapText made
 * of it, for text that types out. Spaced text lost one space at each break.
 */
export function revealRows(rows: readonly string[], count: number, spaced: boolean): string[] {
  let left = count;
  return rows.map((row) => {
    const chars = Array.from(row);
    const shown = chars.slice(0, Math.max(0, left)).join("");
    left -= chars.length + (spaced ? 1 : 0);
    return shown;
  });
}
