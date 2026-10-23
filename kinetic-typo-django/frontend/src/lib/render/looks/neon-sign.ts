import { amt, drawCharacterLayer, drawVignette, minSide, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawWordLyrics, gradientFallback, washFrame } from "./kit";
import { hash01, withAlpha } from "./noise";

// T. Neon sign: a dark wall at night, the picture dimmed behind glowing tube lettering
// that flickers on, a neon frame, brick lines and haze.

function drawBricks(f: LookFrame, amount: number): void {
  const { ctx, W, H } = f;
  const bh = minSide(f) * 0.05;
  const bw = bh * 2.4;
  ctx.save();
  ctx.strokeStyle = `rgba(0,0,0,${0.5 * amount})`;
  ctx.lineWidth = 1;
  for (let y = 0, r = 0; y < H; y += bh, r++) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    for (let x = (r % 2) * (bw / 2); x < W; x += bw) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + bh);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A rounded neon tube around the frame that hums with the beat. */
function drawTube(f: LookFrame, amount: number): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const inset = s * 0.05;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.secondaryColor, 0.9 * amount);
  ctx.shadowColor = style.secondaryColor;
  ctx.shadowBlur = s * (0.03 + f.energy * 0.02);
  ctx.lineWidth = s * 0.008;
  ctx.beginPath();
  ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, s * 0.04);
  ctx.stroke();
  ctx.restore();
}

function decor(f: LookFrame): void {
  const bricks = amt(f, "bricks");
  if (bricks > 0) drawBricks(f, bricks);
  const tube = amt(f, "tube");
  if (tube > 0) drawTube(f, tube);
}

function scene(f: LookFrame): void {
  drawBackdrop(f, "brightness(0.45) saturate(0.7)", gradientFallback("#1a1020", "#07040a"));
  washFrame(f, f.style.accentColor, 0.2 * amt(f, "glowwash"), "screen");
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.4, tilt: 0 });
}

function lyrics(f: LookFrame): void {
  const { ctx, style } = f;
  // Tubes flicker a couple of times as each line lights up
  const flicker = amt(f, "flicker");
  const e = f.lineElapsed;
  const off = flicker > 0 && e < 0.45 && hash01(Math.floor(e * 30), 7) < 0.45 * flicker;
  ctx.save();
  if (off) ctx.globalAlpha = 0.25;
  drawWordLyrics(f, {
    cells: [5, 6, 9, 10, 1, 2, 13, 14],
    size: [0.058, 0.08],
    weight: 700,
    font: "main",
    motion: "fade",
    motionAmount: 1,
    color: "#ffffff",
    accentColor: style.secondaryColor,
    glow: [style.accentColor, 0.9],
    stroke: [withAlpha(style.accentColor, 0.9), 0.08],
  });
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const haze = amt(f, "haze");
  if (haze > 0) {
    drawVignette(f, 0.8 * haze);
  }
}

export const neonSign: LookRenderer = { scene, lyrics, overlay, decor };
