import type { ElementMotion } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { textSeed } from "@/lib/random";
import { hash01, hashSigned, withAlpha } from "./noise";
import { CELLS, GRID } from "./layout";

// Movement the themes' elements make on their own, so a theme does not show
// the same picture in the same place for the whole song: they float, slide to
// a new place when the line changes, and are drawn on again as they arrive.

/** Which lyric line the song is on (counting the gaps after a line as part of it). */
export interface HopClock {
  /** Index of the latest line that has started, -1 before the first. */
  index: number;
  /** Seconds since that line started. */
  elapsed: number;
}

export interface ElementPose {
  dx: number;
  dy: number;
  rot: number;
  /** 0..1, how much of the element is drawn so far; 1 is whole. */
  reveal: number;
  /** Shape the element is drawn on with. */
  revealShape: number;
}

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

const HOP_SEC = 0.9;
const DRAW_SEC = 0.7;

/** Where element `id` sits now relative to its own place, and how much of it shows. */
export function elementPose(
  motion: ElementMotion | undefined,
  id: string,
  timeSec: number,
  hop: HopClock | undefined,
  W: number,
  H: number,
): ElementPose {
  const still = { dx: 0, dy: 0, rot: 0, reveal: 1, revealShape: 0 };
  if (!motion || motion.mode === "still" || motion.amount <= 0) return still;
  const a = motion.amount;
  const k = textSeed(id) % 1000;
  const drifts = motion.mode === "drift" || motion.mode === "organic";
  const hops = motion.mode === "hop" || motion.mode === "organic";
  const draws = motion.mode === "draw" || motion.mode === "organic";
  const pose = { ...still };
  if (drifts) {
    pose.dx += (Math.sin(timeSec * 0.23 + k) * 0.03 + Math.sin(timeSec * 0.61 + k * 2) * 0.01) * a * W;
    pose.dy += (Math.cos(timeSec * 0.19 + k * 3) * 0.025 + Math.sin(timeSec * 0.47 + k) * 0.008) * a * H;
    pose.rot += Math.sin(timeSec * 0.17 + k) * a * 4;
  }
  if (hops && hop) {
    const at = (i: number) =>
      i < 0
        ? { x: 0, y: 0, r: 0 }
        : { x: hashSigned(i, k) * 0.2, y: hashSigned(i, k + 1) * 0.14, r: hashSigned(i, k + 2) * 12 };
    const from = at(hop.index - 1);
    const to = at(hop.index);
    const e = ease(hop.elapsed / HOP_SEC);
    pose.dx += (from.x + (to.x - from.x) * e) * a * W;
    pose.dy += (from.y + (to.y - from.y) * e) * a * H;
    pose.rot += (from.r + (to.r - from.r) * e) * a;
  }
  // Mixed with the other motions, an element is drawn on again only now and then
  const drawsNow =
    draws && (motion.mode === "draw" || (hop !== undefined && hash01(hop.index, k + 9) < 0.35));
  if (drawsNow && hop && hop.index >= 0) {
    pose.reveal = ease(hop.elapsed / DRAW_SEC);
    pose.revealShape = Math.floor(hash01(hop.index, k + 5) * 3);
  }
  return pose;
}

/** Clips ctx to the part of an element around `pivot` drawn so far (iris, left-to-right, top-down). */
export function clipDrawOn(
  ctx: Ctx2D,
  pivot: { x: number; y: number },
  W: number,
  H: number,
  pose: ElementPose,
) {
  if (pose.reveal >= 1) return;
  const span = Math.hypot(W, H);
  ctx.beginPath();
  if (pose.revealShape === 0)
    ctx.arc(pivot.x, pivot.y, Math.max(0.5, pose.reveal * span * 0.6), 0, Math.PI * 2);
  else if (pose.revealShape === 1) ctx.rect(pivot.x - span, pivot.y - span, span * 2 * pose.reveal, span * 2);
  else ctx.rect(pivot.x - span, pivot.y - span, span * 2, span * 2 * pose.reveal);
  ctx.clip();
}

// Hand-drawn marks around the lyrics

type Mark =
  "circle" | "swoosh" | "sparkle" | "corner" | "zigzag" | "cross" | "spiral" | "dots" | "wave" | "arrow";

const MARKS: readonly Mark[] = [
  "circle",
  "swoosh",
  "sparkle",
  "corner",
  "zigzag",
  "cross",
  "spiral",
  "dots",
  "wave",
  "arrow",
];

export interface MarkFrame {
  ctx: Ctx2D;
  W: number;
  H: number;
  timeSec: number;
  hop: HopClock | undefined;
  motion: ElementMotion | undefined;
  /** Cells the lyrics keep out of; marks keep out of the middle and of these. */
  blocked: readonly boolean[];
  color: string;
  second: string;
  /** Glow for neon-like themes, ink-thick strokes for brush themes. */
  stroke: "pen" | "glow" | "brush";
  energy: number;
}

/** Cells near the edges (not the middle four, where the lyrics usually are). */
const EDGE_CELLS = Array.from({ length: CELLS }, (_, c) => c).filter((c) => {
  const x = c % GRID;
  const y = Math.floor(c / GRID);
  return x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1;
});

/** Path for one mark centered at 0,0 and about `s` across. */
function markPath(ctx: Ctx2D, m: Mark, s: number, seed: number) {
  ctx.beginPath();
  const r = s / 2;
  switch (m) {
    case "circle":
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2.15 - 0.4;
        const rr = r * (0.9 + 0.1 * Math.sin(a * 3 + seed));
        const p = [Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.8] as const;
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      return;
    case "swoosh":
      ctx.moveTo(-r * 1.4, r * 0.2);
      ctx.bezierCurveTo(-r * 0.5, r * 0.6, r * 0.4, r * 0.5, r * 1.4, -r * 0.3);
      return;
    case "sparkle":
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        ctx.moveTo(dx * r * 0.15, dy * r * 0.15);
        ctx.lineTo(dx * r, dy * r);
      }
      return;
    case "corner":
      ctx.moveTo(-r, r * 0.2);
      ctx.lineTo(-r, -r);
      ctx.lineTo(-r * 0.2, -r);
      ctx.moveTo(r, -r * 0.2);
      ctx.lineTo(r, r);
      ctx.lineTo(r * 0.2, r);
      return;
    case "zigzag":
      ctx.moveTo(-r * 1.3, 0);
      for (let i = 1; i <= 6; i++) ctx.lineTo(-r * 1.3 + (i * r * 2.6) / 6, i % 2 ? -r * 0.35 : r * 0.35);
      return;
    case "cross":
      ctx.moveTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.6, r * 0.6);
      ctx.moveTo(r * 0.6, -r * 0.6);
      ctx.lineTo(-r * 0.6, r * 0.6);
      return;
    case "spiral":
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * Math.PI * 5;
        const rr = (i / 60) * r;
        if (i === 0) ctx.moveTo(0, 0);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      return;
    case "dots":
      for (let i = 0; i < 5; i++) {
        ctx.moveTo(-r + (i * r) / 2 + r * 0.06, 0);
        ctx.arc(-r + (i * r) / 2, 0, r * 0.06, 0, Math.PI * 2);
      }
      return;
    case "wave":
      for (let i = 0; i <= 30; i++) {
        const x = -r * 1.4 + (i / 30) * r * 2.8;
        const y = Math.sin((i / 30) * Math.PI * 3) * r * 0.25;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      return;
    case "arrow":
      ctx.moveTo(-r, r * 0.5);
      ctx.quadraticCurveTo(-r * 0.2, -r * 0.8, r * 0.8, -r * 0.2);
      ctx.moveTo(r * 0.8, -r * 0.2);
      ctx.lineTo(r * 0.35, -r * 0.45);
      ctx.moveTo(r * 0.8, -r * 0.2);
      ctx.lineTo(r * 0.5, r * 0.2);
      return;
  }
}

/** Rough length of a mark's path, for drawing it on with a dash. */
const MARK_LENGTH: Record<Mark, number> = {
  circle: 7.2,
  swoosh: 3.2,
  sparkle: 3.4,
  corner: 5.6,
  zigzag: 3.6,
  cross: 3.4,
  spiral: 8,
  dots: 2,
  wave: 3.4,
  arrow: 3.4,
};

/**
 * Two marks for each line, drawn on stroke by stroke as the line starts, held,
 * and faded out as the next line's marks come in elsewhere.
 */
export function drawOrganicMarks(f: MarkFrame): void {
  const amount = f.motion?.marks ?? 0;
  if (amount <= 0 || !f.hop || f.hop.index < 0) return;
  const { ctx, W, H } = f;
  const free = EDGE_CELLS.filter((c) => !f.blocked[c]);
  if (free.length === 0) return;
  const ms = Math.min(W, H);
  const count = amount > 0.66 ? 3 : 2;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [idx, elapsed, fade] of [
    [f.hop.index, f.hop.elapsed, 1],
    // The last line's marks fade out over the first moments of this one
    [f.hop.index - 1, f.hop.elapsed + 99, Math.max(0, 1 - f.hop.elapsed / 0.4)],
  ] as const) {
    if (idx < 0 || fade <= 0) continue;
    for (let j = 0; j < count; j++) {
      const mark = MARKS[Math.floor(hash01(idx, j * 11) * MARKS.length)];
      const cell = free[Math.floor(hash01(idx, j * 11 + 1) * free.length)];
      const cx = ((cell % GRID) + 0.5 + hashSigned(idx, j * 11 + 2) * 0.3) * (W / GRID);
      const cy = (Math.floor(cell / GRID) + 0.5 + hashSigned(idx, j * 11 + 3) * 0.3) * (H / GRID);
      const size = ms * (0.07 + hash01(idx, j * 11 + 4) * 0.08) * (0.7 + amount * 0.6);
      const delay = j * 0.18;
      const p = Math.min(1, Math.max(0, (elapsed - delay) / 0.55));
      if (p <= 0) continue;
      const lw = (f.stroke === "brush" ? 0.11 : 0.05) * size * (1 + f.energy * 0.3);
      const len = MARK_LENGTH[mark] * size;
      ctx.save();
      ctx.translate(
        cx + Math.sin(f.timeSec * 0.8 + j) * size * 0.05,
        cy + Math.cos(f.timeSec * 0.7 + j) * size * 0.05,
      );
      ctx.rotate(hashSigned(idx, j * 11 + 5) * 0.6);
      ctx.globalAlpha *= fade * (0.55 + 0.45 * amount);
      ctx.strokeStyle = j % 2 ? withAlpha(f.second, 0.9) : withAlpha(f.color, 0.95);
      ctx.lineWidth = Math.max(1, lw);
      if (f.stroke === "glow") {
        ctx.shadowColor = f.color;
        ctx.shadowBlur = size * 0.25;
      }
      ctx.setLineDash([len * p, len * 2]);
      markPath(ctx, mark, size, idx + j);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** The line clock at timeSec from the song's lines (overlapping "&" lines left out). */
export function hopClock(
  lines: ReadonlyArray<{ startTime: number; overlap: boolean }>,
  timeSec: number,
): HopClock {
  let index = -1;
  let start = 0;
  let n = 0;
  for (const l of lines) {
    if (l.overlap) continue;
    if (l.startTime <= timeSec) {
      index = n;
      start = l.startTime;
    }
    n++;
  }
  return { index, elapsed: index < 0 ? 0 : timeSec - start };
}
