// Line breaking for text drawn on the canvas, so lyrics and subtitles never
// run off the frame. Text with spaces breaks between words; Japanese and
// Chinese, written without spaces, break between characters, keeping Latin
// words whole and never starting a line with small kana or closing punctuation.

/** Measures a string's drawn width (usually ctx.measureText(s).width with the font already set). */
export type Measure = (text: string) => number;

import { splitManualBreaks } from "@/lib/lyrics/tokenize";

const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
/** Characters that must stay with the character before them. */
const NO_LINE_START =
  /^[\u3001\u3002\uFF0C\uFF0E\u30FB\uFF1A\uFF1B\uFF1F\uFF01\u30FC\uFF5E\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6\u300D\u300F\uFF09\u3011\u3009\u300B\u2026!?,.)\]}]/;

/**
 * Pieces a line may break between. Spaced text gives words; unspaced CJK text
 * gives single characters (with punctuation and small kana attached), while
 * runs of Latin letters or digits stay whole.
 */
export function breakUnits(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/\s/.test(trimmed) || !CJK.test(trimmed)) return trimmed.split(/\s+/);
  const units: string[] = [];
  for (const piece of trimmed.match(/[A-Za-z0-9'’]+|./gu) ?? []) {
    if (units.length > 0 && NO_LINE_START.test(piece)) units[units.length - 1] += piece;
    else units.push(piece);
  }
  return units;
}

/** Splits a word that is wider than the line by itself into pieces that fit. */
function splitLongUnit(unit: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of Array.from(unit)) {
    if (cur && measure(cur + ch) > maxWidth) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** The parts of a text between manual line breaks ("/n" typed, "\n" in cleanText); each one starts a new row. */
export const manualRows = splitManualBreaks;

/**
 * Breaks text into lines no wider than maxWidth, filling each line greedily
 * and starting a new line at every manual break. A piece that does not fit
 * even alone is cut between characters; use fitScale first to shrink the
 * type so that only happens as a last resort.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  return manualRows(text).flatMap((part) => wrapRow(part, maxWidth, measure));
}

function wrapRow(text: string, maxWidth: number, measure: Measure): string[] {
  const units = breakUnits(text);
  if (units.length === 0) return [];
  const joiner = isSpaced(text) ? " " : "";
  const lines: string[] = [];
  let cur = "";
  for (const unit of units) {
    const next = cur ? cur + joiner + unit : unit;
    if (!cur || measure(next) <= maxWidth) {
      cur = next;
      continue;
    }
    lines.push(cur);
    cur = unit;
  }
  if (cur) lines.push(cur);
  return lines.flatMap((l) => (measure(l) > maxWidth ? splitLongUnit(l, maxWidth, measure) : [l]));
}

/** Text whose pieces are joined by spaces (anything but unspaced Japanese or Chinese); manual breaks do not count as spaces. */
export const isSpaced = (text: string): boolean =>
  manualRows(text).some((row) => /\s/.test(row) || !CJK.test(row));

/** Smallest the type may shrink to keep words whole, as a share of its size. */
export const MIN_FIT_SCALE = 0.5;

/**
 * How much to shrink the type (1 = not at all, never below minScale) so the
 * widest piece the text may not be broken inside fits maxWidth: a word, or in
 * Japanese written with spaces, a whole phrase between spaces. Measure at the
 * unshrunk size.
 */
export function fitScale(text: string, maxWidth: number, measure: Measure, minScale = MIN_FIT_SCALE): number {
  const widest = Math.max(0, ...manualRows(text).flatMap(breakUnits).map(measure));
  if (widest <= maxWidth || widest === 0) return 1;
  return Math.max(minScale, maxWidth / widest);
}

/**
 * Widest text that can be centered on x and stay inside the frame with the
 * given margin on each side.
 */
export function widthAround(centerX: number, W: number, margin: number): number {
  return Math.max(0, 2 * Math.min(centerX - margin, W - margin - centerX));
}
