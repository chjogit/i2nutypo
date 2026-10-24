import type { AdjustClip, StyleSettings, TransitionClip, TransitionColor } from "@/types/project";
import type { Ctx2D } from "@/lib/render/motifs";
import { hash01, hashSigned } from "@/lib/render/looks/noise";
import { textSeed } from "@/lib/random";
import { adjustStrength, transitionPhase } from "./defs";

// Draws the timeline's adjustment layers and transitions over a finished
// frame, before the final color grade. Everything works on the canvas pixels
// (identity transform), so the preview and the export look the same at any size.

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Scratch {
  canvas: AnyCanvas;
  ctx: AnyCtx;
}

const scratches: Scratch[] = [];

function scratch(i: number, w: number, h: number): Scratch | null {
  let s = scratches[i];
  if (!s) {
    const canvas: AnyCanvas | null =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : null;
    const ctx = canvas?.getContext("2d") as AnyCtx | null | undefined;
    if (!canvas || !ctx) return null;
    s = scratches[i] = { canvas, ctx };
  }
  if (s.canvas.width !== w) s.canvas.width = w;
  if (s.canvas.height !== h) s.canvas.height = h;
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.globalAlpha = 1;
  s.ctx.globalCompositeOperation = "source-over";
  s.ctx.filter = "none";
  return s;
}

/** A copy of what ctx's canvas shows now. */
function snapshot(ctx: Ctx2D, i = 0): Scratch | null {
  const { width: w, height: h } = ctx.canvas;
  const s = scratch(i, w, h);
  if (!s) return null;
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.drawImage(ctx.canvas, 0, 0);
  return s;
}

interface Px {
  ctx: Ctx2D;
  w: number;
  h: number;
}

/** Draws the copy back with a transform about the middle, optional alpha and CSS filter. */
function drawBack(
  px: Px,
  src: Scratch,
  o: { scale?: number; rot?: number; dx?: number; dy?: number; alpha?: number; filter?: string },
) {
  const { ctx, w, h } = px;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.filter) ctx.filter = o.filter;
  ctx.translate(w / 2 + (o.dx ?? 0), h / 2 + (o.dy ?? 0));
  if (o.rot) ctx.rotate(o.rot);
  const s = o.scale ?? 1;
  ctx.scale(s, s);
  ctx.drawImage(src.canvas, -w / 2, -h / 2);
  ctx.restore();
}

function fillAll(px: Px, color: string, alpha: number) {
  if (alpha <= 0) return;
  const { ctx } = px;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, px.w, px.h);
  ctx.restore();
}

/** Red and cyan halves of the picture pulled apart by dx pixels (they add back to the picture at 0). */
function rgbSplit(px: Px, dx: number, dy = 0) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  const src = snapshot(px.ctx, 0);
  const red = scratch(1, px.w, px.h);
  const cyan = scratch(2, px.w, px.h);
  if (!src || !red || !cyan) return;
  for (const [s, color] of [
    [red, "#ff0000"],
    [cyan, "#00ffff"],
  ] as const) {
    s.ctx.clearRect(0, 0, px.w, px.h);
    s.ctx.drawImage(src.canvas, 0, 0);
    s.ctx.globalCompositeOperation = "multiply";
    s.ctx.fillStyle = color;
    s.ctx.fillRect(0, 0, px.w, px.h);
    s.ctx.globalCompositeOperation = "source-over";
  }
  const { ctx } = px;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, px.w, px.h);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(red.canvas, dx, dy);
  ctx.drawImage(cyan.canvas, -dx, -dy);
  ctx.restore();
}

/** Blocks of `size` pixels. */
function pixelate(px: Px, size: number) {
  if (size < 2) return;
  const src = snapshot(px.ctx, 0);
  const sw = Math.max(1, Math.round(px.w / size));
  const sh = Math.max(1, Math.round(px.h / size));
  const small = scratch(1, sw, sh);
  if (!src || !small) return;
  small.ctx.imageSmoothingEnabled = true;
  small.ctx.drawImage(src.canvas, 0, 0, sw, sh);
  const { ctx } = px;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small.canvas, 0, 0, sw, sh, 0, 0, px.w, px.h);
  ctx.restore();
}

/** Horizontal slices shifted sideways, changing every 1/24 s. */
function glitchSlices(px: Px, amount: number, t: number, seed: number) {
  if (amount <= 0.01) return;
  const src = snapshot(px.ctx, 0);
  if (!src) return;
  const frame = Math.floor(t * 24);
  const n = 12;
  const { ctx } = px;
  for (let i = 0; i < n; i++) {
    if (hash01(frame + seed, i * 7) > 0.35 + amount * 0.5) continue;
    const y = hash01(frame + seed, i * 7 + 1) * px.h;
    const hh = (0.02 + hash01(frame + seed, i * 7 + 2) * 0.12) * px.h;
    const dx = hashSigned(frame + seed, i * 7 + 3) * px.w * 0.12 * amount;
    ctx.drawImage(src.canvas, 0, y, px.w, hh, dx, y, px.w, hh);
  }
}

function colorOf(c: TransitionColor, style: StyleSettings): string {
  return c === "accent"
    ? style.accentColor
    : c === "bg"
      ? style.bgColor
      : c === "white"
        ? "#ffffff"
        : "#000000";
}

/**
 * Covering shapes grow until the cut and shrink after it; before the cut they
 * come in from one side, after it they leave on the other, like a wipe.
 */
function drawTransition(px: Px, c: TransitionClip, t: number, style: StyleSettings) {
  const ph = transitionPhase(c, t);
  if (!ph) return;
  const { p, cover } = ph;
  const { ctx, w, h } = px;
  const after = p >= 0.5;
  const seed = textSeed(c.id) % 997;
  const color = colorOf(c.color, style);
  const ease = (x: number) => x * x * (3 - 2 * x);
  const k = ease(cover);
  const diag = Math.hypot(w, h);

  switch (c.kind) {
    case "flash":
      fillAll(px, "#ffffff", Math.pow(cover, 1.6));
      return;
    case "dip":
      fillAll(px, color, k);
      return;
    case "leak": {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const g = ctx.createRadialGradient(
        w * (after ? 0.8 : 0.2),
        h * 0.3,
        0,
        w * (after ? 0.8 : 0.2),
        h * 0.3,
        diag * (0.3 + 0.6 * k),
      );
      g.addColorStop(0, `rgba(255,214,150,${(0.95 * k).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,120,60,${(0.6 * k).toFixed(3)})`);
      g.addColorStop(1, "rgba(255,60,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      fillAll(px, "#fff4e0", Math.max(0, k - 0.7) * 2.5);
      return;
    }
    case "blur": {
      const src = snapshot(ctx);
      if (src) drawBack(px, src, { filter: `blur(${(k * Math.min(w, h) * 0.04).toFixed(1)}px)` });
      fillAll(px, "#ffffff", k * 0.15);
      return;
    }
    case "zoom": {
      const src = snapshot(ctx);
      if (!src) return;
      const s = 1 + k * 0.7;
      drawBack(px, src, { scale: s });
      for (let i = 1; i <= 3; i++) drawBack(px, src, { scale: s * (1 + i * 0.06 * k), alpha: 0.22 * k });
      fillAll(px, "#ffffff", Math.max(0, k - 0.8) * 2);
      return;
    }
    case "whip": {
      const src = snapshot(ctx);
      if (!src) return;
      // Leaves to the left before the cut and comes in from the right after it
      const off = (after ? 1 : -1) * k * w * 0.45;
      fillAll(px, "#000", 1);
      for (let i = 0; i < 6; i++)
        drawBack(px, src, {
          dx: off * (1 + i * 0.12),
          alpha: i === 0 ? 1 : 0.25,
          filter: `blur(${(k * 14).toFixed(1)}px)`,
        });
      return;
    }
    case "spin": {
      const src = snapshot(ctx);
      if (!src) return;
      const dir = seed % 2 === 0 ? 1 : -1;
      const rot = dir * (after ? -1 : 1) * k * 0.9;
      fillAll(px, "#000", 1);
      drawBack(px, src, { rot, scale: 1 + k * 0.5, filter: `blur(${(k * 8).toFixed(1)}px)` });
      return;
    }
    case "slide": {
      const src = snapshot(ctx);
      if (!src) return;
      fillAll(px, color, 1);
      drawBack(px, src, { dy: (after ? 1 : -1) * ease(k) * h });
      return;
    }
    case "circle": {
      const r = (1 - k) * diag * 0.55;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2, true);
      ctx.fillStyle = color;
      ctx.fill("evenodd");
      ctx.restore();
      return;
    }
    case "diagonal": {
      // A slanted band crossing from left to right; it covers the frame at the cut
      const span = w + h;
      const lead = ease(Math.min(1, p * 2)) * span;
      const tail = ease(Math.max(0, p * 2 - 1)) * span;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tail - h, h);
      ctx.lineTo(tail, 0);
      ctx.lineTo(lead, 0);
      ctx.lineTo(lead - h, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    case "bars": {
      const n = 7;
      const bw = w / n;
      ctx.save();
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const d = (i / n) * 0.35;
        const local = Math.max(0, Math.min(1, (cover - d) / (1 - 0.35)));
        const bh = ease(local) * h;
        if (after) ctx.fillRect(i * bw, h - bh, bw + 1, bh);
        else ctx.fillRect(i * bw, 0, bw + 1, bh);
      }
      ctx.restore();
      return;
    }
    case "shutter": {
      const n = 9;
      const bh = h / n;
      ctx.save();
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) ctx.fillRect(0, i * bh + (bh * (1 - k)) / 2, w, bh * k + 0.5);
      ctx.restore();
      return;
    }
    case "ink": {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const x = hash01(seed, i * 3) * w;
        const y = hash01(seed, i * 3 + 1) * h;
        const r = k * diag * (0.22 + hash01(seed, i * 3 + 2) * 0.25);
        ctx.moveTo(x + r, y);
        // A wobbly blob instead of a clean circle
        for (let a = 0; a <= 24; a++) {
          const ang = (a / 24) * Math.PI * 2;
          const rr = r * (0.85 + 0.15 * Math.sin(ang * 5 + i));
          ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
        }
      }
      ctx.fill();
      ctx.restore();
      return;
    }
    case "glitch":
      glitchSlices(px, k, t, seed);
      rgbSplit(px, k * w * 0.02);
      return;
    case "rgb":
      rgbSplit(px, (after ? -1 : 1) * k * w * 0.035, k * h * 0.006);
      return;
    case "pixel":
      pixelate(px, 1 + k * Math.min(w, h) * 0.06);
      return;
  }
}

function drawAdjust(px: Px, c: AdjustClip, t: number, energy: number) {
  const a = adjustStrength(c, t);
  if (a <= 0.001) return;
  const { ctx, w, h } = px;
  const seed = textSeed(c.id) % 997;
  const prog = (t - c.start) / Math.max(0.01, c.end - c.start);
  const filter = (f: string) => {
    const src = snapshot(ctx);
    if (src) drawBack(px, src, { filter: f });
  };
  switch (c.kind) {
    case "zoom": {
      const src = snapshot(ctx);
      if (src) drawBack(px, src, { scale: 1 + a * 0.25 * prog });
      return;
    }
    case "shake": {
      const src = snapshot(ctx);
      if (!src) return;
      const f = Math.floor(t * 24);
      const amp = Math.min(w, h) * 0.025 * a * (1 + energy);
      const smooth = (k: number) => hashSigned(f, k) * 0.6 + Math.sin(t * (3.1 + k) + seed) * 0.4;
      drawBack(px, src, {
        scale: 1 + a * 0.06,
        dx: smooth(1) * amp,
        dy: smooth(2) * amp,
        rot: smooth(3) * a * 0.012,
      });
      return;
    }
    case "tilt": {
      const src = snapshot(ctx);
      if (src) drawBack(px, src, { rot: (seed % 2 ? 1 : -1) * a * 0.14, scale: 1 + a * 0.18 });
      return;
    }
    case "blur":
      filter(`blur(${(a * Math.min(w, h) * 0.015).toFixed(1)}px)`);
      return;
    case "invert":
      filter(`invert(${a.toFixed(3)})`);
      return;
    case "mono":
      filter(`grayscale(${a.toFixed(3)})`);
      return;
    case "bright":
      filter(`brightness(${(1 + a * 0.7).toFixed(3)})`);
      return;
    case "saturate":
      filter(`saturate(${(1 + a * 1.5).toFixed(3)})`);
      return;
    case "hue":
      filter(`hue-rotate(${Math.round(a * 180)}deg)`);
      return;
    case "rgb":
      rgbSplit(px, a * w * 0.012 * (1 + energy * 0.8));
      return;
    case "pixel":
      pixelate(px, 1 + a * Math.min(w, h) * 0.04);
      return;
    case "mirror": {
      const src = snapshot(ctx);
      if (!src) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src.canvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
      ctx.restore();
      return;
    }
    case "vhs": {
      const src = snapshot(ctx);
      if (!src) return;
      const f = Math.floor(t * 30);
      const bands = 6;
      for (let i = 0; i < bands; i++) {
        const y = ((hash01(f, i) + t * 0.05) % 1) * h;
        const hh = h * 0.015;
        ctx.drawImage(src.canvas, 0, y, w, hh, hashSigned(f, i + 9) * w * 0.02 * a, y, w, hh);
      }
      rgbSplit(px, a * w * 0.004);
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${(0.18 * a).toFixed(3)})`;
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      ctx.restore();
      return;
    }
    case "beatFlash":
      fillAll(px, "#ffffff", Math.max(0, energy - 0.35) * a * 0.9);
      return;
  }
}

/** Draws the adjustment layers, then the transition, at timeSec over the frame on ctx. */
export function applyTimelineFx(ctx: Ctx2D, style: StyleSettings, timeSec: number, energy: number): void {
  const adjusts = style.adjustClips ?? [];
  const transitions = style.transitions ?? [];
  const live = adjusts.filter((c) => timeSec >= c.start && timeSec < c.end);
  const tr = transitions.find((c) => timeSec >= c.start && timeSec < c.end);
  if (live.length === 0 && !tr) return;
  const { width: w, height: h } = ctx.canvas;
  if (w < 2 || h < 2) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  const px = { ctx, w, h };
  for (const c of live) drawAdjust(px, c, timeSec, energy);
  if (tr) drawTransition(px, tr, timeSec, style);
  ctx.restore();
}
