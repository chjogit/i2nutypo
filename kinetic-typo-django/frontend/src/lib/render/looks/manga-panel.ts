import { amt, drawCharacterLayer, minSide, type LookFrame, type LookRenderer } from "./frame";
import { boil, drawBackdrop, drawWordLyrics, gradientFallback } from "./kit";
import { hash01, withAlpha } from "./noise";

// R. Manga panel: a toned black-and-white page — screentone dots, a slanted panel cut,
// speed lines bursting toward the character on accents, and lyrics in a speech box.

/** Speed lines converging on the frame center; stronger on accented words. */
function drawSpeedLines(f: LookFrame, amount: number): void {
  const { ctx, W, H, style } = f;
  const accent = f.line?.words.some((w) => {
    const e = f.lineElapsed - w.startOffset;
    return w.isAccent && e >= 0 && e < 0.5;
  });
  const k = amount * (accent ? 1 : 0.45);
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.hypot(W, H) * 0.6;
  const frame = Math.floor(f.timeSec * 12);
  ctx.save();
  ctx.fillStyle = withAlpha(style.textColor, 0.7 * k);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + hash01(frame, i) * 0.04;
    const inner = R * (0.45 + hash01(frame, i + 100) * 0.25);
    const w = 0.006 + hash01(i, 3) * 0.01;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.lineTo(cx + Math.cos(a - w) * inner, cy + Math.sin(a - w) * inner);
    ctx.lineTo(cx + Math.cos(a + w) * inner, cy + Math.sin(a + w) * inner);
    ctx.fill();
  }
  ctx.restore();
}

function drawTone(f: LookFrame, amount: number): void {
  const { ctx, W, H } = f;
  const step = minSide(f) * 0.012;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.35 * amount})`;
  for (let y = H * 0.55; y < H; y += step) {
    const r = step * 0.35 * ((y - H * 0.55) / (H * 0.45));
    for (let x = (Math.round(y / step) % 2) * step * 0.5; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function decor(f: LookFrame): void {
  const tone = amt(f, "tone");
  if (tone > 0) drawTone(f, tone);
  const speed = amt(f, "speed");
  if (speed > 0) drawSpeedLines(f, speed);
}

function scene(f: LookFrame): void {
  const ink = amt(f, "ink");
  drawBackdrop(
    f,
    `grayscale(${ink.toFixed(2)}) contrast(${(1 + ink * 0.6).toFixed(2)})`,
    gradientFallback("#f4f1ea", "#d8d4cb"),
  );
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.6, tilt: boil(f, 2) * 0.02 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawWordLyrics(f, {
    cells: [1, 2, 5, 6, 9, 10, 13, 14],
    size: [0.055, 0.08],
    weight: 900,
    font: "main",
    motion: "pop",
    motionAmount: amt(f, "pop"),
    color: style.textColor,
    accentColor: style.accentColor,
    box: [style.bgColor, 0.35],
    stroke: [withAlpha(style.bgColor, 1), 0.1],
  });
}

/** Panel borders: a slanted cut across the page that changes every line. */
function overlay(f: LookFrame): void {
  const panels = amt(f, "panels");
  if (panels <= 0) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const gutter = s * 0.018;
  const seed = f.line ? f.line.index : 0;
  const x0 = W * (0.55 + (hash01(seed, 1) - 0.5) * 0.3);
  const tilt = W * 0.08 * (hash01(seed, 2) - 0.5);
  ctx.save();
  ctx.fillStyle = withAlpha(style.bgColor, panels);
  ctx.beginPath();
  ctx.moveTo(x0 - gutter + tilt, 0);
  ctx.lineTo(x0 + gutter + tilt, 0);
  ctx.lineTo(x0 + gutter - tilt, H);
  ctx.lineTo(x0 - gutter - tilt, H);
  ctx.fill();
  ctx.strokeStyle = withAlpha(style.textColor, panels);
  ctx.lineWidth = Math.max(2, s * 0.006);
  ctx.strokeRect(gutter, gutter, W - gutter * 2, H - gutter * 2);
  ctx.restore();
}

export const mangaPanel: LookRenderer = { scene, lyrics, overlay, decor };
