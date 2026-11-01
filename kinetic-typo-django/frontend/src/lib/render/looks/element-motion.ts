import type { ElementMotion } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { textSeed } from "@/lib/random";
import { hash01, hashSigned } from "./noise";

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
