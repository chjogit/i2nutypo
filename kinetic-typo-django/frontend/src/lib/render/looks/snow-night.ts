import { amt, drawCharacterLayer, drawVignette, minSide, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawParticles, drawWordLyrics, gradientFallback, washFrame } from "./kit";
import { withAlpha } from "./noise";

// P. Snow night: a cold blue night, snow falling in front of and behind the character,
// a pale moon glow, frosted edges and quiet, widely tracked lyrics.

function decor(f: LookFrame): void {
  drawParticles(f, "snow", amt(f, "snow"), "#ffffff");
  const moon = amt(f, "moon");
  if (moon > 0) {
    const { ctx, W, H } = f;
    const r = minSide(f) * 0.5;
    const g = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, r);
    g.addColorStop(0, `rgba(230,240,255,${0.5 * moon})`);
    g.addColorStop(1, "rgba(230,240,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function scene(f: LookFrame): void {
  drawBackdrop(f, "saturate(0.7) brightness(0.85)", gradientFallback("#16233f", "#05080f"));
  washFrame(f, f.style.accentColor, 0.45 * amt(f, "cold"), "color");
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.25, tilt: 0 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawWordLyrics(f, {
    cells: [9, 10, 13, 14, 5, 6, 1, 2],
    size: [0.045, 0.062],
    weight: 700,
    font: "main",
    motion: "fade",
    motionAmount: 1,
    color: style.textColor,
    accentColor: style.secondaryColor,
    glow: [withAlpha(style.accentColor, 0.9), 0.6 * amt(f, "glow")],
    tracking: 0.25,
  });
}

function overlay(f: LookFrame): void {
  drawParticles(f, "snow", 0.6 * amt(f, "front"), "#ffffff", 1);
  const frost = amt(f, "frost");
  if (frost > 0) drawVignette(f, 0.6 * frost, "200,220,255");
}

export const snowNight: LookRenderer = { scene, lyrics, overlay, decor };
