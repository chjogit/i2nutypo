import { fitGlyphRows, lineGlyphs } from "./glyphs";
import {
  amt,
  boxHeight,
  clampCenter,
  drawCharacterLayer,
  drawGrain,
  drawIllustration,
  fadeIn,
  fitWidth,
  isPortrait,
  lineExit,
  lyricRegion,
  minSide,
  rowLimit,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { GRID } from "./layout";
import { hash01, withAlpha } from "./noise";
import type { Rect } from "./illustration";

// C. Ballad HUD: 4:3 pillarbox, washed-out bloom, thin HUD marks, small "- lyric -" and an ink-blot reveal.

/** The 4:3 picture area inside a wide frame; the full frame when portrait, square or with the 4:3 switch off. */
function stage(f: LookFrame): Rect {
  const { W, H } = f;
  if (W / H > 1.4 && amt(f, "pillarbox") > 0) {
    const w = H * (4 / 3);
    return { x: (W - w) / 2, y: 0, w, h: H };
  }
  return { x: 0, y: 0, w: W, h: H };
}

function drawPlaceholderPastel(f: LookFrame, r: Rect): void {
  const { ctx, style } = f;
  const base = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  base.addColorStop(0, style.bgColor);
  base.addColorStop(1, withAlpha(style.accentColor, 1));
  ctx.fillStyle = base;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < 6; i++) {
    const cx = r.x + r.w * (hash01(i, 1) + Math.sin(f.timeSec * 0.1 + i) * 0.05);
    const cy = r.y + r.h * (hash01(i, 2) + Math.cos(f.timeSec * 0.08 + i) * 0.05);
    const rad = Math.max(r.w, r.h) * (0.25 + hash01(i, 3) * 0.3);
    const g = f.ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, withAlpha(i % 2 ? style.accentColor : style.secondaryColor, 0.45));
    g.addColorStop(1, withAlpha(style.bgColor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

/** Blob with a noisy edge, grown from the center like ink soaking into paper. */
function drawInkBlot(f: LookFrame, cx: number, cy: number, radius: number, seed: number): void {
  const { ctx } = f;
  ctx.beginPath();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.78 + 0.22 * hash01(seed, i % n) + 0.08 * Math.sin(a * 5 + seed);
    const x = cx + Math.cos(a) * radius * k * 1.25;
    const y = cy + Math.sin(a) * radius * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Overexposed bloom from the stage's upper left, and a pale lift over everything. */
function drawBloom(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const r = stage(f);
  const bloomAmt = amt(f, "bloom");
  if (bloomAmt > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bx = r.x + r.w * 0.2;
    const by = r.y + r.h * 0.1;
    const bloom = ctx.createRadialGradient(bx, by, 0, bx, by, r.w * 0.9);
    bloom.addColorStop(0, `rgba(255,255,255,${Math.min(1, 1.2 * bloomAmt)})`);
    bloom.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = withAlpha(style.secondaryColor, 0.35 * bloomAmt);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  const r = stage(f);
  if (!drawIllustration(f, full)) drawPlaceholderPastel(f, full);

  drawBloom(f);

  drawCharacterLayer(f, { bounce: f.energy * 0.3, tilt: Math.sin(f.timeSec * 0.6) * 0.01, alpha: 0.95 });

  // Ink blot behind the big lines, centered on where the line is set
  const line = f.line;
  const ink = amt(f, "ink");
  if (line && line.isBigLine && ink > 0) {
    const grow = Math.min(1, f.lineElapsed / 0.8);
    const { x, y } = lyricAnchor(f, true);
    ctx.fillStyle = withAlpha(style.accentColor, ink * lineExit(f, 0.12));
    drawInkBlot(f, x, y, r.h * 0.2 * (1 - Math.pow(1 - grow, 3)), line.index + 1);
  }
}

/** Center of the lyric line: an open cell's row height, centered across the open part of the stage. */
function lyricAnchor(f: LookFrame, big: boolean): { x: number; y: number; w: number } {
  const r = stage(f);
  const { cell, rect } = lyricRegion(f, big ? [5, 6, 9, 10, 1, 2, 13, 14] : [13, 14, 9, 10, 5, 6, 1, 2]);
  const row = Math.floor(cell / GRID);
  const lowY = f.subtitleVisible ? 0.68 : isPortrait(f) ? 0.8 : 0.86;
  const y = r.y + r.h * (row === 0 ? 0.2 : row < GRID - 1 ? (big ? 0.42 : 0.5) : big ? 0.62 : lowY);
  const left = Math.max(r.x, rect.x);
  const right = Math.min(r.x + r.w, rect.x + rect.w);
  return { x: (left + right) / 2, y, w: Math.max(right - left, f.W * 0.2) };
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, style } = f;
  const big = line.isBigLine;
  let size = minSide(f) * (big ? 0.07 : 0.036) * style.fontScale;
  const exit = lineExit(f, 0.1);
  const glyphs = lineGlyphs(line, f.lineElapsed);
  const anchor = lyricAnchor(f, big);
  const y = anchor.y;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Long lines wrap (between words, or characters in Japanese) and shrink to stay inside the open area
  const fit = fitGlyphRows(
    ctx,
    glyphs,
    size,
    (px) => {
      ctx.font = `700 ${px}px ${style.mainFont}`;
    },
    big ? 0.35 : 0.18,
    fitWidth(f, anchor.w * 0.84),
    rowLimit(f, big ? 2 : 3),
  );
  size = fit.size;
  // Pulled back on screen when the lyric shift would push it off (dashes included)
  const dash = !big && fit.rows.length === 1 ? size * 2.4 : 0;
  const cx = clampCenter(f, anchor.x, Math.max(0, ...fit.rowWidths) + dash * 2);
  const rowH = size * 1.6 * boxHeight(f);
  const y0 = y - ((fit.rows.length - 1) * rowH) / 2;

  // A dark halo keeps white text readable on the washed-out picture
  ctx.shadowColor = "rgba(40, 24, 70, 0.75)";
  ctx.shadowBlur = size * 0.6;
  if (!big && fit.rows.length === 1) {
    // "- lyric -" dashes appear with the first word
    const x = cx - fit.rowWidths[0] / 2;
    ctx.fillStyle = withAlpha(style.textColor, 0.8 * fadeIn(f.lineElapsed, 0.3) * exit);
    ctx.fillText("-", x - size * 1.2, y);
    ctx.fillText("-", x + fit.rowWidths[0] + size * 0.8, y);
  }
  fit.rows.forEach((row, r) => {
    let x = cx - fit.rowWidths[r] / 2;
    const ry = y0 + r * rowH;
    for (const i of row) {
      const g = glyphs[i];
      // Characters of a word surface one after another, rising slightly
      const e = g.wElapsed - (i % 6) * 0.025;
      const a = fadeIn(e, 0.35) * exit;
      if (a > 0) {
        ctx.fillStyle = withAlpha(style.textColor, a);
        ctx.fillText(g.ch, x, ry + (1 - a) * size * 0.25);
      }
      x += fit.widths[i];
    }
  });
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const { ctx, W, H } = f;
  const r = stage(f);
  // Side bars of the 4:3 stage; the strength sets how dark they are
  const bars = amt(f, "pillarbox");
  if (r.w < W && bars > 0) {
    ctx.fillStyle = `rgba(0,0,0,${bars})`;
    ctx.fillRect(0, 0, r.x, H);
    ctx.fillRect(r.x + r.w, 0, W - r.x - r.w, H);
  }
  drawHud(f, r);
  drawDust(f, r);
  drawGrain(f, 0.7 * amt(f, "grain"));
}

function drawHud(f: LookFrame, r: Rect): void {
  const hud = amt(f, "hud");
  if (hud <= 0) return;
  const { ctx, style } = f;
  const s = minSide(f);
  const inset = s * 0.05;
  const arm = s * 0.035;
  const line = withAlpha("#ffffff", hud);
  ctx.save();
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = 1;

  // Corner brackets
  const corners: Array<[number, number, number, number]> = [
    [r.x + inset, r.y + inset, 1, 1],
    [r.x + r.w - inset, r.y + inset, -1, 1],
    [r.x + inset, r.y + r.h - inset, 1, -1],
    [r.x + r.w - inset, r.y + r.h - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + arm * sx, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + arm * sy);
    ctx.stroke();
  }

  // Focus ring at top center
  const cx = r.x + r.w / 2;
  ctx.beginPath();
  ctx.arc(cx, r.y + inset * 1.3, s * 0.012, 0, Math.PI * 2);
  ctx.moveTo(cx - s * 0.025, r.y + inset * 1.3);
  ctx.lineTo(cx + s * 0.025, r.y + inset * 1.3);
  ctx.stroke();

  // Line number and timecode at lower left
  const idx = f.line ? f.line.index + 1 : 0;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `400 ${s * 0.032}px ${style.mainFont}`;
  ctx.fillText(`No.${String(idx).padStart(2, "0")}`, r.x + inset * 1.4, r.y + r.h - inset * 1.9);
  ctx.font = `500 ${s * 0.013}px ${style.accentFont}`;
  const mm = Math.floor(f.timeSec / 60);
  const ss = Math.floor(f.timeSec % 60);
  ctx.fillText(
    `LYRIC  ${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}  /  MEMORY`,
    r.x + inset * 1.4,
    r.y + r.h - inset * 1.35,
  );

  // Mini calendar at lower right; today's cell follows the line number
  const cell = s * 0.014;
  const gx = r.x + r.w - inset * 1.4 - cell * 7;
  const gy = r.y + r.h - inset * 1.35 - cell * 5;
  for (let i = 0; i < 35; i++) {
    const x = gx + (i % 7) * cell;
    const y = gy + Math.floor(i / 7) * cell;
    if (idx > 0 && i === (idx - 1) % 35) {
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    } else {
      ctx.fillRect(x + cell / 2 - 0.75, y + cell / 2 - 0.75, 1.5, 1.5);
    }
  }

  // Thin progress rule along the right edge
  const p = f.songEnd > 0 ? Math.min(1, f.timeSec / f.songEnd) : 0;
  const rx = r.x + r.w - inset * 0.6;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(rx, r.y + r.h * 0.25, 1, r.h * 0.5);
  ctx.globalAlpha = 1;
  ctx.fillRect(rx - 2, r.y + r.h * 0.25 + r.h * 0.5 * p - 1, 5, 2);
  ctx.restore();
}

function drawDust(f: LookFrame, r: Rect): void {
  const { ctx } = f;
  const count = Math.round(50 * amt(f, "dust"));
  // Floating dust
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r.x + ((hash01(i, 1) + f.timeSec * 0.006 * (0.5 + hash01(i, 2))) % 1) * r.w;
    const y = r.y + ((((hash01(i, 3) - f.timeSec * 0.01 * (0.5 + hash01(i, 4))) % 1) + 1) % 1) * r.h;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.35 * hash01(i, 5)})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + hash01(i, 6) * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const balladHud: LookRenderer = { scene, lyrics, overlay, decor: drawBloom };
