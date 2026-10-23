import { amt, drawCharacterLayer, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawParticles, drawWordLyrics, gradientFallback, washFrame } from "./kit";
import { withAlpha } from "./noise";

// M. Pastel dream: a soft-focus picture under a pastel haze, floating bokeh and tiny
// hearts, and rounded lyrics that float up with a white glow.

function decor(f: LookFrame): void {
  drawParticles(f, "bokeh", amt(f, "bokeh"), f.style.secondaryColor);
  drawParticles(f, "heart", amt(f, "hearts"), f.style.accentColor);
}

function scene(f: LookFrame): void {
  const soft = amt(f, "soft");
  drawBackdrop(
    f,
    `blur(${(soft * 2.5).toFixed(1)}px) saturate(0.85) brightness(1.08)`,
    gradientFallback(f.style.secondaryColor, f.style.bgColor),
  );
  washFrame(f, f.style.bgColor, 0.35 * soft, "screen");
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.5, tilt: Math.sin(f.timeSec * 0.8) * 0.02 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawWordLyrics(f, {
    cells: [5, 6, 9, 10, 1, 2, 13, 14],
    size: [0.055, 0.075],
    weight: 700,
    font: "main",
    motion: "rise",
    motionAmount: amt(f, "float"),
    color: style.textColor,
    accentColor: style.accentColor,
    glow: [withAlpha("#ffffff", 0.9), 0.5],
  });
}

function overlay(f: LookFrame): void {
  // Milky glow over the edges
  const haze = amt(f, "haze");
  if (haze <= 0) return;
  const { ctx, W, H } = f;
  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.3,
    W / 2,
    H / 2,
    Math.hypot(W, H) * 0.6,
  );
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, `rgba(255,255,255,${0.55 * haze})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export const pastelDream: LookRenderer = { scene, lyrics, overlay, decor };
