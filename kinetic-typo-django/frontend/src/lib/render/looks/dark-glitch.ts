import { drawScenery } from "./scenery";
import { drawImageBand, type Rect } from "./illustration";
import { drawVerticalColumn, lineGlyphs, splitColumns } from "./glyphs";
import { cellRect, GRID, pickCell, pickColumn } from "./layout";
import {
  amt,
  boxHeight,
  boxWidth,
  clampLeft,
  drawCharacterLayer,
  drawGrain,
  drawIllustration,
  drawVignette,
  fadeIn,
  fitWidth,
  isPortrait,
  lineExit,
  minSide,
  withMoved,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { hash01, hashSigned, withAlpha } from "./noise";
import { revealRows } from "./words";
import { fitScale, wrapText } from "../wrap";

// F. Dark glitch: black field, desaturated centered art, band displacement on beats, scattered "[ lyric ]".

/** True on frames that should glitch: the start of each word and strong beats. */
function glitchAmount(f: LookFrame): number {
  let a = f.energy > 0.6 ? (f.energy - 0.6) * 2.5 : 0;
  if (f.line) {
    for (const w of f.line.words) {
      const e = f.lineElapsed - w.startOffset;
      if (e >= 0 && e < 0.08) a = Math.max(a, w.isAccent ? 1 : 0.6);
    }
  }
  return Math.min(1, a * f.glitch);
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  ctx.fillStyle = style.bgColor;
  ctx.fillRect(0, 0, W, H);
  const dest: Rect = isPortrait(f)
    ? { x: 0, y: H * 0.15, w: W, h: H * 0.7 }
    : { x: W * 0.15, y: 0, w: W * 0.7, h: H };

  ctx.save();
  ctx.filter = `saturate(${(1 - amt(f, "desat")).toFixed(2)}) contrast(1.1)`;
  const src = drawIllustration(f, dest);
  ctx.filter = "none";
  if (!src) {
    // Prism orb placeholder
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, minSide(f) * 0.4);
    g.addColorStop(0, withAlpha(style.accentColor, 0.9));
    g.addColorStop(0.5, withAlpha(style.secondaryColor, 0.25));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawScenery(f, { x: 0, y: 0, w: W, h: H });
  }
  ctx.restore();

  // Fade the picture edges into black
  const fade = ctx.createRadialGradient(
    W / 2,
    H / 2,
    minSide(f) * 0.25,
    W / 2,
    H / 2,
    Math.max(dest.w, dest.h) * 0.62,
  );
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, style.bgColor);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  drawCharacterLayer(f, { bounce: f.energy * 0.4, tilt: 0 });

  const g = glitchAmount(f);
  const img = f.images.background;
  const bandAmt = amt(f, "bands");
  if (g > 0 && bandAmt > 0 && img && src) {
    const frame = Math.floor(f.timeSec * 30);
    const bands = 1 + Math.round(g * 8 * bandAmt);
    for (let i = 0; i < bands; i++) {
      const by = dest.y + hash01(frame, i) * dest.h;
      const bh = H * (0.01 + hash01(frame, i + 40) * 0.06);
      drawImageBand(ctx, img, src, dest, by, bh, hashSigned(frame, i + 80) * W * 0.08 * g * bandAmt);
    }
  }
  drawBlocks(f, g);
}

/** White pixel blocks near the center on glitch frames. */
function drawBlocks(f: LookFrame, g = glitchAmount(f)): void {
  const { ctx, W, H } = f;
  const blocks = amt(f, "blocks");
  if (g > 0 && blocks > 0) {
    const frame = Math.floor(f.timeSec * 30);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < Math.round(g * 16 * blocks); i++) {
      const s = minSide(f) * (0.01 + hash01(frame, i + 120) * 0.035);
      ctx.fillRect(
        W * (0.35 + hash01(frame, i + 140) * 0.3),
        H * (0.2 + hash01(frame, i + 160) * 0.6),
        s,
        s * 0.6,
      );
    }
  }
}

/** Where a line's bracketed text sits: a free cell picked per line, so lines hop around the screen. */
function anchorFor(f: LookFrame, index: number): { x: number; y: number; align: CanvasTextAlign } {
  const base = isPortrait(f) ? [1, 4, 7, 5, 10, 13] : [5, 4, 7, 2, 10, 13];
  const k = Math.floor(hash01(index, 5) * base.length);
  const cell = pickCell(f.blocked, [...base.slice(k), ...base.slice(0, k)]);
  const r = cellRect(f.W, f.H, cell);
  const col = cell % GRID;
  const pad = f.W * 0.04;
  const row = Math.floor(cell / GRID);
  const y = row === GRID - 1 && f.subtitleVisible ? f.H * 0.6 : r.y + r.h / 2;
  if (col === 0) return { x: r.x + pad, y, align: "left" };
  if (col === GRID - 1) return { x: r.x + r.w - pad, y, align: "right" };
  return { x: r.x + r.w / 2, y, align: "center" };
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const exit = lineExit(f, 0.06);
  const glyphs = lineGlyphs(line, f.lineElapsed);
  const g = glitchAmount(f);
  const rgb = amt(f, "rgb") * 4 * f.glitch;

  ctx.save();
  ctx.textBaseline = "middle";
  if (line.isBigLine) {
    // Big lines stand vertically in the middle, accent words larger
    const size = minSide(f) * 0.075 * style.fontScale;
    ctx.font = `900 ${size}px ${style.mainFont}`;
    ctx.textAlign = "center";
    const topY = H * (f.subtitleTop ? 0.3 : 0.15);
    const cols = splitColumns(glyphs, size, Math.min(H * 0.95 - topY, (H * 0.85 - topY) * boxHeight(f)));
    const centerX = (f.W / GRID) * (pickColumn(f.blocked, [1, 2, 0, 3]) + 0.5);
    const step = size * 1.4 * boxWidth(f);
    const spanW = (cols.length - 1) * step;
    // Centered on the column, but never off screen after the lyric shift
    let x = clampLeft(f, centerX - spanW / 2 - size / 2, spanW + size) + spanW + size / 2;
    for (const col of cols) {
      drawVerticalColumn(ctx, col, x, topY, size, (gl) => {
        const a = fadeIn(gl.wElapsed, 0.08) * exit;
        if (a <= 0) return;
        const jx =
          gl.wElapsed < 0.15
            ? hashSigned(Math.floor(f.timeSec * 30), gl.wordIndex) * size * 0.15 * f.glitch
            : 0;
        if (rgb > 0) {
          ctx.fillStyle = `rgba(255,40,90,${0.7 * a})`;
          ctx.fillText(gl.ch, jx - rgb, 0);
          ctx.fillStyle = `rgba(40,200,255,${0.7 * a})`;
          ctx.fillText(gl.ch, jx + rgb, 0);
        }
        ctx.fillStyle = withAlpha(style.textColor, a);
        ctx.fillText(gl.ch, jx, 0);
      });
      x -= step;
    }
  } else {
    const maxW = fitWidth(f, f.W * 0.7);
    let size = minSide(f) * 0.04 * style.fontScale;
    ctx.font = `700 ${size}px ${style.mainFont}`;
    // Words and spaced phrases shrink to fit whole rather than being cut
    size *= fitScale(line.cleanText, maxW, (t) => ctx.measureText(t).width);
    ctx.font = `700 ${size}px ${style.mainFont}`;
    const anchor = anchorFor(f, line.index);
    ctx.textAlign = "left";
    let shown = "";
    for (const gl of glyphs) if (gl.wElapsed >= 0) shown += gl.ch;
    const full = `[ ${line.cleanText} ]`;
    const rows = wrapText(full, maxW, (t) => ctx.measureText(t).width);
    const complete = shown.length >= line.cleanText.length;
    // "[ " plus what has been sung, plus " ]" once the line is complete
    const visible = revealRows(rows, 2 + shown.length + (complete ? 2 : 0), true);
    const rowH = size * 1.4 * boxHeight(f);
    const jx = g > 0 ? hashSigned(Math.floor(f.timeSec * 30), 9) * size * 0.3 * g : 0;
    const passes: Array<[string, number]> = [[withAlpha(style.textColor, exit), 0]];
    if (rgb > 0)
      passes.unshift([`rgba(255,40,90,${0.6 * exit})`, -rgb], [`rgba(40,200,255,${0.6 * exit})`, rgb]);
    rows.forEach((row, r) => {
      const rowW = ctx.measureText(row).width;
      // Pulled back on screen when the lyric shift would push it off
      const left = clampLeft(
        f,
        anchor.align === "left" ? anchor.x : anchor.align === "right" ? anchor.x - rowW : anchor.x - rowW / 2,
        rowW,
      );
      const y = anchor.y + (r - (rows.length - 1) / 2) * rowH;
      for (const [col, dx] of passes) {
        ctx.fillStyle = col;
        ctx.fillText(visible[r], left + jx + dx, y);
      }
    });
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  // Prism streaks
  const prism = amt(f, "prism");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, prism * 1.6);
  for (let i = 0; i < (prism > 0 ? 3 : 0); i++) {
    const x = W * (0.2 + hash01(i, 1) * 0.6) + Math.sin(f.timeSec * 0.3 + i) * W * 0.05;
    const y = H * (0.2 + hash01(i, 2) * 0.6);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5 + hash01(i, 3));
    const len = s * (0.15 + f.energy * 0.1);
    const g = ctx.createLinearGradient(-len, 0, len, 0);
    g.addColorStop(0, "rgba(255,0,80,0)");
    g.addColorStop(0.35, "rgba(255,60,120,0.35)");
    g.addColorStop(0.5, "rgba(255,255,255,0.5)");
    g.addColorStop(0.65, "rgba(60,200,255,0.35)");
    g.addColorStop(1, "rgba(0,120,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-len, -s * 0.006, len * 2, s * 0.012);
    ctx.restore();
  }
  ctx.restore();

  // Bubbles drifting up
  ctx.save();
  ctx.strokeStyle = withAlpha(style.accentColor, 0.35);
  const bubbles = Math.round(36 * amt(f, "bubbles"));
  for (let i = 0; i < bubbles; i++) {
    const x = hash01(i, 1) * W + Math.sin(f.timeSec + i) * 6;
    const y = ((((hash01(i, 2) - f.timeSec * 0.015 * (0.5 + hash01(i, 3))) % 1) + 1) % 1) * H;
    ctx.beginPath();
    ctx.arc(x, y, s * (0.004 + hash01(i, 4) * 0.012), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Left sidebar: rule and vertical caption
  const sx = W * 0.03;
  withMoved(f, "sidebar", { x: sx, y: H / 2 }, () => drawSidebar(f, sx));

  const grain = amt(f, "grain");
  if (grain > 0) {
    drawVignette(f, 0.85 * grain);
    drawGrain(f, 0.85 * grain);
  }
}

/** Left rule with a vertical caption. */
function drawSidebar(f: LookFrame, sx: number): void {
  const { ctx, H, style } = f;
  const s = minSide(f);
  ctx.save();
  ctx.globalAlpha = amt(f, "sidebar");
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(sx, H * 0.06, 1, H * 0.88);
  ctx.font = `600 ${s * 0.014}px ${style.accentFont}`;
  ctx.translate(sx + s * 0.018, H * 0.08);
  ctx.rotate(Math.PI / 2);
  ctx.textBaseline = "middle";
  const n = f.line ? String(f.line.index + 1).padStart(2, "0") : "--";
  ctx.fillText(`ERROR // LYRIC ${n} // ${f.timeSec.toFixed(2)}`, 0, 0);
  ctx.restore();
}

export const darkGlitch: LookRenderer = { scene, lyrics, overlay, decor: (f) => drawBlocks(f) };
