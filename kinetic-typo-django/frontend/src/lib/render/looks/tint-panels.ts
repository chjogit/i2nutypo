import { easeOutExpo } from "../easing";
import { drawImageRect } from "./illustration";
import {
  amt,
  clampLeft,
  drawCharacterLayer,
  drawGrain,
  drawIllustration,
  drawVignette,
  fadeIn,
  isPortrait,
  lineExit,
  lyricMargin,
  lyricRegion,
  minSide,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { hash01, hashSigned, withAlpha } from "./noise";
import { fitScale, wrapText } from "../wrap";

// B. Tint panels: illustration washed in one hue, shattered into window panels on some lines, light beams and sparkles.

/** Placeholder city of glowing towers for when no illustration is loaded. */
function drawPlaceholderCity(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, style.bgColor);
  g.addColorStop(1, withAlpha(style.accentColor, 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const drift = f.timeSec * 6 * f.style.illustration.motion;
  for (let i = 0; i < 18; i++) {
    const w = W * (0.04 + hash01(i, 1) * 0.06);
    const h = H * (0.25 + hash01(i, 2) * 0.6);
    const x =
      ((((hash01(i, 3) * W * 1.2 - drift * (0.5 + hash01(i, 4))) % (W * 1.2)) + W * 1.2) % (W * 1.2)) -
      W * 0.1;
    const tower = ctx.createLinearGradient(0, H - h, 0, H);
    tower.addColorStop(0, withAlpha(style.secondaryColor, 0.05));
    tower.addColorStop(1, withAlpha(style.secondaryColor, 0.35 + hash01(i, 5) * 0.3));
    ctx.fillStyle = tower;
    ctx.fillRect(x, H - h, w, h);
  }
}

/** Diagonal light beams. */
function drawBeams(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const beams = amt(f, "beams");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < (beams > 0 ? 3 : 0); i++) {
    const phase = f.timeSec * 0.05 + i * 0.37;
    const x = ((phase % 1) * 1.6 - 0.3) * W;
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(-0.42);
    const bw = W * (0.03 + 0.03 * i);
    const beam = ctx.createLinearGradient(-bw, 0, bw, 0);
    const a = (0.18 + f.energy * 0.2) * beams * 1.6;
    beam.addColorStop(0, "rgba(255,255,255,0)");
    beam.addColorStop(0.5, withAlpha(style.secondaryColor, a));
    beam.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(-bw, -H * 0.5, bw * 2, H * 2.2);
    ctx.restore();
  }
  ctx.restore();
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const dest = { x: 0, y: 0, w: W, h: H };
  const src = drawIllustration(f, dest);
  if (!src) drawPlaceholderCity(f);

  // One-hue wash: "color" keeps the drawing's light and dark but swaps its hues
  ctx.save();
  ctx.globalCompositeOperation = "color";
  const wash = amt(f, "wash");
  ctx.fillStyle = withAlpha(style.accentColor, wash);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = withAlpha(style.bgColor, wash * 0.45);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Every other line opens on the image split into window panels
  const img = f.images.background;
  const panels = amt(f, "panels");
  if (img && src && panels > 0 && f.line && f.line.index % 2 === 1 && f.lineElapsed < 1.2) {
    const t = easeOutExpo(Math.min(1, f.lineElapsed / 0.9));
    const out = f.lineElapsed > 0.9 ? (f.lineElapsed - 0.9) / 0.3 : 0;
    ctx.save();
    ctx.fillStyle = withAlpha(style.bgColor, 0.9 * panels * (1 - out));
    ctx.fillRect(0, 0, W, H);
    const cols = 3;
    const rows = 3;
    const gx = W * 0.08;
    const gy = H * 0.12;
    const cw = (W * 0.5) / cols;
    const ch = (H * 0.7) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c + f.line.index * 9;
        if (hash01(k, 1) < 0.18 + (1 - panels) * 0.5) continue;
        const dx = gx + c * cw;
        const dy = gy + r * ch;
        const off = (1 - t) * W * 0.06 * hashSigned(k, 2);
        const tile = {
          x: dx + off + 3,
          y: dy + 3 - (1 - t) * H * 0.04 * hashSigned(k, 3),
          w: cw - 6,
          h: ch - 6,
        };
        // Each tile shows the same part of the picture it covers on screen
        const sub = {
          x: src.x + (dx / W) * src.w,
          y: src.y + (dy / H) * src.h,
          w: (cw / W) * src.w,
          h: (ch / H) * src.h,
        };
        ctx.globalAlpha = (1 - out) * (0.6 + 0.4 * t);
        drawImageRect(ctx, img, sub, tile);
        ctx.strokeStyle = withAlpha(style.secondaryColor, 0.5);
        ctx.lineWidth = 1;
        ctx.strokeRect(tile.x, tile.y, tile.w, tile.h);
      }
    }
    ctx.restore();
  }

  drawBeams(f);

  drawCharacterLayer(f, { bounce: f.energy * 0.5, tilt: 0 });
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, style } = f;
  const { rect: area } = lyricRegion(
    f,
    isPortrait(f)
      ? [1, 2, 5, 6, 9, 10, 13, 14, 0, 3]
      : [3, 7, 2, 6, 1, 5, 0, 4, 11, 10, 9, 8, 15, 14, 13, 12],
  );
  let size = minSide(f) * 0.075 * style.fontScale * Math.min(1, area.w / (f.W * 0.42));
  // Left-aligned block: keep both edges on screen after the lyric shift
  const maxW = Math.min(area.w * 0.84, f.W - lyricMargin(f) * 2);
  const x0 = clampLeft(f, area.x + area.w * 0.08, maxW);
  const exit = lineExit(f, 0.08);

  ctx.save();
  ctx.font = `900 ${size}px ${style.mainFont}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const rows: Array<Array<{ text: string; w: number; e: number; accent: boolean }>> = [[]];
  let rowW = 0;
  const measure = (t: string) => ctx.measureText(t).width;
  // Shrink so the widest word or spaced phrase fits whole
  size *= fitScale(line.cleanText, maxW, measure);
  ctx.font = `900 ${size}px ${style.mainFont}`;
  for (const w of line.words) {
    // Cut between characters only if a word still does not fit
    const pieces = measure(w.text) > maxW ? wrapText(w.text, maxW, measure) : [w.text];
    pieces.forEach((text, k) => {
      const width = measure(text);
      const forced = k > 0 || (k === 0 && w.breakBefore);
      if ((forced || rowW + width > maxW) && rows[rows.length - 1].length) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1].push({ text, w: width, e: f.lineElapsed - w.startOffset, accent: w.isAccent });
      rowW += width + size * 0.2;
    });
  }
  const rowH = size * 1.3;
  let y = area.y + area.h / 2 - ((rows.length - 1) * rowH) / 2;
  y = Math.max(size * 1.2, Math.min(y, f.H * (f.subtitleVisible ? 0.74 : 0.9) - (rows.length - 1) * rowH));

  // Small UI tag above the block
  ctx.save();
  ctx.font = `600 ${size * 0.2}px ${style.accentFont}`;
  ctx.fillStyle = withAlpha(style.secondaryColor, 0.85 * exit);
  ctx.fillText(
    `#${String(line.index + 1).padStart(2, "0")}  ////  ${f.timeSec.toFixed(2)}s`,
    x0,
    y - size * 0.9,
  );
  ctx.fillRect(x0, y - size * 0.68, maxW * 0.4 * fadeIn(f.lineElapsed, 0.4), 1.5);
  ctx.restore();

  for (const row of rows) {
    let x = x0;
    for (const it of row) {
      if (it.e >= 0) {
        const t = easeOutExpo(Math.min(1, it.e / 0.35));
        const jitter =
          it.e < 0.12 ? hashSigned(Math.floor(f.timeSec * 30), it.text.length) * size * 0.08 * f.glitch : 0;
        ctx.globalAlpha = t * exit;
        ctx.fillStyle = it.accent ? style.secondaryColor : style.textColor;
        ctx.shadowColor = withAlpha(style.accentColor, 0.8);
        ctx.shadowBlur = size * 0.5 * amt(f, "glow");
        ctx.fillText(it.text, x + (1 - t) * size * 0.6 + jitter, y);
      }
      x += it.w + size * 0.2;
    }
    y += rowH;
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const { ctx, W, H } = f;
  // Twinkling four-point sparkles
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sparkles = Math.round(40 * amt(f, "sparkles"));
  for (let i = 0; i < sparkles; i++) {
    const tw = 0.5 + 0.5 * Math.sin(f.timeSec * (1.5 + hash01(i, 2) * 2) + i);
    const x = hash01(i, 3) * W;
    const y = ((((hash01(i, 4) - f.timeSec * 0.004 * (1 + hash01(i, 5))) % 1) + 1) % 1) * H;
    const r = minSide(f) * (0.004 + hash01(i, 6) * 0.01) * tw;
    ctx.fillStyle = `rgba(255,255,255,${0.5 * tw})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2);
    ctx.lineTo(x + r * 0.35, y);
    ctx.lineTo(x, y + r * 2);
    ctx.lineTo(x - r * 0.35, y);
    ctx.closePath();
    ctx.moveTo(x - r * 2, y);
    ctx.lineTo(x, y + r * 0.35);
    ctx.lineTo(x + r * 2, y);
    ctx.lineTo(x, y - r * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const vignette = amt(f, "vignette");
  if (vignette > 0) {
    drawVignette(f, 0.9 * vignette);
    drawGrain(f, 0.7 * vignette);
  }
}

export const tintPanels: LookRenderer = { scene, lyrics, overlay, decor: drawBeams };
