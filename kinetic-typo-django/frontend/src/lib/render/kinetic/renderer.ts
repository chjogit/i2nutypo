import type { LyricLine } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { transformScale } from "../logical-blur";
import { fitScale, isSpaced } from "../wrap";
import {
  boxHeight,
  clampCenter,
  clampLeft,
  fitWidth,
  lyricRegion,
  minSide,
  rowLimit,
  type LookFrame,
} from "../looks/frame";
import { gapAfter, rowWidth, wrapWords, type PlacedWord } from "../looks/words";
import { css, derivePalette, type KineticPalette } from "./color";
import { EXPO_OUT, SHARP_IN, lerp, springAt, springSettle } from "./easing";
import type { MotionStyleDef } from "./styles";
import { kineticFontStack } from "./fonts";

// The kinetic lyric renderer: the line is split into characters or words,
// each one comes in on its own with a stagger, moving up, growing, turning
// and coming into focus together, out of a mask at the row's baseline. Marked
// words get the point color, a pill box or an inverted block. Every value is
// a function of the line's elapsed time, so the export matches the preview.

/** Seconds a line takes to leave, and the stagger between its pieces as they go. */
export const EXIT_DUR = 0.28;
const EXIT_STAGGER = 0.012;
/** Marked words in a box: the box opens first, the text follows this much later. */
const BOX_LEAD = 0.14;
const BOX_DUR = 0.38;
/** The longest a whole line may take to come in when it all starts together. */
const MAX_WAVE = 1.2;

/** One piece that moves on its own: a character or a word. */
export interface Piece {
  text: string;
  /** Left edge and width in frame px, and the baseline. */
  x: number;
  w: number;
  baseline: number;
  row: number;
  /** The placed word (wrapWords item) it belongs to. */
  item: number;
  /** Seconds from the line start at which it starts to come in. */
  appear: number;
  accent: boolean;
  /** Order in the line, for the exit stagger. */
  order: number;
}

/** A box behind marked words. */
export interface AccentBox {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  /** When it starts to open, seconds from the line start. */
  at: number;
  first: number;
}

export interface KineticLayout {
  size: number;
  font: string;
  tracking: number;
  pieces: Piece[];
  items: {
    text: string;
    x: number;
    baseline: number;
    accent: boolean;
    row: number;
    first: number;
    count: number;
  }[];
  boxes: AccentBox[];
  rows: { top: number; bottom: number }[];
}

/** Seconds since the line started at which each word starts, from the placed items. */
const startOf = (it: PlacedWord, elapsed: number) => elapsed - it.e;

/**
 * Lays out the line and times every piece. Pure apart from measuring text on
 * ctx, so tests can check it with a fake context.
 */
export function layoutKinetic(f: LookFrame, def: MotionStyleDef, line: LyricLine): KineticLayout {
  const { ctx, H, style } = f;
  const reveal = style.kineticReveal === "line" ? "line" : "sung";
  const family = kineticFontStack(style);
  const spaced = isSpaced(line.cleanText);
  const trackingEm = spaced ? def.tracking : Math.max(def.tracking, -0.03);
  let size = minSide(f) * (line.isBigLine ? def.size[1] : def.size[0]) * style.fontScale;
  const { rect: area } = lyricRegion(f, [5, 6, 9, 10, 1, 2, 13, 14]);
  const maxW = fitWidth(f, area.w * 0.86);
  const maxRows = rowLimit(f, 3);
  const setFont = () => {
    ctx.font = `${def.weight} ${size}px ${family}`;
    (ctx as CanvasRenderingContext2D).letterSpacing = `${(size * trackingEm).toFixed(2)}px`;
  };
  setFont();
  size *= fitScale(line.cleanText, maxW, (t) => ctx.measureText(t).width);
  setFont();
  let wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  for (let i = 0; i < 8 && wrap.rows.length > maxRows; i++) {
    size *= 0.88;
    setFont();
    wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  }
  const rowH = size * def.leading * boxHeight(f);
  const total = rowH * wrap.rows.length;
  const topLimit = f.subtitleTop ? H * 0.2 : H * 0.06;
  const bottomLimit = f.subtitleVisible ? H * 0.8 : H * 0.94;
  let y = Math.max(topLimit, Math.min(area.y + area.h / 2 - total / 2, bottomLimit - total));
  const left = def.align === "left";
  const blockLeft = clampLeft(f, area.x + area.w * 0.07, wrap.widest);
  const cx = clampCenter(f, area.x + area.w / 2, wrap.widest);

  const pieces: Piece[] = [];
  const items: KineticLayout["items"] = [];
  const boxes: AccentBox[] = [];
  const rows: KineticLayout["rows"] = [];
  const boxed = def.accent !== "color";
  let prev = -Infinity;
  let order = 0;
  const count = wrap.rows.reduce(
    (n, r) => n + r.reduce((m, it) => m + (def.unit === "char" ? Array.from(it.text).length : 1), 0),
    0,
  );
  const wave = Math.min(def.stagger, MAX_WAVE / Math.max(1, count));

  const pad = size * 0.2;
  // A boxed word keeps a box padding of air on each side, so its box never touches its neighbours
  const sameWord = (a: PlacedWord | undefined, b: PlacedWord) => !!a && a.accent && a.index === b.index;
  const opens = (row: readonly PlacedWord[], k: number) =>
    boxed && row[k].accent && !sameWord(row[k - 1], row[k]);
  const closes = (row: readonly PlacedWord[], k: number) =>
    boxed && row[k].accent && !sameWord(row[k + 1], row[k]);

  wrap.rows.forEach((row, r) => {
    y += rowH;
    const baseline = y - rowH * 0.5 + size * 0.36;
    rows.push({ top: baseline - size * 1.2, bottom: baseline + size * 0.32 });
    const air = row.reduce((n, _it, k) => n + (opens(row, k) ? pad : 0) + (closes(row, k) ? pad : 0), 0);
    let x = left ? blockLeft : cx - (rowWidth(row, wrap.gap) + air) / 2;
    let box: AccentBox | null = null;
    row.forEach((it, k) => {
      if (opens(row, k)) x += pad;
      const t0 = reveal === "line" ? order * wave : startOf(it, f.lineElapsed);
      const parts = def.unit === "char" ? Array.from(it.text) : [it.text];
      const first = pieces.length;
      // A box in front of a marked word: it opens at the word's time and its text follows
      const inBox = boxed && it.accent;
      if (inBox) {
        const prevIt = row[k - 1];
        if (box && prevIt && prevIt.accent && prevIt.index === it.index) {
          box.w = x + it.w - box.x;
        } else {
          box = { x, y: 0, w: it.w, h: 0, row: r, at: reveal === "line" ? t0 : Math.max(t0, prev), first };
          boxes.push(box);
        }
      } else box = null;
      let offset = 0;
      parts.forEach((text, j) => {
        const w = parts.length === 1 ? it.w : ctx.measureText(text).width;
        let appear =
          reveal === "line" ? order * wave : Math.max(t0 + j * def.stagger, prev + def.stagger * 0.5);
        if (inBox) appear += BOX_LEAD;
        prev = reveal === "line" ? prev : appear;
        pieces.push({
          text,
          x: x + offset,
          w,
          baseline,
          row: r,
          item: items.length,
          appear,
          accent: it.accent,
          order: order++,
        });
        offset += w;
      });
      items.push({ text: it.text, x, baseline, accent: it.accent, row: r, first, count: parts.length });
      x += it.w + gapAfter(row, it, wrap.gap) + (closes(row, k) ? pad : 0);
    });
  });
  for (const b of boxes) {
    const base = pieces[b.first].baseline;
    b.x -= pad;
    b.w += pad * 2;
    b.y = base - size * 0.9;
    b.h = size * 1.14;
  }
  return {
    size,
    font: `${def.weight} ${size}px ${family}`,
    tracking: size * trackingEm,
    pieces,
    items,
    boxes,
    rows,
  };
}

/** Where a piece is this frame: offsets, scale, turn (radians), blur and alpha. */
export interface PiecePose {
  dy: number;
  scale: number;
  rot: number;
  blur: number;
  alpha: number;
  /** Still moving (true) or settled for good. */
  moving: boolean;
}

/**
 * The pose of a piece `k` seconds after it started to come in, and `o` 0..1
 * through its exit. Position, blur and fade run on the expo-out curve, scale
 * and turn on the spring; the exit runs on the sharp ease-in.
 */
export function piecePose(def: MotionStyleDef, k: number, o: number, unit: number): PiecePose {
  if (k <= 0) return { dy: 0, scale: 1, rot: 0, blur: 0, alpha: 0, moving: true };
  const e = (def.ease ?? EXPO_OUT)(k / def.inDur);
  const s = springAt(k, def.spring);
  const fade = EXPO_OUT(k / def.fade);
  const settled = k >= Math.max(def.inDur, springSettle(def.spring)) && o <= 0;
  const out = SHARP_IN(o);
  return {
    dy: lerp(def.from.y * unit, 0, e) - out * 28 * unit,
    scale: lerp(def.from.scale, 1, s) * (1 - out * 0.06),
    rot: (lerp(def.from.rot, 0, s) * Math.PI) / 180,
    blur: Math.max(0, lerp(def.from.blur * unit, 0, e) + out * 10 * unit),
    alpha: fade * (1 - out),
    moving: !settled,
  };
}

/** 0..1 through the line's exit for the piece in `order`, 0 before it starts. */
export function exitProgress(elapsed: number, dur: number, order: number, count: number): number {
  if (dur < 1) return 0;
  const start = dur - EXIT_DUR - Math.max(0, count - 1) * EXIT_STAGGER;
  return Math.min(1, Math.max(0, (elapsed - start - order * EXIT_STAGGER) / EXIT_DUR));
}

/**
 * Text drawn out of focus by `blur` logical px. A canvas blur filter costs a
 * layer per call, so the glyph is drawn far off the canvas and only its
 * shadow, blurred and moved back, lands in place: the same look for a
 * fraction of the work. Falls back to the filter where there is no transform
 * to read (tests).
 */
function fillBlurred(ctx: Ctx2D, text: string, x: number, y: number, blur: number, color: string): void {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const canvas = (ctx as CanvasRenderingContext2D).canvas as { width?: number } | undefined;
  if (!m || typeof m.a !== "number" || !canvas?.width) {
    ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.fillText(text, x, y);
    return;
  }
  const far = canvas.width * 2 + 2000;
  const k = transformScale(ctx);
  ctx.save();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e + far, m.f);
  // Lengths set here are logical (logical-blur.ts scales them by k); the offset undoes the device shift
  ctx.shadowOffsetX = -far / k;
  ctx.shadowOffsetY = 0;
  // A shadow's blur is twice its standard deviation, the filter's blur is the deviation itself
  ctx.shadowBlur = blur * 2;
  ctx.shadowColor = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function setGlowOrShadow(
  ctx: Ctx2D,
  def: MotionStyleDef,
  p: KineticPalette,
  size: number,
  accent: boolean,
): void {
  // A word on its own box stays crisp: no glow or shadow muddying it
  if (accent && hasBoxes(def)) return;
  if (def.glow > 0) {
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = size * def.glow * (accent ? 1.35 : 1);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else if (def.shadow > 0) {
    ctx.shadowColor = p.shadow;
    ctx.shadowBlur = size * def.shadow;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = size * 0.045;
  }
}

/** Draws the active line in the motion style, in the user's colors. */
/**
 * Which part to draw: everything, everything but the boxed words, or only the
 * boxed words with their boxes. The auto contrast runs on the "plain" part
 * alone, since a boxed word already reads on its own box (readableOn).
 */
export type KineticPart = "all" | "plain" | "boxed";

/** True when the style puts marked words on boxes of their own. */
export const hasBoxes = (def: MotionStyleDef): boolean => def.accent !== "color";

export function drawKineticLyrics(f: LookFrame, def: MotionStyleDef, part: KineticPart = "all"): void {
  const line = f.line;
  if (!line || line.words.length === 0) return;
  const { ctx } = f;
  const palette = derivePalette(f.style);
  const unit = minSide(f) / 1080;
  const dur = Math.max(0.01, line.endTime - line.startTime);
  const elapsed = f.lineElapsed;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const L = layoutKinetic(f, def, line);
  ctx.font = L.font;
  (ctx as CanvasRenderingContext2D).letterSpacing = `${L.tracking.toFixed(2)}px`;
  const n = L.pieces.length;
  const textColor = css(palette.text);
  const accentText = def.accent === "color" ? css(palette.accent) : css(palette.onAccent);

  // Boxes behind marked words open first, from their left edge
  const boxedStyle = hasBoxes(def);
  const wants = (accent: boolean) =>
    part === "all" || !boxedStyle ? part !== "boxed" : (part === "boxed") === accent;
  const boxes = part === "plain" ? [] : L.boxes;
  for (const b of boxes) {
    const k = elapsed - b.at;
    if (k <= 0) continue;
    const o = SHARP_IN(exitProgress(elapsed, dur, L.pieces[b.first].order, n));
    const open = def.accent === "invert" ? EXPO_OUT(k / 0.18) : EXPO_OUT(k / BOX_DUR);
    const w = b.w * open * (1 - o);
    if (w <= 0.5) continue;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k / 0.08) * (1 - o);
    ctx.fillStyle = css(palette.accent);
    if (def.accent === "pill") {
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = L.size * 0.35;
    }
    roundRect(ctx, b.x, b.y, w, b.h, def.accent === "pill" ? b.h / 2 : L.size * 0.08);
    ctx.fill();
    ctx.restore();
  }

  for (const it of L.items) {
    if (!wants(it.accent)) continue;
    const group = L.pieces.slice(it.first, it.first + it.count);
    const poses = group.map((pc) =>
      piecePose(def, elapsed - pc.appear, exitProgress(elapsed, dur, pc.order, n), unit),
    );
    const color = it.accent ? accentText : textColor;
    // Settled word: drawn in one go (same spacing), the cheap steady state
    if (poses.every((p) => !p.moving)) {
      ctx.save();
      setGlowOrShadow(ctx, def, palette, L.size, it.accent);
      ctx.fillStyle = color;
      ctx.fillText(it.text, it.x, it.baseline);
      ctx.restore();
      continue;
    }
    group.forEach((pc, j) => {
      const pose = poses[j];
      if (pose.alpha <= 0.002) return;
      const row = L.rows[pc.row];
      ctx.save();
      if (def.mask && elapsed - pc.appear < def.inDur) {
        // The invisible floor: the piece rises out of its row's band
        ctx.beginPath();
        ctx.rect(pc.x - L.size * 2, row.top, pc.w + L.size * 4, row.bottom - row.top);
        ctx.clip();
      }
      ctx.globalAlpha *= Math.min(1, pose.alpha);
      const px = pc.x + pc.w / 2;
      const py = pc.baseline - L.size * 0.35;
      ctx.translate(px, py + pose.dy);
      if (pose.rot !== 0) ctx.rotate(pose.rot);
      if (pose.scale !== 1) ctx.scale(pose.scale, pose.scale);
      ctx.fillStyle = color;
      if (pose.blur > 0.3) fillBlurred(ctx, pc.text, -pc.w / 2, L.size * 0.35, pose.blur, color);
      else {
        setGlowOrShadow(ctx, def, palette, L.size, pc.accent);
        ctx.fillText(pc.text, -pc.w / 2, L.size * 0.35);
      }
      ctx.restore();
    });
  }
  ctx.restore();
}
