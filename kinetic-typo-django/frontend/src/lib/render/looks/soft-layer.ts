import type { Ctx2D } from "../motifs";

// Soft, blurry parts of a theme (nebula haze, aurora, neon glow) look the same
// drawn at a fraction of the frame's pixels and scaled up, and cost a fraction
// of the fill. Each part gets its own scratch canvas, reused between frames.

type Scratch = OffscreenCanvas | HTMLCanvasElement;
type ScratchCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const scratches = new Map<string, { canvas: Scratch; ctx: ScratchCtx }>();
/** A few parts per theme, and preview and export sizes: drop all when it grows past this. */
const MAX_SCRATCHES = 12;

function scratchFor(key: string, w: number, h: number): { canvas: Scratch; ctx: ScratchCtx } | null {
  const id = `${key}:${w}x${h}`;
  const hit = scratches.get(id);
  if (hit) return hit;
  let canvas: Scratch;
  if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(w, h);
  else if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
  } else return null;
  const ctx = canvas.getContext("2d") as ScratchCtx | null;
  if (!ctx) return null;
  if (scratches.size >= MAX_SCRATCHES) scratches.clear();
  const entry = { canvas, ctx };
  scratches.set(id, entry);
  return entry;
}

/**
 * Paints `paint` (in the frame's logical W×H coordinates) at `share` of the
 * frame's pixel size and draws it over the frame with `composite`, under the
 * frame's current transform (so the beat shake still moves it). Falls back to
 * painting straight onto ctx where there is no canvas to borrow (tests).
 */
export function drawSoftLayer(
  ctx: Ctx2D,
  W: number,
  H: number,
  key: string,
  share: number,
  paint: (c: Ctx2D) => void,
  composite: GlobalCompositeOperation = "source-over",
): void {
  const device = (ctx as CanvasRenderingContext2D).canvas as Scratch | undefined;
  const deviceW = device && typeof device.width === "number" ? device.width : 0;
  const w = Math.max(1, Math.round(deviceW * share));
  const h = Math.max(1, Math.round((w * H) / W));
  const s = deviceW > 0 ? scratchFor(key, w, h) : null;
  if (!s) {
    ctx.save();
    ctx.globalCompositeOperation = composite;
    paint(ctx);
    ctx.restore();
    return;
  }
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.globalCompositeOperation = "source-over";
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
  paint(s.ctx);
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(s.canvas, 0, 0, W, H);
  ctx.restore();
}
