import type { LyricLine } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { parseColor, readableOn } from "../kinetic/color";
import { boxHeight, fitWidth, minSide, type LookFrame } from "./frame";
import { drawImageRect, type Rect } from "./illustration";
import { backgroundSource } from "./frame";
import { clamp01, withAlpha } from "./noise";
import { gapAfter, rowWidth, wrapWords, type PlacedWord } from "./words";

// Shared parts of the "screen life" themes (chat, feed, desktop): the lyrics
// are drawn as pieces of an app on a screen rather than as free type, so these
// themes always draw their own lyrics (see SCREEN_THEMES in render-look.ts).

/** Themes whose lyrics are app UI: no motion style, line motion or lyric surface is laid over them. */
export const SCREEN_THEMES: ReadonlySet<string> = new Set(["chat_room", "social_feed", "desktop_screen"]);

/** Rounded rectangle path (clamped radius). */
export function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** "m:ss" of a song time. */
export function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A text color that reads on a fill given as "#rrggbb". */
export function textOn(fill: string, target = 4.5): string {
  const c = parseColor(fill);
  if (!c) return "#111111";
  const t = readableOn(c, target);
  const hex = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  // Hex, so withAlpha can make see-through shades of it
  return `#${hex(t.r)}${hex(t.g)}${hex(t.b)}`;
}

/** Overshooting pop 0 → 1 over `dur` seconds (a spring-like back ease). */
export function popAt(elapsed: number, dur = 0.32): number {
  const x = clamp01(elapsed / dur);
  const c1 = 1.9;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Smooth 0 → 1 (cubic out). */
export const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);

/** The picture or a vertical two-color gradient over `r`, optionally blurred. */
export function drawWallpaper(f: LookFrame, r: Rect, top: string, bottom: string, blurPx = 0): void {
  const { ctx } = f;
  const img = f.images.background;
  const src = img ? backgroundSource(f, r) : null;
  if (img && src) {
    ctx.save();
    if (blurPx > 0) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    drawImageRect(ctx, img, src, r);
    ctx.restore();
    return;
  }
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** The app column: the whole frame when upright, a phone-wide column in the middle when wide. */
export function screenColumn(f: LookFrame, wideShare = 0.62): Rect {
  const { W, H } = f;
  if (H >= W * 1.05) return { x: 0, y: 0, w: W, h: H };
  const w = Math.min(W * 0.9, H * wideShare);
  return { x: (W - w) / 2, y: 0, w, h: H };
}

export interface LaidText {
  rows: PlacedWord[][];
  gap: number;
  size: number;
  widest: number;
  rowH: number;
}

/**
 * The line's words wrapped into rows no wider than maxW at a size that keeps
 * it within maxRows rows (shrinking as needed). Leaves ctx.font set.
 */
export function layLine(
  f: LookFrame,
  ctx: Ctx2D,
  line: LyricLine,
  elapsed: number,
  o: { size: number; weight: number; family: string; maxW: number; maxRows: number; leading?: number },
): LaidText {
  let size = o.size * (line.lineStyle.size ?? 1);
  const maxW = fitWidth(f, o.maxW);
  const set = () => (ctx.font = `${o.weight} ${size.toFixed(2)}px ${o.family}`);
  set();
  let wrap = wrapWords(ctx, line, elapsed, maxW);
  for (let i = 0; i < 8 && wrap.rows.length > o.maxRows; i++) {
    size *= 0.88;
    set();
    wrap = wrapWords(ctx, line, elapsed, maxW);
  }
  return { ...wrap, size, rowH: size * (o.leading ?? 1.3) * boxHeight(f) };
}

/**
 * Draws laid text with its top-left at (x, y). Words not sung yet are drawn at
 * `waiting` alpha (0 hides them, 1 shows the whole line at once); a word fades
 * up `rise` × size as it comes. Marked words get the accent color and, when
 * `mark` is given, a highlighter bar behind them.
 */
export function drawLaid(
  ctx: Ctx2D,
  t: LaidText,
  x: number,
  y: number,
  o: {
    color: string;
    accent: string;
    waiting: number;
    rise?: number;
    align?: "left" | "center" | "right";
    width?: number;
    mark?: string;
    accentWeight?: number;
    weight?: number;
    family?: string;
  },
): void {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const base = ctx.font;
  t.rows.forEach((row, ri) => {
    const rw = rowWidth(row, t.gap);
    const span = o.width ?? t.widest;
    let cx = o.align === "center" ? x + (span - rw) / 2 : o.align === "right" ? x + span - rw : x;
    const by = y + ri * t.rowH + t.size * 0.98;
    for (const it of row) {
      const k = it.e >= 0 ? 1 : 0;
      const come = clamp01(it.e / 0.18);
      const alpha = k ? o.waiting + (1 - o.waiting) * come : o.waiting;
      if (alpha > 0.003) {
        const dy = k ? (1 - easeOut(come)) * (o.rise ?? 0) * t.size : 0;
        if (it.accent && o.mark && k) {
          ctx.fillStyle = withAlpha(o.mark, 0.85 * alpha);
          ctx.fillRect(cx - t.size * 0.08, by - t.size * 0.32, it.w + t.size * 0.16, t.size * 0.38);
        }
        ctx.globalAlpha = alpha;
        if (it.accent && o.accentWeight && o.family)
          ctx.font = `${o.accentWeight} ${t.size.toFixed(2)}px ${o.family}`;
        ctx.fillStyle = it.accent ? o.accent : o.color;
        ctx.fillText(it.text, cx, by + dy);
        ctx.font = base;
      }
      cx += it.w + gapAfter(row, it, t.gap);
    }
  });
  ctx.restore();
}

/** Unit for UI sizes: 1% of the short side. */
export const unitOf = (f: LookFrame): number => minSide(f) * 0.01;

/** Line text revealed character by character as it is sung (typing), with how far the newest word is. */
export function typedCount(line: LyricLine, elapsed: number): number {
  let n = 0;
  for (const w of line.words) {
    const e = elapsed - w.startOffset;
    if (e < 0) break;
    const len = Array.from(w.text).length;
    const dur = Math.max(0.05, Math.min(0.5, w.endOffset - w.startOffset));
    n += Math.min(len, Math.ceil((e / dur) * len));
    if (e < dur) break;
  }
  return n;
}
