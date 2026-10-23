import { drawVerticalColumn, lineGlyphs, splitColumns } from "./glyphs";
import { GRID, pickColumn } from "./layout";
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
  isPortrait,
  lineExit,
  minSide,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { hash01, withAlpha } from "./noise";

// D. Cinematic fantasy: scope letterbox, warm gold grade, halo ring and star flare, rising lanterns, vertical lyrics.

function barHeight(f: LookFrame): number {
  const { W, H } = f;
  if (amt(f, "letterbox") <= 0) return 0;
  return isPortrait(f) ? H * 0.1 : Math.max(0, (H - W / 2.35) / 2);
}

/** Two layers of mountain silhouettes drifting at different speeds (placeholder only). */
function drawRidge(
  f: LookFrame,
  seed: number,
  baseY: number,
  amp: number,
  speed: number,
  color: string,
): void {
  const { ctx, W, H } = f;
  const shift = f.timeSec * speed * f.style.illustration.motion;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const k = Math.floor(u * 8 + (shift / W) * 8);
    const peak = hash01(seed, k) * 0.7 + 0.3 * Math.sin((u * 8 + (shift / W) * 8) * Math.PI);
    ctx.lineTo(u * W, baseY - Math.abs(peak) * amp);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  if (!drawIllustration(f, { x: 0, y: 0, w: W, h: H })) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, style.bgColor);
    sky.addColorStop(0.65, withAlpha(style.secondaryColor, 0.55));
    sky.addColorStop(1, withAlpha(style.accentColor, 0.9));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,240,210,${0.2 + 0.6 * hash01(i, 9) * (0.6 + 0.4 * Math.sin(f.timeSec * 2 + i))})`;
      ctx.fillRect(hash01(i, 1) * W, hash01(i, 2) * H * 0.6, 1.6, 1.6);
    }
    drawRidge(f, 1, H * 0.78, H * 0.35, 8, "rgba(40,22,10,0.85)");
    drawRidge(f, 2, H * 0.95, H * 0.3, 20, "rgba(14,8,4,0.95)");
  }

  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.3, tilt: Math.sin(f.timeSec * 0.5) * 0.015 });
}

/** Warm gold grade, then the halo. */
function decor(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = withAlpha(style.accentColor, 0.8 * amt(f, "grade"));
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  drawHalo(f);
}

/** Halo ring and star flare at the upper center, breathing with the beat. */
function drawHalo(f: LookFrame): void {
  const halo = amt(f, "halo");
  if (halo <= 0) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);

  const cx = W / 2;
  const cy = H * 0.42;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, halo * 1.6);
  const ringR = s * 0.42;
  ctx.lineWidth = 2;
  ctx.strokeStyle = withAlpha(style.accentColor, 0.55);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, Math.PI * 0.62 + f.timeSec * 0.05, Math.PI * 2.38 + f.timeSec * 0.05);
  ctx.stroke();
  const flare = s * (0.06 + 0.1 * halo + f.energy * 0.05);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, flare * 1.6);
  glow.addColorStop(0, "rgba(255,250,235,0.95)");
  glow.addColorStop(0.25, withAlpha(style.accentColor, 0.55));
  glow.addColorStop(1, withAlpha(style.accentColor, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - flare * 2, cy - flare * 2, flare * 4, flare * 4);
  ctx.strokeStyle = "rgba(255,248,230,0.8)";
  for (const [len, w] of [
    [flare * 3.2, 1.5],
    [flare * 1.2, 1],
  ] as const) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(cx - len, cy);
    ctx.lineTo(cx + len, cy);
    ctx.moveTo(cx, cy - len);
    ctx.lineTo(cx, cy + len);
    ctx.stroke();
  }
  ctx.restore();
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, W, H, style } = f;
  const bar = barHeight(f);
  const size = minSide(f) * 0.05 * style.fontScale;
  const top = bar + H * (f.subtitleTop ? 0.25 : 0.08);
  const colH = Math.min(
    H - top - bar - size,
    (H - top - bar - H * (f.subtitleVisible && isPortrait(f) ? 0.22 : 0.08)) * boxHeight(f),
  );
  const cols = splitColumns(lineGlyphs(line, f.lineElapsed), size, colH);
  const exit = lineExit(f, 0.1);
  // Columns run right to left from the right side of the most open screen column, as in vertical Japanese
  const col = pickColumn(f.blocked, [3, 0, 2, 1]);
  let x = (W / GRID) * col + (W / GRID) * (isPortrait(f) ? 0.7 : 0.72);
  // Keep every column on screen after the lyric shift
  const step = size * 1.5 * boxWidth(f);
  const spanW = (cols.length - 1) * step;
  x = clampLeft(f, x - spanW - size / 2, spanW + size) + spanW + size / 2;
  ctx.save();
  ctx.font = `800 ${size}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = withAlpha(style.accentColor, 0.9);
  ctx.shadowBlur = size * 1.1 * amt(f, "glow");
  let n = 0;
  for (const col of cols) {
    drawVerticalColumn(ctx, col, x, top, size, (g) => {
      const a = fadeIn(g.wElapsed - (n++ % 8) * 0.04, 0.4) * exit;
      if (a <= 0) return;
      ctx.fillStyle = withAlpha(g.isAccent ? style.accentColor : style.textColor, a);
      ctx.fillText(g.ch, 0, 0);
    });
    x -= step;
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  // Lanterns rising and swaying
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const lanterns = Math.round(45 * amt(f, "lanterns"));
  for (let i = 0; i < lanterns; i++) {
    const depth = 0.4 + hash01(i, 1) * 0.6;
    const speed = 0.012 + 0.02 * depth;
    const y = (1.15 - ((hash01(i, 2) + f.timeSec * speed) % 1.3)) * H;
    const x = hash01(i, 3) * W + Math.sin(f.timeSec * 0.7 + i) * s * 0.01;
    const r = s * 0.012 * depth;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(255,214,150,${0.9 * depth})`);
    g.addColorStop(0.35, withAlpha(style.secondaryColor, 0.5 * depth));
    g.addColorStop(1, withAlpha(style.secondaryColor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.fillStyle = `rgba(255,230,190,${0.85 * depth})`;
    ctx.fillRect(x - r * 0.6, y - r, r * 1.2, r * 1.6);
  }
  ctx.restore();

  const vignette = amt(f, "vignette");
  if (vignette > 0) {
    drawVignette(f, vignette, "20,8,0");
    drawGrain(f, 0.75 * vignette);
  }
  const bar = barHeight(f);
  if (bar > 0) {
    ctx.fillStyle = `rgba(0,0,0,${amt(f, "letterbox")})`;
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
}

export const cinematicFantasy: LookRenderer = {
  scene,
  lyrics,
  overlay,
  decor,
  letterbox: (f) => barHeight(f) > 0,
};
