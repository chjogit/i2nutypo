import { amt, drawCharacterLayer, minSide, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawParticles, drawWordLyrics, gradientFallback, washFrame } from "./kit";
import { hash01, withAlpha } from "./noise";

// Q. Rain window: a rainy evening seen through glass — a cool, slightly blurred picture,
// slanted rain, neon bokeh from the street, drops sliding down the pane, typed lyrics.

function decor(f: LookFrame): void {
  drawParticles(f, "bokeh", amt(f, "neon"), f.style.accentColor);
  drawParticles(f, "rain", amt(f, "rain"), "#cfe3ff");
}

function scene(f: LookFrame): void {
  const blur = amt(f, "blur");
  drawBackdrop(
    f,
    `blur(${(blur * 2).toFixed(1)}px) saturate(0.6) brightness(0.8)`,
    gradientFallback("#1d2733", "#0a0f16"),
  );
  washFrame(f, "#4a6a8a", 0.4 * blur, "soft-light");
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.2, tilt: 0 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawWordLyrics(f, {
    cells: [13, 14, 9, 10, 5, 6, 1, 2],
    size: [0.045, 0.06],
    weight: 500,
    font: "accent",
    motion: "type",
    motionAmount: amt(f, "type"),
    color: style.textColor,
    accentColor: style.accentColor,
    glow: [withAlpha("#000000", 0.8), 0.4],
    align: "left",
  });
}

/** Drops sliding down the glass, each leaving a short trail. */
function drawDrops(f: LookFrame, amount: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(30 * amount);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const speed = 0.01 + hash01(i, 1) * 0.05;
    const y = (((hash01(i, 2) + f.timeSec * speed) % 1.2) - 0.1) * H;
    const x = hash01(i, 3) * W;
    const r = s * (0.003 + hash01(i, 4) * 0.006);
    ctx.fillStyle = "rgba(220,235,255,0.18)";
    ctx.fillRect(x - r * 0.3, y - r * 12, r * 0.6, r * 12);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(160,190,220,0.15)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const drops = amt(f, "drops");
  if (drops > 0) drawDrops(f, drops);
  const mist = amt(f, "mist");
  if (mist > 0) {
    const { ctx, W, H } = f;
    const g = ctx.createLinearGradient(0, H, 0, H * 0.5);
    g.addColorStop(0, withAlpha("#c8d8e8", 0.35 * mist));
    g.addColorStop(1, withAlpha("#c8d8e8", 0));
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export const rainWindow: LookRenderer = { scene, lyrics, overlay, decor };
