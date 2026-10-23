import {
  amt,
  drawCharacterLayer,
  drawVignette,
  lineExit,
  minSide,
  withMoved,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { boil, drawBackdrop, drawParticles, drawVerticalLyrics, gradientFallback, washFrame } from "./kit";
import { hash01, withAlpha } from "./noise";

// N. Crimson ink: an East Asian scroll mood — a crimson-graded picture, a dry brush
// stroke sweeping in behind each line, a red seal, rising embers and vertical lyrics.

/** A dry brush stroke that sweeps across once per line. */
function drawBrush(f: LookFrame, amount: number): void {
  if (!f.line) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const grow = Math.min(1, Math.max(0, f.lineElapsed) / 0.5) * lineExit(f, 0.12);
  const y = H * (0.3 + hash01(f.line.index, 3) * 0.4);
  ctx.save();
  ctx.fillStyle = withAlpha(style.textColor === "#ffffff" ? "#0d0606" : style.textColor, 0.75 * amount);
  for (let i = 0; i < 26; i++) {
    const k = f.line.index * 31 + i;
    const yy = y + (hash01(k, 1) - 0.5) * s * 0.12;
    const len = W * 0.75 * grow * (0.6 + 0.4 * hash01(k, 2));
    ctx.fillRect(W * 0.08 + hash01(k, 4) * s * 0.05, yy, len, Math.max(1, s * 0.006 * hash01(k, 5)));
  }
  ctx.restore();
}

function decor(f: LookFrame): void {
  const brush = amt(f, "brush");
  if (brush > 0) withMoved(f, "brush", { x: f.W / 2, y: f.H / 2 }, () => drawBrush(f, brush));
  const seal = amt(f, "seal");
  if (seal > 0) withMoved(f, "seal", { x: f.W * 0.1, y: f.H * 0.82 }, () => drawSeal(f, seal));
}

/** A red square seal in the lower left. */
function drawSeal(f: LookFrame, seal: number): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f) * 0.07;
  ctx.save();
  ctx.translate(W * 0.1 + boil(f, 1, 2), H * 0.82);
  ctx.rotate(-0.06);
  ctx.fillStyle = withAlpha(style.accentColor, 0.9 * seal);
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeStyle = withAlpha("#ffffff", 0.75 * seal);
  ctx.lineWidth = s * 0.08;
  ctx.strokeRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
  ctx.restore();
}

function scene(f: LookFrame): void {
  drawBackdrop(f, "contrast(1.1) saturate(0.8)", gradientFallback("#3a0a0a", "#120303"));
  washFrame(f, f.style.accentColor, 0.5 * amt(f, "crimson"), "multiply");
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.3, tilt: Math.sin(f.timeSec * 0.5) * 0.015 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawVerticalLyrics(f, {
    size: 0.055,
    weight: 800,
    color: style.textColor,
    accentColor: style.secondaryColor,
    glow: [withAlpha(style.accentColor, 0.9), 0.8 * amt(f, "glow")],
  });
}

function overlay(f: LookFrame): void {
  drawParticles(f, "ember", amt(f, "embers"), f.style.secondaryColor, 1);
  const vignette = amt(f, "vignette");
  if (vignette > 0) drawVignette(f, 0.85 * vignette, "20,0,0");
}

export const crimsonInk: LookRenderer = { scene, lyrics, overlay, decor };
