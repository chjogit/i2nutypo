import { amt, minSide, type LookFrame } from "./frame";
import { withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Beat pulses: the frame answers the music's beat energy, a glow breathing in
// from the edges in the theme's color, or for the screen themes a row of level
// bars along the bottom. With no beat energy (or "no vibration") nothing shows.

type Pulse = "edge" | "bars";

const KIND: Partial<Record<ThemedPresetId, Pulse>> = {
  digital_crt: "bars",
  neon_sign: "bars",
  dark_glitch: "bars",
};

function edgeGlow(f: LookFrame, k: number, color: string): void {
  const { ctx, W, H } = f;
  const g = ctx.createRadialGradient(W / 2, H / 2, minSide(f) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(1, withAlpha(color, 0.6 * k));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function levelBars(f: LookFrame, k: number, color: string): void {
  const { ctx, W, H } = f;
  const n = 32;
  const w = W / n;
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.55);
  for (let i = 0; i < n; i++) {
    // A smooth hump of bars that rises with the beat, each wobbling on its own
    const shape = 0.35 + 0.65 * Math.sin((i / (n - 1)) * Math.PI);
    const wob = 0.6 + 0.4 * Math.sin(f.timeSec * 9 + i * 1.7);
    const h = H * 0.2 * k * shape * wob;
    if (h < 1) continue;
    ctx.fillRect(i * w + w * 0.15, H - h, w * 0.7, h);
  }
  ctx.restore();
}

/** The theme's beat pulse, when its "beat" element is on. */
export function drawBeatPulse(f: LookFrame): void {
  const a = amt(f, "beat");
  if (a <= 0 || f.style.noVibration) return;
  const k = Math.min(1, f.energy) * Math.min(1.2, 0.3 + a);
  if (k < 0.02) return;
  if ((KIND[f.preset] ?? "edge") === "bars") levelBars(f, k, f.style.accentColor);
  else edgeGlow(f, k, f.style.accentColor);
}
