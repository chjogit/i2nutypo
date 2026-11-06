import type { Ctx2D } from "../motifs";
import { recordTextBounds, type Box } from "../text-bounds";
import { clamp01, hash01, hashSigned } from "./noise";

// Letters broken into pieces: the line is drawn once onto a spare canvas, then
// copied back in many small parts that fly, turn and gather. Positions come
// only from the time and a hash, so the preview and every export match.

/** One triangle of the shattered line, in device pixels. */
export interface Shard {
  a: [number, number];
  b: [number, number];
  c: [number, number];
  /** Middle of the triangle, which it turns about. */
  mx: number;
  my: number;
  /** 0..1, used for its own direction, spin and start time. */
  r: number;
}

/** One square dot of the line, in device pixels. */
export interface Dot {
  x: number;
  y: number;
  r: number;
}

const MAX_SHARDS = 180;
const MAX_DOTS = 900;

/**
 * Triangles that tile `box` without gaps: a grid whose inner corners are
 * nudged a little (shared by the neighbours, so the edges still meet), each
 * cell cut along one of its diagonals.
 */
export function shardsOf(box: Box, seed: number): Shard[] {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (!(w > 0 && h > 0)) return [];
  const size = Math.max(4, Math.min(h / 2.5, Math.sqrt((w * h) / (MAX_SHARDS / 2))));
  const cols = Math.max(1, Math.round(w / size));
  const rows = Math.max(1, Math.round(h / size));
  const cw = w / cols;
  const ch = h / rows;
  const pt = (i: number, j: number): [number, number] => {
    const inner = i > 0 && i < cols && j > 0 && j < rows;
    const jx = inner ? hashSigned(i * 131 + j, seed + 17) * cw * 0.32 : 0;
    const jy = inner ? hashSigned(i * 131 + j, seed + 29) * ch * 0.32 : 0;
    return [box.x0 + i * cw + jx, box.y0 + j * ch + jy];
  };
  const out: Shard[] = [];
  const push = (a: [number, number], b: [number, number], c: [number, number], k: number) =>
    out.push({ a, b, c, mx: (a[0] + b[0] + c[0]) / 3, my: (a[1] + b[1] + c[1]) / 3, r: hash01(k, seed + 3) });
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p00 = pt(i, j);
      const p10 = pt(i + 1, j);
      const p01 = pt(i, j + 1);
      const p11 = pt(i + 1, j + 1);
      const k = (j * cols + i) * 2;
      if (hash01(k, seed + 41) < 0.5) {
        push(p00, p10, p11, k);
        push(p00, p11, p01, k + 1);
      } else {
        push(p00, p10, p01, k);
        push(p10, p11, p01, k + 1);
      }
    }
  }
  return out;
}

/** Square dots covering `box`, about `size` device pixels each (fewer, bigger ones on a long line). */
export function dotsOf(box: Box, seed: number, size: number): { dots: Dot[]; size: number } {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (!(w > 0 && h > 0)) return { dots: [], size };
  const s = Math.max(size, Math.sqrt((w * h) / MAX_DOTS));
  const cols = Math.max(1, Math.ceil(w / s));
  const rows = Math.max(1, Math.ceil(h / s));
  const dots: Dot[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      dots.push({ x: box.x0 + i * s, y: box.y0 + j * s, r: hash01(j * cols + i, seed + 7) });
  return { dots, size: s };
}

/**
 * Where the dots wait between two lines: a loose ring around the middle of
 * the frame, the same for every line, so one line's dots fly out to it and
 * the next line's dots come in from it, which reads as one cloud re-forming.
 */
export function cloudAt(r: number, W: number, H: number, t: number): [number, number] {
  const turn = r * Math.PI * 2 + t * 0.6;
  const reach = 0.18 + hash01(Math.floor(r * 1e6), 11) * 0.22;
  return [W / 2 + Math.cos(turn) * W * reach, H / 2 + Math.sin(turn) * H * reach * 1.3];
}

let spare: HTMLCanvasElement | OffscreenCanvas | null = null;

function spareCtx(w: number, h: number): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  if (!spare) {
    if (typeof OffscreenCanvas !== "undefined") spare = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") spare = document.createElement("canvas");
    else return null;
  }
  if (spare.width !== w || spare.height !== h) {
    spare.width = w;
    spare.height = h;
  }
  const c = spare.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
  c.filter = "none";
  c.clearRect(0, 0, w, h);
  return c;
}

export interface Captured {
  image: CanvasImageSource;
  /** Where the line's text sits with room for its glow, in device pixels. */
  box: Box;
  /** The text alone. */
  text: Box;
}

/**
 * Draws the line (`paint`, at rest) onto the spare canvas through ctx's
 * current transform and filter, so its pixels line up with ctx's. Null when
 * there is no canvas to draw on (tests) or nothing was drawn.
 */
export function capture(ctx: Ctx2D, paint: (c: Ctx2D) => void): Captured | null {
  const canvas = (ctx as CanvasRenderingContext2D).canvas as { width: number; height: number } | undefined;
  if (!canvas || !(canvas.width > 0 && canvas.height > 0)) return null;
  const c = spareCtx(canvas.width, canvas.height);
  if (!c || !spare) return null;
  c.setTransform(ctx.getTransform());
  c.filter = (ctx as CanvasRenderingContext2D).filter ?? "none";
  const box = recordTextBounds(c as Ctx2D, () => paint(c as Ctx2D));
  if (!box) return null;
  // Glow, outline and shadows reach past the letters themselves
  const pad = (box.y1 - box.y0) * 0.35 + 2;
  return {
    image: spare,
    text: box,
    box: {
      x0: Math.max(0, box.x0 - pad),
      y0: Math.max(0, box.y0 - pad),
      x1: Math.min(canvas.width, box.x1 + pad),
      y1: Math.min(canvas.height, box.y1 + pad),
    },
  };
}

/**
 * Copies the shards back onto ctx (device pixels), each moved by `place`:
 * how far along it is (0 far away .. 1 home), the offset, turn and scale.
 */
export function drawShards(
  ctx: Ctx2D,
  cap: Captured,
  shards: readonly Shard[],
  place: (s: Shard) => { p: number; dx: number; dy: number; rot: number; scale: number; alpha: number },
): void {
  const alpha = ctx.globalAlpha;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  for (const s of shards) {
    const q = place(s);
    if (q.alpha <= 0.002 || q.scale <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = alpha * clamp01(q.alpha);
    ctx.translate(s.mx + q.dx, s.my + q.dy);
    if (q.rot) ctx.rotate(q.rot);
    if (q.scale !== 1) ctx.scale(q.scale, q.scale);
    ctx.translate(-s.mx, -s.my);
    ctx.beginPath();
    ctx.moveTo(s.a[0], s.a[1]);
    ctx.lineTo(s.b[0], s.b[1]);
    ctx.lineTo(s.c[0], s.c[1]);
    ctx.closePath();
    ctx.clip();
    // A hair wider than the triangle so neighbouring pieces leave no seam at home
    const x0 = Math.floor(Math.min(s.a[0], s.b[0], s.c[0])) - 1;
    const y0 = Math.floor(Math.min(s.a[1], s.b[1], s.c[1])) - 1;
    const x1 = Math.ceil(Math.max(s.a[0], s.b[0], s.c[0])) + 1;
    const y1 = Math.ceil(Math.max(s.a[1], s.b[1], s.c[1])) + 1;
    ctx.drawImage(cap.image, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }
  ctx.restore();
}

/** Copies the dots back onto ctx (device pixels), each at the spot and size `place` gives. */
export function drawDots(
  ctx: Ctx2D,
  cap: Captured,
  dots: readonly Dot[],
  size: number,
  place: (d: Dot) => { x: number; y: number; scale: number; alpha: number },
): void {
  const alpha = ctx.globalAlpha;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  for (const d of dots) {
    const q = place(d);
    const s = size * q.scale;
    if (q.alpha <= 0.002 || s < 0.3) continue;
    ctx.globalAlpha = alpha * clamp01(q.alpha);
    ctx.drawImage(cap.image, d.x, d.y, size, size, q.x - s / 2, q.y - s / 2, s, s);
  }
  ctx.restore();
}
