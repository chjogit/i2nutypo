import type { AutoContrast } from "@/types/project";
import type { Box } from "../text-bounds";
import type { Ctx2D } from "../motifs";

// Keeps the lyrics readable on any background: the lyrics are drawn on a
// layer of their own, the picture under them and the lyrics' own color are
// sampled, and when the two are too close (WCAG contrast below READABLE) the
// lyrics are pushed lighter or darker, or given a contrasting edge, just
// enough to read. Each frame decides on its own, so the export matches the
// preview.

/** Contrast ratio the lyrics are brought up to; 3:1 is the usual bar for large text. */
export const READABLE = 3;

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of an sRGB color (0..255 channels), 0 black to 1 white. */
export const luminance = (r: number, g: number, b: number): number =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio of two luminances, 1 to 21. */
export const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

type Rgb = readonly [number, number, number];

/**
 * How far to mix the text color toward white or black to reach `target`
 * contrast against `bg`: null when it already reads.
 */
export function contrastFix(
  text: Rgb,
  bg: Rgb,
  target = READABLE,
): { toward: "white" | "black"; k: number } | null {
  const bgL = luminance(...bg);
  if (contrastRatio(luminance(...text), bgL) >= target) return null;
  // Toward whichever end has more room against this background
  const toward = contrastRatio(1, bgL) >= contrastRatio(0, bgL) ? "white" : "black";
  const end = toward === "white" ? 255 : 0;
  const mix = (k: number) => text.map((c) => c + (end - c) * k) as unknown as Rgb;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(luminance(...mix(mid)), bgL) >= target) hi = mid;
    else lo = mid;
  }
  return { toward, k: hi };
}

let layer: HTMLCanvasElement | null = null;
let probe: HTMLCanvasElement | null = null;
let edge: HTMLCanvasElement | null = null;
const PROBE_W = 64;
const PROBE_H = 16;

function scratch(w: number, h: number): CanvasRenderingContext2D | null {
  layer ??= document.createElement("canvas");
  if (layer.width !== w || layer.height !== h) {
    layer.width = w;
    layer.height = h;
  }
  const c = layer.getContext("2d");
  c?.setTransform(1, 0, 0, 1, 0, 0);
  c?.clearRect(0, 0, w, h);
  return c;
}

/** `src` inside box (device pixels), shrunk to a small grid of samples. */
function sample(src: CanvasImageSource, box: Box): Uint8ClampedArray | null {
  probe ??= document.createElement("canvas");
  probe.width = PROBE_W;
  probe.height = PROBE_H;
  const p = probe.getContext("2d", { willReadFrequently: true });
  if (!p) return null;
  p.clearRect(0, 0, PROBE_W, PROBE_H);
  p.drawImage(
    src,
    box.x0,
    box.y0,
    Math.max(1, box.x1 - box.x0),
    Math.max(1, box.y1 - box.y0),
    0,
    0,
    PROBE_W,
    PROBE_H,
  );
  return p.getImageData(0, 0, PROBE_W, PROBE_H).data;
}

/**
 * The text and background colors where the lyrics read worst: the glyph
 * samples below the readable contrast, when they are a real share of the text
 * (a word in a dark color among light ones counts, a stray edge pixel does not).
 */
export function poorSpots(
  text: Uint8ClampedArray,
  bg: Uint8ClampedArray,
  target = READABLE,
): { text: Rgb; bg: Rgb } | null {
  let glyphs = 0;
  let poor = 0;
  const t = [0, 0, 0];
  const b = [0, 0, 0];
  for (let i = 0; i < text.length; i += 4) {
    if (text[i + 3] < 77) continue;
    glyphs++;
    const ratio = contrastRatio(
      luminance(text[i], text[i + 1], text[i + 2]),
      luminance(bg[i], bg[i + 1], bg[i + 2]),
    );
    if (ratio >= target) continue;
    poor++;
    for (let c = 0; c < 3; c++) {
      t[c] += text[i + c];
      b[c] += bg[i + c];
    }
  }
  if (glyphs === 0 || poor / glyphs < 0.12) return null;
  return { text: [t[0] / poor, t[1] / poor, t[2] / poor], bg: [b[0] / poor, b[1] / poor, b[2] / poor] };
}

/**
 * Draws the lyrics (`draw` on the given context, returning where its text
 * went) so they stay readable over what is already on ctx. With "off", or
 * where there is no DOM canvas (tests), it simply draws on ctx.
 */
export function drawReadable(ctx: Ctx2D, mode: AutoContrast, draw: (c: Ctx2D) => Box | null): Box | null {
  const canvas = (ctx as CanvasRenderingContext2D).canvas as HTMLCanvasElement | undefined;
  if (mode === "off" || typeof document === "undefined" || !canvas || !("getContext" in canvas))
    return draw(ctx);
  const W = canvas.width;
  const H = canvas.height;
  const lc = scratch(W, H);
  if (!lc || !layer) return draw(ctx);
  // Same transform and state as the main context, so the lyrics land where they would have
  lc.setTransform(ctx.getTransform());
  lc.globalAlpha = ctx.globalAlpha;
  lc.filter = (ctx as CanvasRenderingContext2D).filter ?? "none";
  const box = draw(lc);
  const copy = () => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.drawImage(layer as HTMLCanvasElement, 0, 0);
    ctx.restore();
  };
  // Nothing to fix: drawn again straight on the picture, so blend modes look exactly as the theme made them
  if (!box) return draw(ctx);
  const clip: Box = {
    x0: Math.max(0, Math.floor(box.x0)),
    y0: Math.max(0, Math.floor(box.y0)),
    x1: Math.min(W, Math.ceil(box.x1)),
    y1: Math.min(H, Math.ceil(box.y1)),
  };
  const textPx = clip.x1 > clip.x0 && clip.y1 > clip.y0 ? sample(layer, clip) : null;
  const bgPx = textPx ? sample(canvas, clip) : null;
  const spots = textPx && bgPx ? poorSpots(textPx, bgPx) : null;
  const fix = spots ? contrastFix(spots.text, spots.bg) : null;
  if (!fix) return draw(ctx);
  const end = fix.toward === "white" ? "255,255,255" : "0,0,0";
  lc.save();
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.filter = "none";
  lc.globalAlpha = 1;
  if (mode === "color") {
    // Tints the glyphs only, keeping their shape and transparency
    lc.globalCompositeOperation = "source-atop";
    lc.fillStyle = `rgba(${end},${fix.k.toFixed(3)})`;
    lc.fillRect(0, 0, W, H);
  }
  lc.restore();
  if (mode === "outline") {
    // A contrasting edge around the glyphs, under the lyrics in their own color
    edge ??= document.createElement("canvas");
    if (edge.width !== W || edge.height !== H) {
      edge.width = W;
      edge.height = H;
    }
    const ec = edge.getContext("2d");
    if (ec) {
      ec.setTransform(1, 0, 0, 1, 0, 0);
      ec.globalCompositeOperation = "source-over";
      ec.clearRect(0, 0, W, H);
      ec.drawImage(layer, 0, 0);
      ec.globalCompositeOperation = "source-in";
      ec.fillStyle = fix.toward === "white" ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)";
      ec.fillRect(0, 0, W, H);
      ec.globalCompositeOperation = "source-over";
      const r = Math.max(1.5, H * 0.0028);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.drawImage(edge, Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.restore();
    }
    // The lyrics themselves go on top exactly as the theme draws them
    return draw(ctx);
  }
  copy();
  return box;
}
