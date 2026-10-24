import { easeOutExpo } from "../easing";
import {
  amt,
  boxHeight,
  clampLeft,
  drawCharacterLayer,
  drawIllustration,
  fitWidth,
  lineExit,
  lyricRegion,
  minSide,
  rowLimit,
  withMoved,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { hash01, hashSigned, withAlpha } from "./noise";
import { gapAfter, wrapWords } from "./words";
import { fitScale } from "../wrap";

// I. Flat type: a solid color field that flips on each line, one giant word stamped behind everything,
// stripe and dot stickers, a white-outlined character cutout and heavy lyrics that fill the free space.

/** Field and ink colors for a line: the palette rotates every line while flipping is on. */
function fieldColors(f: LookFrame, index: number): { field: string; ink: string } {
  const { style } = f;
  const k = amt(f, "flip") > 0 ? ((index % 3) + 3) % 3 : 0;
  if (k === 1) return { field: style.secondaryColor, ink: style.accentColor };
  if (k === 2) return { field: style.textColor, ink: style.bgColor };
  return { field: style.bgColor, ink: style.textColor };
}

function currentColors(f: LookFrame): { field: string; ink: string } {
  return fieldColors(f, f.line ? f.line.index : 0);
}

/** Diagonal stripe bands in two corners. */
function drawStripes(f: LookFrame): void {
  const stripes = amt(f, "stripes");
  if (stripes <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const { ink } = currentColors(f);
  const step = s * 0.03;
  const slide = (f.timeSec * s * 0.04) % (step * 2);
  ctx.save();
  ctx.fillStyle = withAlpha(ink, 0.9 * stripes);
  for (const [cx, cy, dir] of [
    [0, 0, 1],
    [W, H, -1],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dir * s * 0.42, cy);
    ctx.lineTo(cx, cy + dir * s * 0.42);
    ctx.closePath();
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    for (let x = -s + slide * dir; x < s; x += step * 2) ctx.fillRect(x, -s, step, s * 2);
    ctx.restore();
  }
  ctx.restore();
}

/** Round stickers that pop in when a line starts. */
function drawDots(f: LookFrame): void {
  const dots = amt(f, "dots");
  if (dots <= 0 || !f.line) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const { field, ink } = currentColors(f);
  const n = 2 + Math.round(dots * 3);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const seed = f.line.index * 13 + i;
    const pop = easeOutExpo(Math.min(1, Math.max(0, f.lineElapsed - i * 0.06) / 0.3));
    if (pop <= 0) continue;
    const r = s * (0.025 + hash01(seed, 1) * 0.05) * pop;
    // Kept near the edges so they rarely cover lyrics
    const edge = hash01(seed, 2) < 0.5;
    const x = edge ? (hash01(seed, 3) < 0.5 ? W * 0.06 : W * 0.94) : W * (0.1 + hash01(seed, 4) * 0.8);
    const y = edge ? H * (0.15 + hash01(seed, 5) * 0.7) : hash01(seed, 6) < 0.5 ? H * 0.08 : H * 0.92;
    ctx.fillStyle = i % 2 ? ink : f.style.accentColor === field ? ink : f.style.accentColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = field;
    ctx.stroke();
  }
  ctx.restore();
}

function decor(f: LookFrame): void {
  drawStripes(f);
  drawDots(f);
}

/** The line's key word (first accent, else the longest), huge and faint behind everything. */
function drawStamp(f: LookFrame, ink: string): void {
  const stamp = amt(f, "stamp");
  const line = f.line;
  if (stamp <= 0 || !line || line.words.length === 0) return;
  const { ctx, W, H, style } = f;
  const word =
    line.words.find((w) => w.isAccent) ??
    line.words.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  let size = H * 0.62;
  ctx.save();
  ctx.font = `400 ${size}px ${style.mainFont}`;
  const w = ctx.measureText(word.text).width;
  if (w > W * 1.1) size *= (W * 1.1) / w;
  ctx.font = `400 ${size}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const drift = hashSigned(line.index, 9) * W * 0.03 + f.lineElapsed * W * 0.008;
  ctx.globalAlpha = 0.16 * stamp * lineExit(f, 0.1);
  ctx.fillStyle = ink;
  ctx.fillText(word.text, W / 2 + drift, H * 0.52);
  ctx.restore();
}

function scene(f: LookFrame): void {
  const { ctx, W, H } = f;
  const line = f.line;
  const now = currentColors(f);
  const prev = fieldColors(f, line ? line.index - 1 : 0);
  ctx.fillStyle = now.field;
  ctx.fillRect(0, 0, W, H);
  // The new color wipes in diagonally over the last one
  const wipe = line && amt(f, "flip") > 0 ? easeOutExpo(Math.min(1, Math.max(0, f.lineElapsed) / 0.35)) : 1;
  if (wipe < 1) {
    ctx.save();
    ctx.fillStyle = prev.field;
    ctx.beginPath();
    const edge = (W + H) * wipe;
    ctx.moveTo(edge, 0);
    ctx.lineTo(W + H, 0);
    ctx.lineTo(W + H, H);
    ctx.lineTo(edge - H, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (f.images.background) {
    // Flat look: the picture stays as a faint print on the color field
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = "multiply";
    drawIllustration(f, { x: 0, y: 0, w: W, h: H });
    ctx.restore();
  }
  withMoved(f, "stamp", { x: W / 2, y: H * 0.52 }, () => drawStamp(f, now.ink));
  decor(f);

  // Sticker-style cutout: a solid white edge made from offset shadows
  const outline = amt(f, "outline");
  const opts = { bounce: f.energy * 0.6, tilt: Math.sin(f.timeSec * 1.3) * 0.03 };
  if (outline > 0 && f.images.character) {
    const k = minSide(f) * 0.008 * (0.5 + outline);
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 0;
    for (const [dx, dy] of [
      [k, 0],
      [-k, 0],
      [0, k],
      [0, -k],
    ]) {
      ctx.shadowOffsetX = dx;
      ctx.shadowOffsetY = dy;
      drawCharacterLayer(f, opts);
    }
    ctx.restore();
  }
  drawCharacterLayer(f, opts);
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const { rect: area } = lyricRegion(f, [5, 6, 9, 10, 1, 2, 4, 7, 8, 11, 13, 14, 0, 3, 12, 15]);
  const { ink } = currentColors(f);
  const exit = lineExit(f, 0.06);
  const slam = amt(f, "slam");
  const maxW = fitWidth(f, area.w * 0.92);
  // As big as fits: start large, shrink until the block fits the free area in at most three rows
  let size = Math.min(area.h * 0.42, minSide(f) * 0.2) * style.fontScale;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Shrink so the widest word or spaced phrase fits whole, then wrap
  ctx.font = `400 ${size}px ${style.mainFont}`;
  size *= fitScale(line.cleanText, maxW, (t) => ctx.measureText(t).width);
  let wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  for (let i = 0; i < 8; i++) {
    ctx.font = `400 ${size}px ${style.mainFont}`;
    wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
    if (
      wrap.rows.length <= rowLimit(f, 3) &&
      wrap.rows.length * size * 1.02 <= area.h * 0.95 &&
      wrap.widest <= maxW
    )
      break;
    size *= 0.86;
  }
  const rowH = size * 1.02 * boxHeight(f);
  const total = rowH * wrap.rows.length;
  const bottomLimit = f.subtitleVisible ? H * 0.8 : H * 0.96;
  let y = Math.max(H * 0.04, Math.min(area.y + area.h / 2 - total / 2, bottomLimit - total));
  // Pulled back on screen when the lyric shift would push it off
  const left = clampLeft(f, area.x + (area.w - wrap.widest) / 2, wrap.widest);
  for (const row of wrap.rows) {
    y += rowH;
    // Rows are set flush left inside the free area, like a poster
    let x = left;
    for (const it of row) {
      if (it.e >= 0) {
        const t = Math.min(1, it.e / 0.18);
        const scale = (1 + (1 - easeOutExpo(t)) * 0.6 * slam) * exit;
        ctx.save();
        ctx.globalAlpha = slam > 0 ? Math.min(1, t * 3) : Math.min(1, it.e / 0.2);
        ctx.translate(x + it.w / 2, y - size * 0.36);
        ctx.scale(scale, scale);
        ctx.fillStyle = it.accent
          ? style.accentColor === currentColors(f).field
            ? ink
            : style.accentColor
          : ink;
        ctx.fillText(it.text, -it.w / 2, size * 0.36);
        ctx.restore();
      }
      x += it.w + gapAfter(row, it, wrap.gap);
    }
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  // A thin frame in the ink color keeps the flat field from feeling empty
  if (f.mixed) return;
  const { ctx, W, H } = f;
  const inset = minSide(f) * 0.025;
  ctx.save();
  ctx.strokeStyle = withAlpha(currentColors(f).ink, 0.8);
  ctx.lineWidth = Math.max(2, minSide(f) * 0.004);
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.restore();
}

export const flatType: LookRenderer = { scene, lyrics, overlay, decor };
