import type { LyricLine } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { breakUnits, isSpaced } from "../wrap";

export interface Glyph {
  ch: string;
  /** Seconds since the glyph's word started; negative while still waiting. */
  wElapsed: number;
  isAccent: boolean;
  wordIndex: number;
}

/**
 * Splits a line into characters carrying their word's timing. Spaces are kept
 * for spaced languages, and a manual break ("/n") becomes a "\n" glyph that
 * layouts start a new row or column at and never draw.
 */
export function lineGlyphs(line: LyricLine, lineElapsed: number): Glyph[] {
  const spaced = isSpaced(line.cleanText);
  const out: Glyph[] = [];
  line.words.forEach((w, wordIndex) => {
    const wElapsed = lineElapsed - w.startOffset;
    if (wordIndex > 0 && w.breakBefore) out.push({ ch: "\n", wElapsed, isAccent: false, wordIndex });
    else if (spaced && wordIndex > 0) out.push({ ch: " ", wElapsed, isAccent: false, wordIndex });
    for (const ch of Array.from(w.text)) out.push({ ch, wElapsed, isAccent: w.isAccent, wordIndex });
  });
  return out;
}

/** Elapsed time of the newest word that has started, or -1 before the first. */
export function newestWordElapsed(line: LyricLine, lineElapsed: number): number {
  let best = -1;
  for (const w of line.words) {
    const e = lineElapsed - w.startOffset;
    if (e >= 0 && (best < 0 || e < best)) best = e;
  }
  return best;
}

const UPRIGHT = /[　-ヿ㐀-鿿가-힯ᄀ-ᇿ㄰-㆏＀-￯]/;
const CORNER_PUNCT = /[、。，．,.]/;

const isSideways = (ch: string): boolean => !UPRIGHT.test(ch) || ch === "ー" || ch === "〜" || ch === "~";

/**
 * Vertical (tategaki) column. CJK and Hangul stay upright; a run of Latin
 * letters in one word turns 90° as a single piece, and commas sit in the upper
 * right of their cell. paint draws one glyph (or Latin run) centered at the
 * origin. Returns the column height.
 */
export function drawVerticalColumn(
  ctx: Ctx2D,
  glyphs: readonly Glyph[],
  x: number,
  yTop: number,
  size: number,
  paint: (g: Glyph, cx: number, cy: number) => void,
): number {
  let y = yTop;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    if (g.ch === " ") {
      y += size * 0.5;
      continue;
    }
    ctx.save();
    if (CORNER_PUNCT.test(g.ch)) {
      ctx.translate(x + size * 0.55, y + size / 2 - size * 0.55);
      paint(g, 0, 0);
      y += size * 1.04;
    } else if (isSideways(g.ch)) {
      let run = g.ch;
      while (
        i + 1 < glyphs.length &&
        glyphs[i + 1].wordIndex === g.wordIndex &&
        glyphs[i + 1].ch !== " " &&
        !CORNER_PUNCT.test(glyphs[i + 1].ch) &&
        isSideways(glyphs[i + 1].ch)
      ) {
        run += glyphs[++i].ch;
      }
      const len = Math.max(size, ctx.measureText(run).width);
      ctx.translate(x, y + len / 2);
      ctx.rotate(Math.PI / 2);
      paint({ ...g, ch: run }, 0, 0);
      y += len + size * 0.12;
    } else {
      ctx.translate(x, y + size / 2);
      paint(g, 0, 0);
      y += size * 1.04;
    }
    ctx.restore();
  }
  return y - yTop;
}

/** Splits glyphs into vertical columns that fit maxHeight, never breaking a Latin run. */
export function splitColumns(glyphs: readonly Glyph[], size: number, maxHeight: number): Glyph[][] {
  const cell = size * 1.04;
  const cols: Glyph[][] = [];
  let cur: Glyph[] = [];
  let used = 0;
  for (let i = 0; i < glyphs.length;) {
    if (glyphs[i].ch === "\n") {
      // Manual break: the next glyph starts a new column
      if (cur.length) cols.push(cur);
      cur = [];
      used = 0;
      i++;
      continue;
    }
    // A unit is one upright glyph, or a whole sideways Latin run of one word
    let j = i + 1;
    if (isSideways(glyphs[i].ch) && glyphs[i].ch !== " ") {
      while (
        j < glyphs.length &&
        glyphs[j].wordIndex === glyphs[i].wordIndex &&
        isSideways(glyphs[j].ch) &&
        glyphs[j].ch !== " "
      )
        j++;
    }
    const unit = glyphs.slice(i, j);
    const cost =
      unit[0].ch === " " ? size * 0.5 : unit.length > 1 ? unit.length * size * 0.62 + size * 0.12 : cell;
    if (cur.length > 0 && used + cost > maxHeight) {
      cols.push(cur);
      cur = [];
      used = 0;
    }
    if (!(cur.length === 0 && unit[0].ch === " ")) {
      cur.push(...unit);
      used += cost;
    }
    i = j;
  }
  if (cur.length) cols.push(cur);
  return cols;
}

/** Advance of each glyph with extra tracking, using the current ctx.font. */
export function trackedWidths(ctx: Ctx2D, glyphs: readonly Glyph[], tracking: number): number[] {
  return glyphs.map((g) => ctx.measureText(g.ch).width + tracking);
}

/** Glyph indices of each piece a line may break between (see breakUnits); spaces belong to no piece. */
function glyphUnits(glyphs: readonly Glyph[], from: number, to: number): number[][] {
  const units: number[][] = [];
  let i = from;
  const text = glyphs
    .slice(from, to)
    .map((g) => g.ch)
    .join("");
  for (const unit of breakUnits(text)) {
    while (i < to && /\s/.test(glyphs[i].ch)) i++;
    const idx: number[] = [];
    for (let k = Array.from(unit).length; k > 0 && i < to; k--) idx.push(i++);
    if (idx.length) units.push(idx);
  }
  return units;
}

/**
 * Breaks a line of glyphs into rows no wider than maxW, at the same places as
 * wrapText: between words (or space-separated phrases), or between characters
 * for unspaced Japanese, and always at a manual break. Each row is the glyph
 * indices it holds, spaces between its words included. A piece wider than
 * maxW gets a row of its own; callers shrink the type when that happens.
 */
export function wrapGlyphRows(glyphs: readonly Glyph[], widths: readonly number[], maxW: number): number[][] {
  const rows: number[][] = [];
  let from = 0;
  glyphs.forEach((g, i) => {
    if (g.ch !== "\n") return;
    rows.push(...wrapSegment(glyphs, widths, maxW, from, i));
    from = i + 1;
  });
  rows.push(...wrapSegment(glyphs, widths, maxW, from, glyphs.length));
  return rows;
}

/** wrapGlyphRows for glyphs [from, to), which hold no manual break. */
function wrapSegment(
  glyphs: readonly Glyph[],
  widths: readonly number[],
  maxW: number,
  from: number,
  to: number,
): number[][] {
  const rows: number[][] = [];
  let start = -1;
  let end = -1;
  const span = (a: number, b: number) => {
    let w = 0;
    for (let k = a; k <= b; k++) w += widths[k];
    return w;
  };
  const push = () => {
    if (start >= 0) rows.push(Array.from({ length: end - start + 1 }, (_, k) => start + k));
  };
  for (const unit of glyphUnits(glyphs, from, to)) {
    const a = unit[0];
    const b = unit[unit.length - 1];
    if (start >= 0 && span(start, b) > maxW) {
      push();
      start = a;
    } else if (start < 0) {
      start = a;
    }
    end = b;
  }
  push();
  return rows;
}

/** Width of a row from wrapGlyphRows, without the trailing tracking. */
export function rowSpan(row: readonly number[], widths: readonly number[], tracking: number): number {
  return row.reduce((w, k) => w + widths[k], 0) - tracking;
}

/**
 * Sets a line of tracked glyphs into at most maxRows rows no wider than maxW,
 * shrinking the type until it fits. setFont applies a size to ctx.font.
 */
export function fitGlyphRows(
  ctx: Ctx2D,
  glyphs: readonly Glyph[],
  size: number,
  setFont: (size: number) => void,
  trackingRatio: number,
  maxW: number,
  maxRows = 3,
): { size: number; tracking: number; widths: number[]; rows: number[][]; rowWidths: number[] } {
  let out = { size, tracking: 0, widths: [] as number[], rows: [] as number[][], rowWidths: [] as number[] };
  for (let i = 0; i < 10; i++) {
    setFont(size);
    const tracking = size * trackingRatio;
    const widths = trackedWidths(ctx, glyphs, tracking);
    // The last glyph of a row carries no tracking, so allow for it
    const rows = wrapGlyphRows(glyphs, widths, maxW + tracking);
    const rowWidths = rows.map((r) => rowSpan(r, widths, tracking));
    out = { size, tracking, widths, rows, rowWidths };
    if (rows.length <= maxRows && Math.max(0, ...rowWidths) <= maxW) break;
    size *= 0.87;
  }
  return out;
}
