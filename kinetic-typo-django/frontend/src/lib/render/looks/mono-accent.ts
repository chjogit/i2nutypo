import { amt, drawCharacterLayer, drawGrain, minSide, type LookFrame, type LookRenderer } from "./frame";
import { drawBackdrop, drawWordLyrics, gradientFallback } from "./kit";
import { withAlpha } from "./noise";

// K. Mono accent: a black-and-white picture where one color does all the talking —
// a bold band, a ring and the key words — with type set in solid label boxes.

function decor(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const band = amt(f, "band");
  if (band > 0) {
    // A slanted color band that slides in a little on each line
    const slide = f.line ? Math.min(1, Math.max(0, f.lineElapsed) / 0.4) : 1;
    ctx.save();
    ctx.globalAlpha = 0.85 * band;
    ctx.fillStyle = style.accentColor;
    ctx.translate(W * (0.5 - 0.6 * (1 - slide)), H * 0.62);
    ctx.rotate(-0.12);
    ctx.fillRect(-W, -s * 0.05, W * 2, s * 0.1);
    ctx.restore();
  }
  const ring = amt(f, "ring");
  if (ring > 0) {
    ctx.save();
    ctx.strokeStyle = withAlpha(style.accentColor, 0.9 * ring);
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.arc(W * 0.78, H * 0.3, s * (0.16 + f.energy * 0.02), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function scene(f: LookFrame): void {
  const mono = amt(f, "mono");
  drawBackdrop(
    f,
    `grayscale(${mono.toFixed(2)}) contrast(${(1 + mono * 0.25).toFixed(2)})`,
    gradientFallback("#2a2a2a", "#0c0c0c"),
  );
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.4, tilt: 0 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  const label = amt(f, "label");
  drawWordLyrics(f, {
    cells: [5, 6, 9, 10, 1, 2, 13, 14],
    size: [0.06, 0.085],
    weight: 900,
    font: "main",
    motion: "slide",
    motionAmount: amt(f, "slide"),
    color: label > 0 ? style.bgColor : style.textColor,
    accentColor: style.accentColor,
    box: label > 0 ? [style.textColor, 0.25] : undefined,
    align: "left",
  });
}

function overlay(f: LookFrame): void {
  drawGrain(f, 0.8 * amt(f, "grain"));
}

export const monoAccent: LookRenderer = { scene, lyrics, overlay, decor };
