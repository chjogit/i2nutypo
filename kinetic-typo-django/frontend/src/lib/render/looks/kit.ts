import { easeOutBack, easeOutExpo } from "../easing";
import { fitScale } from "../wrap";
import {
  backgroundSource,
  boxHeight,
  boxWidth,
  clampCenter,
  clampLeft,
  fadeIn,
  fitWidth,
  isPortrait,
  lineExit,
  lyricRegion,
  minSide,
  rowLimit,
  type LookFrame,
} from "./frame";
import { drawVerticalColumn, lineGlyphs, splitColumns } from "./glyphs";
import { drawImageRect, type Rect } from "./illustration";
import { GRID, pickColumn } from "./layout";
import { hash01, hashSigned, withAlpha } from "./noise";
import { rowWidth, wrapWords } from "./words";

// Shared parts for the themes that are built from common pieces: a filtered
// backdrop, drifting particles, paper and light effects, and two lyric layouts.

/** The background picture over the whole frame, through a canvas filter; `fallback` paints when none is loaded. */
export function drawBackdrop(f: LookFrame, filter: string, fallback: (f: LookFrame, r: Rect) => void): void {
  const { ctx, W, H } = f;
  const dest: Rect = { x: 0, y: 0, w: W, h: H };
  const img = f.images.background;
  const src = img ? backgroundSource(f, dest) : null;
  if (!img || !src) {
    fallback(f, dest);
    return;
  }
  ctx.save();
  if (filter) ctx.filter = filter;
  drawImageRect(ctx, img, src, dest);
  ctx.restore();
}

/** A vertical two-color gradient with a few soft glows, for when no background is loaded. */
export function gradientFallback(top: string, bottom: string) {
  return (f: LookFrame, r: Rect): void => {
    const { ctx } = f;
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  };
}

/** Fills the frame with a color through a composite mode (tints, grades, washes). */
export function washFrame(f: LookFrame, color: string, alpha: number, mode: GlobalCompositeOperation): void {
  if (alpha <= 0) return;
  const { ctx, W, H } = f;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export type ParticleKind = "petal" | "snow" | "rain" | "ember" | "bubble" | "bokeh" | "heart" | "star";

/**
 * Drifting particles. `layer` (0 back, 1 front) changes the seed, size and
 * speed so a theme can draw one set behind the lyrics and one over them.
 */
export function drawParticles(
  f: LookFrame,
  kind: ParticleKind,
  amount: number,
  color: string,
  layer = 0,
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const base = { petal: 40, snow: 90, rain: 140, ember: 50, bubble: 34, bokeh: 18, heart: 16, star: 40 }[
    kind
  ];
  const count = Math.round(base * amount * (layer ? 0.45 : 1));
  const t = f.timeSec;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const k = i + layer * 1000;
    const depth = 0.4 + hash01(k, 1) * 0.6 + layer * 0.5;
    const r = s * depth;
    // Each kind moves its own way: falling, rising or floating
    const fall = {
      petal: 0.05,
      snow: 0.035,
      rain: 0.9,
      ember: -0.05,
      bubble: -0.04,
      bokeh: 0.004,
      heart: -0.02,
      star: 0,
    }[kind];
    const sway = {
      petal: 0.06,
      snow: 0.02,
      rain: 0,
      ember: 0.02,
      bubble: 0.01,
      bokeh: 0.01,
      heart: 0.02,
      star: 0,
    }[kind];
    const wind = kind === "petal" ? 0.04 : kind === "rain" ? 0.12 : 0;
    const yy = (((hash01(k, 2) + t * fall * depth) % 1) + 1) % 1;
    const xx = (((hash01(k, 3) + t * wind * depth + Math.sin(t * 0.8 + k) * sway) % 1) + 1) % 1;
    const x = xx * W;
    const y = yy * H;
    const tw = 0.6 + 0.4 * Math.sin(t * (1 + hash01(k, 4) * 2) + k);
    switch (kind) {
      case "petal": {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (0.6 + hash01(k, 5)) + k);
        ctx.scale(1, 0.55 + 0.45 * Math.sin(t * 2 + k));
        ctx.fillStyle = withAlpha(color, 0.85);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.012, r * 0.008, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case "snow":
        ctx.fillStyle = withAlpha(color, 0.5 + 0.4 * depth * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.0045, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "rain":
        ctx.strokeStyle = withAlpha(color, 0.25 + 0.25 * depth * 0.6);
        ctx.lineWidth = Math.max(1, depth);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - r * 0.006, y + r * 0.05);
        ctx.stroke();
        break;
      case "ember": {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.012);
        g.addColorStop(0, withAlpha(color, 0.9 * tw));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 0.012, y - r * 0.012, r * 0.024, r * 0.024);
        break;
      }
      case "bubble":
        ctx.strokeStyle = withAlpha(color, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * (0.004 + hash01(k, 6) * 0.01), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "bokeh": {
        const br = r * (0.03 + hash01(k, 6) * 0.05);
        const g = ctx.createRadialGradient(x, y, br * 0.6, x, y, br);
        g.addColorStop(0, withAlpha(color, 0.22 * tw));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - br, y - br, br * 2, br * 2);
        break;
      }
      case "heart": {
        const hr = r * 0.012;
        ctx.fillStyle = withAlpha(color, 0.7 * tw);
        ctx.beginPath();
        ctx.moveTo(x, y + hr * 0.9);
        ctx.bezierCurveTo(x - hr * 1.6, y - hr * 0.2, x - hr * 0.5, y - hr * 1.3, x, y - hr * 0.4);
        ctx.bezierCurveTo(x + hr * 0.5, y - hr * 1.3, x + hr * 1.6, y - hr * 0.2, x, y + hr * 0.9);
        ctx.fill();
        break;
      }
      case "star": {
        const sr = r * 0.006 * tw;
        ctx.fillStyle = withAlpha(color, 0.8 * tw);
        ctx.fillRect(x - sr * 3, y - 0.4, sr * 6, 0.8);
        ctx.fillRect(x - 0.4, y - sr * 3, 0.8, sr * 6);
        break;
      }
    }
  }
  ctx.restore();
}

/** A warm light leak sweeping slowly in from one edge. */
export function drawLightLeak(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const x = W * (0.85 + Math.sin(f.timeSec * 0.15) * 0.12);
  const g = ctx.createRadialGradient(x, H * 0.1, 0, x, H * 0.1, Math.max(W, H) * 0.7);
  g.addColorStop(0, withAlpha(color, 0.55 * amount));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Paper fibre: faint blotches and specks that stay put. */
export function drawPaper(f: LookFrame, amount: number, ink = "#5b4630"): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  ctx.save();
  for (let i = 0; i < 24; i++) {
    const x = hash01(i, 1) * W;
    const y = hash01(i, 2) * H;
    const r = Math.max(W, H) * (0.05 + hash01(i, 3) * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(ink, 0.07 * amount));
    g.addColorStop(1, withAlpha(ink, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fillStyle = withAlpha(ink, 0.25 * amount);
  for (let i = 0; i < 260; i++) ctx.fillRect(hash01(i, 7) * W, hash01(i, 8) * H, 1, 1);
  ctx.restore();
}

/** Vertical film scratches that jump every few frames. */
export function drawScratches(f: LookFrame, amount: number): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const frame = Math.floor(f.timeSec * 12);
  ctx.save();
  ctx.fillStyle = `rgba(255,248,230,${0.35 * amount})`;
  for (let i = 0; i < 3; i++) {
    if (hash01(frame, i) > 0.55) continue;
    ctx.fillRect(hash01(frame, i + 10) * W, 0, 1, H * (0.4 + hash01(frame, i + 20) * 0.6));
  }
  ctx.restore();
}

export type WordMotion = "fade" | "rise" | "pop" | "slide" | "type" | "blur";

export interface WordLyricsOptions {
  /** Preferred 4x4 cells, in order. */
  cells: readonly number[];
  /** Size as a share of the frame's short side, for normal and big lines. */
  size: [number, number];
  weight: number;
  font: "main" | "accent";
  motion: WordMotion;
  /** Strength of the motion, 0..1 (the theme's lyric element). */
  motionAmount: number;
  color: string;
  accentColor: string;
  align?: "center" | "left";
  /** Outline color and width (share of size). */
  stroke?: [string, number];
  /** Glow color and blur (share of size). */
  glow?: [string, number];
  /** A solid box behind each row, with its padding as a share of size. */
  box?: [string, number];
  /** Extra space between characters, as a share of size. */
  tracking?: number;
  maxRows?: number;
}

/** Word-by-word lyric block that wraps, shrinks and stays on screen; used by the kit themes. */
export function drawWordLyrics(f: LookFrame, o: WordLyricsOptions): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const { rect: area } = lyricRegion(f, o.cells);
  const family = o.font === "main" ? style.mainFont : style.accentFont;
  let size = minSide(f) * (line.isBigLine ? o.size[1] : o.size[0]) * style.fontScale;
  const exit = lineExit(f, 0.1);
  const maxW = fitWidth(f, area.w * 0.9);
  const maxRows = rowLimit(f, o.maxRows ?? 3);
  const setFont = () => {
    ctx.font = `${o.weight} ${size}px ${family}`;
    if (o.tracking) (ctx as CanvasRenderingContext2D).letterSpacing = `${size * o.tracking}px`;
  };

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  setFont();
  // Words and spaced phrases shrink to fit whole; then shrink while the block needs too many rows
  size *= fitScale(line.cleanText, maxW, (t) => ctx.measureText(t).width);
  setFont();
  let wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  for (let i = 0; i < 8 && wrap.rows.length > maxRows; i++) {
    size *= 0.86;
    setFont();
    wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  }
  const rowH = size * (o.box ? 1.5 : 1.25) * boxHeight(f);
  const total = rowH * wrap.rows.length;
  const topLimit = f.subtitleTop ? H * 0.2 : H * 0.05;
  const bottomLimit = f.subtitleVisible ? H * 0.8 : H * 0.95;
  let y = Math.max(topLimit, Math.min(area.y + area.h / 2 - total / 2, bottomLimit - total));
  const left = o.align === "left";
  const blockLeft = clampLeft(
    f,
    left ? area.x + area.w * 0.06 : area.x + (area.w - wrap.widest) / 2,
    wrap.widest,
  );
  const cx = clampCenter(f, area.x + area.w / 2, wrap.widest);
  const m = o.motionAmount;

  ctx.lineJoin = "round";
  for (const row of wrap.rows) {
    y += rowH;
    const rw = rowWidth(row, wrap.gap);
    let x = left ? blockLeft : cx - rw / 2;
    const base = y - size * (o.box ? 0.45 : 0.375);
    if (o.box && row.some((it) => it.e >= 0)) {
      const pad = size * o.box[1];
      ctx.fillStyle = withAlpha(o.box[0], 0.88 * exit);
      ctx.fillRect(x - pad, base - size * 0.95, rw + pad * 2, size * 1.25);
    }
    for (const it of row) {
      const t = it.e < 0 ? 0 : Math.min(1, it.e / 0.35);
      let a = fadeIn(it.e, 0.3) * exit;
      let dx = 0;
      let dy = 0;
      let scale = 1;
      let shown = it.text;
      switch (o.motion) {
        case "rise":
          dy = (1 - easeOutExpo(t)) * size * 0.6 * m;
          break;
        case "slide":
          dx = (1 - easeOutExpo(t)) * size * 0.8 * m;
          break;
        case "pop":
          scale = it.e < 0 ? 0 : 1 + (easeOutBack(t) - 1) * 1.3 * m;
          a = it.e < 0 ? 0 : exit;
          break;
        case "type": {
          const chars = Array.from(it.text);
          const n = it.e < 0 ? 0 : Math.ceil(Math.min(1, it.e / (0.06 * chars.length + 0.01)) * chars.length);
          shown = m > 0 ? chars.slice(0, n).join("") : it.text;
          a = it.e < 0 ? 0 : exit;
          break;
        }
        case "blur":
          if (m > 0 && t < 1) ctx.filter = `blur(${((1 - t) * size * 0.15 * m).toFixed(1)}px)`;
          break;
        default:
          break;
      }
      if (a > 0 && shown) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(x + it.w / 2 + dx, base + dy);
        if (scale !== 1) ctx.scale(scale, scale);
        if (o.glow) {
          ctx.shadowColor = o.glow[0];
          ctx.shadowBlur = size * o.glow[1];
        }
        if (o.stroke) {
          ctx.lineWidth = size * o.stroke[1];
          ctx.strokeStyle = o.stroke[0];
          ctx.strokeText(shown, -it.w / 2, 0);
        }
        ctx.fillStyle = it.accent ? o.accentColor : o.color;
        ctx.fillText(shown, -it.w / 2, 0);
        ctx.restore();
      }
      ctx.filter = "none";
      x += it.w + wrap.gap;
    }
  }
  ctx.restore();
}

/** Vertical (tategaki) columns running right to left from the most open screen column. */
export function drawVerticalLyrics(
  f: LookFrame,
  o: { size: number; weight: number; color: string; accentColor: string; glow?: [string, number] },
): void {
  const line = f.line;
  if (!line) return;
  const { ctx, W, H, style } = f;
  const size = minSide(f) * o.size * style.fontScale;
  const top = H * (f.subtitleTop ? 0.25 : 0.08);
  const colH = Math.min(H - top - size, (H - top - H * (f.subtitleVisible ? 0.22 : 0.08)) * boxHeight(f));
  const cols = splitColumns(lineGlyphs(line, f.lineElapsed), size, colH);
  const exit = lineExit(f, 0.1);
  const col = pickColumn(f.blocked, [3, 0, 2, 1]);
  const step = size * 1.5 * boxWidth(f);
  const spanW = (cols.length - 1) * step;
  let x = (W / GRID) * col + (W / GRID) * (isPortrait(f) ? 0.7 : 0.72);
  x = clampLeft(f, x - spanW - size / 2, spanW + size) + spanW + size / 2;
  ctx.save();
  ctx.font = `${o.weight} ${size}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (o.glow) {
    ctx.shadowColor = o.glow[0];
    ctx.shadowBlur = size * o.glow[1];
  }
  let n = 0;
  for (const c of cols) {
    drawVerticalColumn(ctx, c, x, top, size, (g) => {
      const a = fadeIn(g.wElapsed - (n++ % 8) * 0.04, 0.4) * exit;
      if (a <= 0) return;
      ctx.fillStyle = withAlpha(g.isAccent ? o.accentColor : o.color, a);
      ctx.fillText(g.ch, 0, 0);
    });
    x -= step;
  }
  ctx.restore();
}

/** Small signed jitter that changes a few times a second, for hand-made wobble. */
export const boil = (f: LookFrame, seed: number, fps = 8): number =>
  hashSigned(Math.floor(f.timeSec * fps), seed);
