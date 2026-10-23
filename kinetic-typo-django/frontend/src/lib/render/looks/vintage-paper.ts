import { amt, drawCharacterLayer, drawVignette, minSide, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawPaper, drawScratches, drawWordLyrics, gradientFallback } from "./kit";
import { withAlpha } from "./noise";

// L. Vintage paper: a sepia picture on aged paper inside an ornate double frame,
// with film vignette and scratches, and serif lyrics fading in between rules.

function decor(f: LookFrame): void {
  drawPaper(f, amt(f, "paper"));
}

function scene(f: LookFrame): void {
  const sepia = amt(f, "sepia");
  drawBackdrop(
    f,
    `sepia(${sepia.toFixed(2)}) saturate(${(1 - sepia * 0.3).toFixed(2)})`,
    gradientFallback("#e9dcc0", "#b9a27c"),
  );
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.2, tilt: Math.sin(f.timeSec * 0.5) * 0.01 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawWordLyrics(f, {
    cells: [9, 10, 5, 6, 13, 14, 1, 2],
    size: [0.05, 0.068],
    weight: 800,
    font: "main",
    motion: "blur",
    motionAmount: amt(f, "soft"),
    color: style.textColor,
    accentColor: style.accentColor,
    glow: [withAlpha(style.bgColor, 0.9), 0.25],
    tracking: 0.08,
  });
}

/** Double rule with corner flourishes, inset from the edges. */
function drawFrame(f: LookFrame, amount: number): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const inset = s * 0.04;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.accentColor, 0.9 * amount);
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.lineWidth = 1;
  ctx.strokeRect(inset * 1.4, inset * 1.4, W - inset * 2.8, H - inset * 2.8);
  for (const [x, y, sx, sy] of [
    [inset, inset, 1, 1],
    [W - inset, inset, -1, 1],
    [inset, H - inset, 1, -1],
    [W - inset, H - inset, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.arc(x + sx * inset * 0.9, y + sy * inset * 0.9, inset * 0.45, 0, Math.PI * 2);
    ctx.moveTo(x + sx * inset * 1.6, y + sy * inset * 0.4);
    ctx.quadraticCurveTo(
      x + sx * inset * 2.6,
      y + sy * inset * 0.4,
      x + sx * inset * 3.2,
      y + sy * inset * 1.1,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const frame = amt(f, "frame");
  if (frame > 0) drawFrame(f, frame);
  const vignette = amt(f, "vignette");
  if (vignette > 0) drawVignette(f, 0.75 * vignette, "40,24,8");
  drawScratches(f, amt(f, "scratches"));
}

export const vintagePaper: LookRenderer = { scene, lyrics, overlay, decor };
