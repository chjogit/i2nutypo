import { fitGlyphRows, lineGlyphs } from "./glyphs";
import {
  amt,
  boxHeight,
  clampCenter,
  drawCharacterLayer,
  drawGrain,
  drawIllustration,
  drawVignette,
  fadeIn,
  fitWidth,
  lineExit,
  lyricMargin,
  lyricRegion,
  minSide,
  rowLimit,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { hash01, withAlpha } from "./noise";

// J. Eclipse nebula: a black void with drifting nebula haze and stars, a glowing eclipse ring behind the
// character, violet and gold flare streaks, and thin serif lyrics set with wide tracking.

/** Center and radius of the eclipse: behind the character's head, else upper middle. */
function eclipse(f: LookFrame): { x: number; y: number; r: number } {
  const c = f.charRect;
  if (c) return { x: c.x + c.w / 2, y: c.y + c.h * 0.28, r: Math.max(c.w * 0.55, minSide(f) * 0.16) };
  return { x: f.W / 2, y: f.H * 0.4, r: minSide(f) * 0.24 };
}

function drawNebula(f: LookFrame): void {
  const nebula = amt(f, "nebula");
  if (nebula <= 0) return;
  const { ctx, W, H, style } = f;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 4; i++) {
    const cx = W * (0.2 + hash01(i, 1) * 0.6) + Math.sin(f.timeSec * 0.05 + i) * W * 0.05;
    const cy = H * (0.2 + hash01(i, 2) * 0.6) + Math.cos(f.timeSec * 0.04 + i) * H * 0.05;
    const r = Math.max(W, H) * (0.3 + hash01(i, 3) * 0.25);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(i % 2 ? style.accentColor : style.secondaryColor, 0.22 * nebula));
    g.addColorStop(1, withAlpha(style.accentColor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawStars(f: LookFrame): void {
  const stars = Math.round(160 * amt(f, "stars"));
  if (stars <= 0) return;
  const { ctx, W, H } = f;
  ctx.save();
  for (let i = 0; i < stars; i++) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(f.timeSec * (0.6 + hash01(i, 3) * 1.8) + i));
    const big = hash01(i, 4) > 0.93;
    ctx.fillStyle = `rgba(255,250,240,${(big ? 0.9 : 0.55) * tw})`;
    const x = hash01(i, 1) * W;
    const y = hash01(i, 2) * H;
    const r = big ? 1.6 : 0.9;
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
    if (big) {
      ctx.fillRect(x - r * 3, y - 0.3, r * 6, 0.6);
      ctx.fillRect(x - 0.3, y - r * 3, 0.6, r * 6);
    }
  }
  ctx.restore();
}

/** Black disk with a burning rim. Mixed over another theme only the rim is drawn, so it never hides the picture. */
function drawRing(f: LookFrame): void {
  const ring = amt(f, "ring");
  if (ring <= 0) return;
  const { ctx, W, H, style } = f;
  const { x, y, r } = eclipse(f);
  const pulse = 1 + f.energy * 0.08;
  ctx.save();
  // Only outside the disk: a gradient fills its inside with the first stop's color
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.globalCompositeOperation = "lighter";
  const corona = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * (1.9 + ring) * pulse);
  corona.addColorStop(0, withAlpha(style.secondaryColor, 0.85 * ring));
  corona.addColorStop(0.2, withAlpha(style.accentColor, 0.45 * ring));
  corona.addColorStop(1, withAlpha(style.accentColor, 0));
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = Math.max(1.5, r * 0.03);
  ctx.strokeStyle = `rgba(255,246,225,${Math.min(1, 1.2 * ring)})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (!f.mixed) {
    ctx.save();
    ctx.fillStyle = style.bgColor;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.985, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function decor(f: LookFrame): void {
  drawNebula(f);
  drawStars(f);
  drawRing(f);
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  ctx.fillStyle = style.bgColor;
  ctx.fillRect(0, 0, W, H);
  if (f.images.background) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawIllustration(f, { x: 0, y: 0, w: W, h: H });
    ctx.restore();
  }
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.3, tilt: Math.sin(f.timeSec * 0.4) * 0.01 });
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const big = line.isBigLine;
  const { rect: area } = lyricRegion(
    f,
    big ? [9, 10, 5, 6, 13, 14, 1, 2] : [13, 14, 9, 10, 5, 6, 1, 2, 12, 15, 8, 11],
  );
  let size = minSide(f) * (big ? 0.065 : 0.05) * style.fontScale;
  const exit = lineExit(f, 0.12);
  const glyphs = lineGlyphs(line, f.lineElapsed);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const fit = fitGlyphRows(
    ctx,
    glyphs,
    size,
    (px) => {
      ctx.font = `700 ${px}px ${style.mainFont}`;
    },
    0.45,
    fitWidth(f, area.w * 0.9),
    rowLimit(f, 3),
  );
  size = fit.size;
  // Pulled back on screen when the lyric shift would push it off
  const cx = clampCenter(f, area.x + area.w / 2, Math.max(0, ...fit.rowWidths));
  const rowH = size * 1.7 * boxHeight(f);
  const lowY = f.subtitleVisible ? H * 0.74 : H * 0.88;
  const y0 = Math.min(area.y + area.h / 2, lowY) - ((fit.rows.length - 1) * rowH) / 2;
  const glow = amt(f, "glow");
  ctx.shadowColor = withAlpha(style.accentColor, 0.9);
  ctx.shadowBlur = size * 0.8 * glow;

  // Thin rules on both sides of the first row, drawn out with the first word
  const rule = fadeIn(f.lineElapsed, 0.6) * exit;
  if (rule > 0 && fit.rows.length > 0) {
    const left = cx - fit.rowWidths[0] / 2;
    ctx.fillStyle = withAlpha(style.secondaryColor, 0.7 * rule);
    const len = Math.min(size * 1.6, Math.max(0, left - size * 0.6 - lyricMargin(f) + f.lyricShift.x)) * rule;
    ctx.fillRect(left - size * 0.6 - len, y0, len, 1);
    ctx.fillRect(left + fit.rowWidths[0] + size * 0.6, y0, len, 1);
  }
  fit.rows.forEach((row, r) => {
    let x = cx - fit.rowWidths[r] / 2;
    for (const i of row) {
      const g = glyphs[i];
      // Each glyph surfaces from the dark, slightly late after the one before
      const a = fadeIn(g.wElapsed - (i % 8) * 0.03, 0.5) * exit;
      if (a > 0) {
        ctx.fillStyle = withAlpha(g.isAccent ? style.secondaryColor : style.textColor, a);
        ctx.fillText(g.ch, x, y0 + r * rowH);
      }
      x += fit.widths[i];
    }
  });
  ctx.restore();
}

/** Horizontal anamorphic streak through the eclipse, gold at the core and violet at the tips. */
function drawFlare(f: LookFrame): void {
  const flare = amt(f, "flare");
  if (flare <= 0) return;
  const { ctx, W, style } = f;
  const { x, y, r } = eclipse(f);
  const fy = y - r * 0.72;
  const fx = x + r * 0.7;
  const len = W * (0.35 + 0.25 * flare + f.energy * 0.1);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(fx - len, 0, fx + len, 0);
  g.addColorStop(0, withAlpha(style.accentColor, 0));
  g.addColorStop(0.4, withAlpha(style.accentColor, 0.35 * flare));
  g.addColorStop(0.5, `rgba(255,248,230,${0.9 * flare})`);
  g.addColorStop(0.6, withAlpha(style.accentColor, 0.35 * flare));
  g.addColorStop(1, withAlpha(style.accentColor, 0));
  ctx.fillStyle = g;
  ctx.fillRect(fx - len, fy - 1.5, len * 2, 3);
  const core = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 0.35);
  core.addColorStop(0, `rgba(255,250,235,${0.95 * flare})`);
  core.addColorStop(0.3, withAlpha(style.secondaryColor, 0.5 * flare));
  core.addColorStop(1, withAlpha(style.secondaryColor, 0));
  ctx.fillStyle = core;
  ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
  ctx.restore();
}

function overlay(f: LookFrame): void {
  drawFlare(f);
  const vignette = amt(f, "vignette");
  if (vignette > 0) {
    drawVignette(f, 0.8 * vignette);
    drawGrain(f, 0.5 * vignette);
  }
}

export const eclipseNebula: LookRenderer = { scene, lyrics, overlay, decor };
