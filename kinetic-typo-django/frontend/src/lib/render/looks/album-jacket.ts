import { easeOutBack } from "../easing";
import { fitScale } from "../wrap";
import {
  amt,
  backgroundSource,
  boxHeight,
  clampLeft,
  drawCharacterLayer,
  fadeIn,
  fitWidth,
  isPortrait,
  lineExit,
  minSide,
  rowLimit,
  withMoved,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { drawImageRect, type LoadedImage, type Rect } from "./illustration";
import { drawParticles } from "./kit";
import { hash01, withAlpha } from "./noise";
import { rowWidth, wrapWords } from "./words";

// A. Album jacket: one cover picture carries the whole video. The cover, blurred and tinted, fills
// the frame; a record with the cover as its label spins on one side (the square sleeve can sit
// behind it); the song title, a credit line, the lyric and a sound line stack in a column beside it.
// It replaces the old classic look; its useful effects (particles, intro bokeh, flash,
// letterbox, next-line preview, ghost words, impact pop, first-word bar) live on as elements.

interface Layout {
  /** Record center and radius. */
  disc: { x: number; y: number; r: number };
  /** Square sleeve. */
  sleeve: Rect;
  /** Text column: title, credit, lyrics and the sound line. */
  column: Rect;
}

function layout(f: LookFrame): Layout {
  const { W, H } = f;
  const pulse = 1 + f.energy * 0.025 * amt(f, "pulse");
  const vinyl = amt(f, "vinyl") > 0;
  const jacket = amt(f, "jacket") > 0;
  const both = vinyl && jacket;
  if (isPortrait(f)) {
    const r = Math.min(W * 0.3, H * 0.17) * pulse;
    const side = r * 1.9;
    const cy = H * 0.27;
    // With both on, the record slides out to the right of the sleeve
    const sx = both ? W / 2 - side * 0.74 : W / 2 - side / 2;
    return {
      disc: { x: both ? sx + side * 0.95 : W / 2, y: cy, r },
      sleeve: { x: sx, y: cy - side / 2, w: side, h: side },
      column: { x: W * 0.08, y: H * 0.5, w: W * 0.84, h: H * 0.26 },
    };
  }
  const r = Math.min(H * 0.38, W * 0.2) * pulse;
  const side = r * 1.9;
  const cy = H * 0.48;
  const sx = W * 0.05;
  const disc = both ? { x: sx + side * 0.95, y: cy, r } : { x: W * 0.28, y: cy, r };
  const right = both ? disc.x + r : jacket ? W * 0.28 + side / 2 : disc.x + r;
  return {
    disc,
    sleeve: { x: both ? sx : W * 0.28 - side / 2, y: cy - side / 2, w: side, h: side },
    column: { x: right + W * 0.05, y: H * 0.22, w: W * 0.95 - right - W * 0.05, h: H * 0.5 },
  };
}

function drawCoverPlaceholder(f: LookFrame, r: Rect): void {
  const { ctx, style } = f;
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, style.accentColor);
  g.addColorStop(1, style.secondaryColor);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = withAlpha(style.bgColor, 0.55);
  ctx.font = `700 ${r.h * 0.4}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", r.x + r.w / 2, r.y + r.h / 2);
}

/** Center crop of an image to a rect's shape. */
function coverCrop(img: LoadedImage, r: Rect): Rect {
  const scale = Math.max(r.w / img.width, r.h / img.height);
  const w = r.w / scale;
  const h = r.h / scale;
  return { x: (img.width - w) / 2, y: (img.height - h) / 2, w, h };
}

/** The cover art (or a placeholder) filling a rect; the caller sets any clip. A separately picked
 * album cover is shown whole and still; without one the background stands in at its framing. */
function drawCover(f: LookFrame, r: Rect): void {
  const cover = f.images.cover;
  if (cover) {
    drawImageRect(f.ctx, cover, coverCrop(cover, r), r);
    return;
  }
  const img = f.images.background;
  const src = img ? backgroundSource(f, r) : null;
  if (img && src) drawImageRect(f.ctx, img, src, r);
  else drawCoverPlaceholder(f, r);
}

/** Wide dark bands crossing the background at a slant. */
function drawBands(f: LookFrame): void {
  const bands = amt(f, "bands");
  if (bands <= 0) return;
  const { ctx, W, H } = f;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.5);
  const drift = (f.timeSec * minSide(f) * 0.01) % (W * 0.22);
  for (let i = -5; i <= 5; i++) {
    const w = minSide(f) * (0.06 + hash01(i + 9, 1) * 0.12);
    const x = i * W * 0.22 + drift;
    ctx.fillStyle = `rgba(0,0,0,${(0.18 + hash01(i + 9, 2) * 0.22) * bands})`;
    ctx.fillRect(x, -W, w, W * 2);
  }
  ctx.restore();
}

function decor(f: LookFrame): void {
  const { style } = f;
  drawBands(f);
  // Before the first line the big soft bokeh plays alone, as the classic intro did
  if (!f.line) drawParticles(f, "bokeh", amt(f, "bokeh"), style.secondaryColor);
  const particles = amt(f, "particles");
  if (particles > 0) {
    drawParticles(f, "snow", 0.5 * particles, style.accentColor);
    drawParticles(f, "star", 0.4 * particles, style.textColor, 1);
  }
}

/** A spinning record with grooves, a sheen and the cover as its round label. */
function drawVinyl(f: LookFrame, disc: Layout["disc"], spin: number): void {
  const { ctx } = f;
  const { x, y, r } = disc;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = r * 0.12;
  ctx.fillStyle = "#0b0b0d";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let k = 0.48; k < 0.97; k += 0.035) {
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  const angle = f.timeSec * (0.6 + 2.4 * spin);
  // Two light wedges catch the light as the record turns
  ctx.globalCompositeOperation = "lighter";
  for (const off of [0, Math.PI]) {
    const g = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.6, "rgba(255,255,255,0.07)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -0.9 + off, -0.5 + off);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Label: the cover in a circle, turning with the record
  const lr = r * 0.44;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.arc(0, 0, lr, 0, Math.PI * 2);
  ctx.clip();
  drawCover(f, { x: -lr, y: -lr, w: lr * 2, h: lr * 2 });
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "#0b0b0d";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, r * 0.025), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSleeve(f: LookFrame, r: Rect, depth: number): void {
  const { ctx } = f;
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${0.6 * depth})`;
  ctx.shadowBlur = r.w * 0.08 * depth;
  ctx.shadowOffsetY = r.w * 0.03 * depth;
  ctx.fillStyle = "#000000";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  drawCover(f, r);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.25 * depth})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.restore();
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  // Blurred, darkened copy of the background (or the cover when only that was picked) behind everything,
  // washed with the accent color
  const blur = amt(f, "blurbg");
  const cover = f.images.cover;
  const img = f.images.background ?? cover ?? null;
  const bgSrc = f.images.background ? backgroundSource(f, full) : cover ? coverCrop(cover, full) : null;
  if (img && bgSrc && blur > 0) {
    ctx.save();
    ctx.filter = `blur(${Math.round(minSide(f) * 0.04 * blur)}px) brightness(${(1 - 0.45 * blur).toFixed(2)})`;
    drawImageRect(ctx, img, bgSrc, { x: -W * 0.05, y: -H * 0.05, w: W * 1.1, h: H * 1.1 });
    ctx.restore();
    ctx.fillStyle = withAlpha(style.accentColor, 0.18 * blur);
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, style.bgColor);
    g.addColorStop(1, withAlpha(style.accentColor, 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  decor(f);

  const { disc, sleeve } = layout(f);
  const vinyl = amt(f, "vinyl");
  const jacket = amt(f, "jacket");
  if (vinyl > 0) withMoved(f, "vinyl", disc, () => drawVinyl(f, disc, vinyl));
  const sleeveMid = { x: sleeve.x + sleeve.w / 2, y: sleeve.y + sleeve.h / 2 };
  if (jacket > 0) withMoved(f, "jacket", sleeveMid, () => drawSleeve(f, sleeve, jacket));

  drawCharacterLayer(f, { bounce: f.energy * 0.4, tilt: 0 });
}

/** Where the title block ends, so the lyrics start under it. */
function titleBottom(f: LookFrame, col: Rect): number {
  if (f.mixed || amt(f, "title") <= 0 || f.style.coverTitle.trim() === "") return col.y;
  const s = minSide(f);
  return col.y + s * 0.11 + (f.style.coverCredit.trim() ? s * 0.045 : 0);
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const col = layout(f).column;
  const top = titleBottom(f, col) + minSide(f) * 0.03;
  const area = { x: col.x, y: top, w: col.w, h: col.y + col.h - top };
  const portrait = isPortrait(f);
  const exit = lineExit(f, 0.08);
  const maxW = fitWidth(f, area.w);
  const ghost = amt(f, "ghost");
  const impact = amt(f, "impact");
  const underline = amt(f, "underline");
  let size = minSide(f) * (line.isBigLine ? 0.062 : 0.05) * (portrait ? 1.5 : 1) * style.fontScale;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `800 ${size}px ${style.mainFont}`;
  size *= fitScale(line.cleanText, maxW, (t) => ctx.measureText(t).width);
  ctx.font = `800 ${size}px ${style.mainFont}`;
  let wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  for (let i = 0; i < 8 && wrap.rows.length > rowLimit(f, 3); i++) {
    size *= 0.86;
    ctx.font = `800 ${size}px ${style.mainFont}`;
    wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  }
  const rowH = size * 1.25 * boxHeight(f);
  const total = rowH * wrap.rows.length;
  const bottomLimit = f.subtitleVisible ? H * 0.8 : H * 0.92;
  let y = Math.max(f.subtitleTop ? H * 0.2 : H * 0.05, Math.min(area.y, bottomLimit - total));
  const left = clampLeft(f, portrait ? area.x + (area.w - wrap.widest) / 2 : area.x, wrap.widest);

  wrap.rows.forEach((row, r) => {
    y += rowH;
    let x = portrait ? left + (wrap.widest - rowWidth(row, wrap.gap)) / 2 : left;
    row.forEach((it, k) => {
      const sung = it.e >= 0;
      const a = sung ? fadeIn(it.e, 0.2) * exit : ghost * 0.28 * exit;
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha = a;
        let scale = 1;
        if (sung && it.accent && impact > 0) {
          scale = 1 + (easeOutBack(Math.min(1, it.e / 0.3)) - 1) * 1.4 * impact;
          ctx.shadowColor = withAlpha(style.accentColor, 0.8);
          ctx.shadowBlur = size * 0.4 * impact;
        }
        ctx.translate(x + it.w / 2, y - size * 0.3);
        ctx.scale(scale, scale);
        ctx.fillStyle = sung && it.accent ? style.secondaryColor : style.textColor;
        ctx.fillText(it.text, -it.w / 2, size * 0.3);
        ctx.restore();
      }
      // A short bar under the first word, drawn out as it is sung
      if (underline > 0 && r === 0 && k === 0 && sung) {
        ctx.fillStyle = withAlpha(style.secondaryColor, exit * underline);
        ctx.fillRect(x, y + size * 0.15, it.w * Math.min(1, it.e / 0.3), Math.max(2, size * 0.06));
      }
      x += it.w + wrap.gap;
    });
  });

  // The next line, small and faint, waiting underneath
  const next = amt(f, "next");
  if (next > 0 && f.nextLine) {
    const ns = size * 0.5;
    ctx.font = `600 ${ns}px ${style.mainFont}`;
    const text = f.nextLine.cleanText.replace(/\n/g, " ");
    ctx.fillStyle = withAlpha(style.textColor, 0.45 * next * fadeIn(f.lineElapsed, 0.4));
    const nw = Math.min(ctx.measureText(text).width, maxW);
    const nx = portrait ? left + (wrap.widest - nw) / 2 : left;
    ctx.fillText(text, nx, y + ns * 1.9, maxW);
  }
  ctx.restore();
}

/** Song title in heavy slanted type with the credit line under it. */
function drawTitle(f: LookFrame, amount: number): void {
  const { ctx, style } = f;
  const title = style.coverTitle.trim();
  if (!title) return;
  const col = layout(f).column;
  const s = minSide(f);
  const portrait = isPortrait(f);
  let size = s * 0.085;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.font = `italic 900 ${size}px ${style.mainFont}`;
  const w = ctx.measureText(title).width;
  if (w > col.w) size *= col.w / w;
  ctx.font = `italic 900 ${size}px ${style.mainFont}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = portrait ? "center" : "left";
  const x = portrait ? col.x + col.w / 2 : col.x;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = size * 0.2;
  ctx.fillStyle = style.textColor;
  ctx.fillText(title, x, col.y + s * 0.085);
  const credit = style.coverCredit.trim();
  if (credit) {
    ctx.shadowBlur = 0;
    ctx.font = `600 ${s * 0.024}px ${style.accentFont}`;
    ctx.fillStyle = withAlpha(style.textColor, 0.75);
    ctx.fillText(credit, x, col.y + s * 0.125, col.w);
  }
  ctx.restore();
}

/** A thin sound line under the lyrics whose spikes jump with the beat. */
function drawWave(f: LookFrame, amount: number): void {
  const { ctx, H, style } = f;
  const col = layout(f).column;
  const y = Math.min(col.y + col.h, f.subtitleVisible ? H * 0.8 : H * 0.92);
  const n = 64;
  const step = col.w / n;
  const tick = Math.floor(f.timeSec * 12);
  const live = f.line ? 0.25 + f.energy : 0.1;
  ctx.save();
  ctx.globalAlpha = 0.85 * amount;
  ctx.fillStyle = style.textColor;
  ctx.fillRect(col.x, y, col.w, 1);
  for (let i = 0; i < n; i++) {
    const spike = hash01(tick, i);
    const h = (spike > 0.82 ? spike * 3 : spike * 0.6) * minSide(f) * 0.012 * live;
    ctx.fillRect(col.x + i * step, y - h, Math.max(1, step * 0.35), h * 2 + 1);
  }
  ctx.restore();
}

/** Play bar with elapsed and total time under the column. */
function drawProgress(f: LookFrame, amount: number): void {
  const { ctx, H, style } = f;
  const col = layout(f).column;
  const y = Math.min(col.y + col.h, f.subtitleVisible ? H * 0.8 : H * 0.92) + minSide(f) * 0.035;
  const p = f.songEnd > 0 ? Math.min(1, f.timeSec / f.songEnd) : 0;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.fillStyle = withAlpha(style.textColor, 0.25);
  ctx.fillRect(col.x, y, col.w, 3);
  ctx.fillStyle = style.textColor;
  ctx.fillRect(col.x, y, col.w * p, 3);
  ctx.beginPath();
  ctx.arc(col.x + col.w * p, y + 1.5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `500 ${minSide(f) * 0.022}px ${style.accentFont}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(fmt(f.timeSec), col.x, y + 10);
  ctx.textAlign = "right";
  ctx.fillText(fmt(f.songEnd), col.x + col.w, y + 10);
  ctx.restore();
}

/** Count-in before the first line: a ring that closes as the lyrics approach. */
function drawIntro(f: LookFrame, amount: number): void {
  if (f.line || f.timeSec < 0.3) return;
  const { ctx, style } = f;
  const col = layout(f).column;
  const s = minSide(f) * 0.04;
  const top = titleBottom(f, col) + s * 1.8;
  const cx = isPortrait(f) ? col.x + col.w / 2 : col.x + s;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.strokeStyle = withAlpha(style.textColor, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, top, s, -Math.PI / 2, -Math.PI / 2 + ((f.timeSec % 2) / 2) * Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = style.textColor;
  ctx.font = `700 ${s}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", cx, top);
  ctx.restore();
}

function letterboxH(f: LookFrame): number {
  return amt(f, "letterbox") > 0 && !isPortrait(f) ? f.H * 0.085 : 0;
}

function overlay(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  // Title, sound line and play bar belong to this theme's own layout, so they stay off when mixed in
  if (!f.mixed) {
    const title = amt(f, "title");
    if (title > 0) {
      const col = layout(f).column;
      const mid = { x: col.x + col.w / 2, y: col.y + minSide(f) * 0.07 };
      withMoved(f, "title", mid, () => drawTitle(f, title));
    }
    const wave = amt(f, "wave");
    if (wave > 0) drawWave(f, wave);
    const progress = amt(f, "progress");
    if (progress > 0) drawProgress(f, progress);
    const intro = amt(f, "intro");
    if (intro > 0) drawIntro(f, intro);
  }
  // White flash on accented words, like the classic flash frames
  const flash = amt(f, "flash");
  if (flash > 0 && f.line) {
    const hit = f.line.words.some((w) => {
      const e = f.lineElapsed - w.startOffset;
      return w.isAccent && e >= 0 && e < 0.12;
    });
    if (hit) {
      ctx.save();
      ctx.fillStyle = withAlpha(style.textColor, 0.35 * flash);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  const bar = letterboxH(f);
  if (bar > 0) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
}

export const albumJacket: LookRenderer = {
  scene,
  lyrics,
  overlay,
  decor,
  letterbox: (f) => letterboxH(f) > 0,
};
