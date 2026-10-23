import { amt, drawCharacterLayer, drawVignette, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawParticles, drawWordLyrics, gradientFallback, washFrame } from "./kit";
import { withAlpha } from "./noise";

// S. Deep sea: the picture sinks into blue water — rippling caustic light, light shafts
// from the surface, rising bubbles, and lyrics that sway like they are under water.

function drawCaustics(f: LookFrame, amount: number): void {
  const { ctx, W, H } = f;
  const t = f.timeSec;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(170,230,255,${0.12 * amount})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += W / 40) {
      const y =
        H * (i / 14) +
        Math.sin(x * 0.01 + t * 0.9 + i) * H * 0.02 +
        Math.sin(x * 0.023 - t * 0.6 + i * 2) * H * 0.012;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function decor(f: LookFrame): void {
  const caustics = amt(f, "caustics");
  if (caustics > 0) drawCaustics(f, caustics);
  drawParticles(f, "bubble", amt(f, "bubbles"), "#bfeaff");
}

function scene(f: LookFrame): void {
  drawBackdrop(f, "saturate(0.8) brightness(0.8)", gradientFallback("#0b4a7a", "#020c1c"));
  washFrame(f, f.style.accentColor, 0.5 * amt(f, "depth"), "multiply");
  decor(f);
  drawCharacterLayer(f, { bounce: 0, tilt: Math.sin(f.timeSec * 0.7) * 0.03 });
}

function lyrics(f: LookFrame): void {
  const { ctx, style } = f;
  const sway = amt(f, "sway");
  ctx.save();
  // The whole block bobs gently
  ctx.translate(
    Math.sin(f.timeSec * 1.1) * f.W * 0.004 * sway,
    Math.sin(f.timeSec * 0.8) * f.H * 0.008 * sway,
  );
  drawWordLyrics(f, {
    cells: [5, 6, 9, 10, 1, 2, 13, 14],
    size: [0.05, 0.07],
    weight: 700,
    font: "main",
    motion: "blur",
    motionAmount: 1,
    color: style.textColor,
    accentColor: style.secondaryColor,
    glow: [withAlpha(style.secondaryColor, 0.7), 0.5],
  });
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const rays = amt(f, "rays");
  if (rays > 0) {
    const { ctx, W, H } = f;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + i * 0.22) + Math.sin(f.timeSec * 0.3 + i) * W * 0.03;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(200,240,255,${0.18 * rays})`);
      g.addColorStop(1, "rgba(200,240,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - W * 0.03, 0);
      ctx.lineTo(x + W * 0.03, 0);
      ctx.lineTo(x + W * 0.1, H);
      ctx.lineTo(x - W * 0.02, H);
      ctx.fill();
    }
    ctx.restore();
  }
  const dark = amt(f, "dark");
  if (dark > 0) drawVignette(f, 0.85 * dark, "0,10,30");
}

export const deepSea: LookRenderer = { scene, lyrics, overlay, decor };
