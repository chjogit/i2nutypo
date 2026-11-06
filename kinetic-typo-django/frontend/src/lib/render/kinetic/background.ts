import type { KineticBackground } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { css, type KineticPalette } from "./color";
import { drawSoftLayer } from "../looks/soft-layer";

// Backgrounds made from the user's colors: one flat color, a radial spotlight
// of the background lifted toward the light, or an aurora mesh of soft blobs
// from the background, point and secondary colors drifting slowly. All of it
// follows the time only, so every frame is the same in preview and export.

/** Draws the background over the whole frame (W × H, logical px). */
export function drawKineticBackground(
  ctx: Ctx2D,
  mode: Exclude<KineticBackground, "theme">,
  p: KineticPalette,
  timeSec: number,
  W: number,
  H: number,
): void {
  ctx.save();
  ctx.fillStyle = css(p.bg);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (mode === "solid") return;
  // Only soft gradients: painted at an eighth of the frame's pixels and scaled up, the same look for far less fill
  drawSoftLayer(ctx, W, H, `kinetic-bg-${mode}`, 0.125, (c) => {
    c.fillStyle = css(p.bg);
    c.fillRect(0, 0, W, H);
    if (mode === "spotlight") drawSpotlight(c, p, timeSec, W, H);
    else drawAurora(c, p, timeSec, W, H);
  });
}

function drawSpotlight(ctx: Ctx2D, p: KineticPalette, t: number, W: number, H: number): void {
  // The light sways a little so the frame is never perfectly still
  const cx = W * (0.5 + Math.sin(t * 0.21) * 0.04);
  const cy = H * (0.42 + Math.sin(t * 0.17 + 1) * 0.03);
  const r = Math.hypot(W, H) * 0.62;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, css(p.bgLift));
  g.addColorStop(0.45, css(p.bg));
  g.addColorStop(1, css(p.bgDeep));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // A soft halo of the point color right behind where the lyrics sit
  const halo = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.min(W, H) * 0.55);
  halo.addColorStop(0, css(p.accent, p.lightBg ? 0.06 : 0.1));
  halo.addColorStop(1, css(p.accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
}

/** Blob paths, each a slow Lissajous loop with its own speed. */
const BLOBS = [
  { color: 0, ax: 0.32, ay: 0.22, fx: 0.071, fy: 0.053, px: 0.2, py: 1.1, r: 0.62, ox: 0.28, oy: 0.3 },
  { color: 1, ax: 0.28, ay: 0.26, fx: 0.049, fy: 0.067, px: 2.4, py: 0.3, r: 0.7, ox: 0.74, oy: 0.68 },
  { color: 2, ax: 0.24, ay: 0.2, fx: 0.083, fy: 0.041, px: 4.1, py: 2.7, r: 0.5, ox: 0.6, oy: 0.22 },
  { color: 0, ax: 0.2, ay: 0.24, fx: 0.037, fy: 0.077, px: 5.3, py: 4.2, r: 0.46, ox: 0.18, oy: 0.78 },
] as const;

function drawAurora(ctx: Ctx2D, p: KineticPalette, t: number, W: number, H: number): void {
  const D = Math.hypot(W, H);
  ctx.globalCompositeOperation = p.lightBg ? "multiply" : "screen";
  for (const b of BLOBS) {
    const x = W * (b.ox + Math.sin(t * b.fx * Math.PI * 2 + b.px) * b.ax);
    const y = H * (b.oy + Math.sin(t * b.fy * Math.PI * 2 + b.py) * b.ay);
    const r = D * b.r * (0.9 + 0.1 * Math.sin(t * 0.13 + b.px));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = p.aurora[b.color];
    g.addColorStop(0, css(c, p.lightBg ? 0.45 : 0.55));
    g.addColorStop(0.5, css(c, p.lightBg ? 0.16 : 0.2));
    g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "source-over";
  // Corners kept deeper so the light gathers in the middle
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, D * 0.6);
  v.addColorStop(0, css(p.bgDeep, 0));
  v.addColorStop(1, css(p.bgDeep, 0.55));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
