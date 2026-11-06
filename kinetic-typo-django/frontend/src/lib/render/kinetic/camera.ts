import type { LyricLine, StyleSettings } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { SNAPPY_SPRING, springAt } from "./easing";
import { motionStyleOf } from "./styles";

// A virtual camera over the whole picture (background, decorations, lyrics;
// not the screen overlays or the bottom subtitles): a slow zoom that drifts
// between 1 and 1 + drift and back, and a spring punch (1.08 → 1) on the
// marked words, on " !" lines, and on every line in the hype style. "Turn off
// every vibration" (noVibration) or the camera switch stops all of it.

export interface CameraPose {
  scale: number;
  x: number;
  y: number;
  rot: number;
}

export const IDENTITY_CAMERA: CameraPose = { scale: 1, x: 0, y: 0, rot: 0 };

/** Seconds a punch keeps working after its hit. */
const PUNCH_SEC = 0.9;

/** Moments in the line that punch: its start (when asked) and each marked word's start. */
export function punchTimes(line: LyricLine, onLineStart: boolean): number[] {
  const out: number[] = [];
  if (onLineStart || (line.lineStyle.flash ?? 0) > 0) out.push(line.startTime);
  for (const w of line.words) if (w.isAccent) out.push(line.startTime + w.startOffset);
  return out;
}

/** 1 → 0 strength of the strongest punch at timeSec (0 when none is working), and which hit it is. */
export function punchAt(times: readonly number[], timeSec: number): { p: number; hit: number } {
  let best = 0;
  let hit = -1;
  times.forEach((t, i) => {
    const k = timeSec - t;
    if (k < 0 || k > PUNCH_SEC) return;
    // The spring runs 0 → 1 with an overshoot; the punch is what is left of it
    const p = 1 - springAt(k, SNAPPY_SPRING);
    if (Math.abs(p) > Math.abs(best)) {
      best = p;
      hit = i;
    }
  });
  return { p: best, hit };
}

/**
 * The camera for one frame. `lines` are the active line and the one before
 * it, so a punch late in a line carries over the line change.
 */
export function cameraAt(
  style: Pick<StyleSettings, "motionStyle" | "kineticCamera" | "noVibration">,
  lines: readonly (LyricLine | null)[],
  timeSec: number,
  W: number,
  H: number,
): CameraPose {
  const def = motionStyleOf(style);
  if (!def || style.noVibration || style.kineticCamera === false) return IDENTITY_CAMERA;
  const { drift, period, punch, punchOnLine } = def.camera;
  // Slow breathing zoom from 1 to 1 + drift: a cosine, so it never stops or starts with a jolt
  const phase = (timeSec / period) * Math.PI * 2;
  const breathe = 0.5 - 0.5 * Math.cos(phase);
  let scale = 1 + drift * breathe;
  const x = Math.sin(phase * 0.5 + 0.7) * W * drift * 0.12;
  const y = Math.sin(phase * 0.37 + 1.9) * H * drift * 0.08;
  let rot = 0;
  if (punch > 0) {
    const times = lines.flatMap((l) => (l ? punchTimes(l, punchOnLine) : []));
    const { p, hit } = punchAt(times, timeSec);
    scale += punch * p;
    if (punchOnLine && hit >= 0) rot = p * 0.006 * (Math.round(times[hit] * 10) % 2 === 0 ? 1 : -1);
  }
  // Never smaller than the frame, so the edges are never uncovered
  return { scale: Math.max(1, scale), x, y, rot };
}

/** Sets the camera on ctx about the middle of the frame. */
export function applyCamera(ctx: Ctx2D, cam: CameraPose, W: number, H: number): void {
  if (cam === IDENTITY_CAMERA || (cam.scale === 1 && cam.x === 0 && cam.y === 0 && cam.rot === 0)) return;
  // Pan only as far as the zoom leaves room for, so no edge shows
  const room = (cam.scale - 1) / 2;
  const x = Math.max(-W * room, Math.min(W * room, cam.x));
  const y = Math.max(-H * room, Math.min(H * room, cam.y));
  ctx.translate(W / 2 + x, H / 2 + y);
  if (cam.rot) ctx.rotate(cam.rot);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-W / 2, -H / 2);
}
