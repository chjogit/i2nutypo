import type { CueEffect, PropAsset, PropClip } from "@/types/project";
import { CELLS } from "@/lib/render/looks/layout";

/** Shortest clip, in seconds. */
export const MIN_CLIP = 0.2;
const DEFAULT_CLIP_LENGTH = 4;

let seq = 0;
/** Ids unique within the page session (props are not saved). */
export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A clip starting at `at`, placed upper right and sized for a small prop, cut short by the song's end. */
export function makeClip(at: number, duration: number): PropClip {
  const start = round2(clamp(at, 0, Math.max(0, duration - MIN_CLIP)));
  return {
    id: newId("clip"),
    start,
    end: round2(Math.min(duration, start + DEFAULT_CLIP_LENGTH)),
    x: 0.72,
    y: 0.38,
    scale: 0.3,
    rot: 0,
    opacity: 1,
    // No effect by default, so a new clip shows at once where it was added
    enter: "cut",
    enterSec: 0.5,
    exit: "cut",
    exitSec: 0.5,
    shake: 0,
    beat: 0,
    cells: Array<boolean>(CELLS).fill(false),
    front: false,
    flip: false,
  };
}

/** Anything laid on a timeline lane: illustration clips and theme clips. */
export interface Span {
  id: string;
  start: number;
  end: number;
}

export const sortClips = <T extends Span>(clips: readonly T[]): T[] =>
  [...clips].sort((a, b) => a.start - b.start);

/**
 * Keeps an edited clip inside the song, at least MIN_CLIP long, and between its
 * neighbors in the lane (found from where it was, `cur`). A move (both ends
 * changed) keeps the length; dragging one end stops at the neighbor.
 */
export function fitClip<T extends Span>(next: T, cur: T, others: readonly T[], duration: number): T {
  let lo = 0;
  let hi = duration;
  for (const o of others) {
    if (o.id === cur.id) continue;
    if (o.start < cur.start) lo = Math.max(lo, o.end);
    else hi = Math.min(hi, o.start);
  }
  // A new clip (passed as both): cut short at the next clip
  if (next === cur) return { ...next, end: round2(Math.min(next.end, hi)) };
  if (next.start !== cur.start && next.end !== cur.end) {
    const len = Math.min(next.end - next.start, hi - lo);
    const start = clamp(next.start, lo, hi - len);
    return { ...next, start: round2(start), end: round2(start + len) };
  }
  if (next.end !== cur.end) {
    return {
      ...next,
      end: round2(clamp(next.end, next.start + MIN_CLIP, Math.max(next.start + MIN_CLIP, hi))),
    };
  }
  return {
    ...next,
    start: round2(clamp(next.start, Math.min(lo, next.end - MIN_CLIP), next.end - MIN_CLIP)),
  };
}

/** True when no clip in the lane covers `at`. */
export function freeAt(clips: readonly Span[], at: number): boolean {
  return !clips.some((c) => at >= c.start && at < c.end);
}

/** The clip on screen at timeSec, if any. */
export function clipAt(asset: PropAsset, timeSec: number): PropClip | null {
  return asset.clips.find((c) => timeSec >= c.start && timeSec < c.end) ?? null;
}

/** How much of a clip shows at timeSec (1 fully, 0 gone) and the effect of the transition under way. */
export function clipPresence(clip: PropClip, timeSec: number): { reveal: number; effect: CueEffect } {
  const half = (clip.end - clip.start) / 2;
  const inLen = clip.enter === "cut" ? 0 : Math.min(clip.enterSec, half);
  const outLen = clip.exit === "cut" ? 0 : Math.min(clip.exitSec, half);
  if (timeSec < clip.start || timeSec >= clip.end) return { reveal: 0, effect: clip.exit };
  if (inLen > 0 && timeSec < clip.start + inLen)
    return { reveal: clamp((timeSec - clip.start) / inLen, 0, 1), effect: clip.enter };
  if (outLen > 0 && timeSec > clip.end - outLen)
    return { reveal: clamp((clip.end - timeSec) / outLen, 0, 1), effect: clip.exit };
  return { reveal: 1, effect: clip.enter };
}

/**
 * Where the nearest lyric line start or end lies within `reach` seconds of t,
 * for snapping clip edges to the subtitles; t itself when none is that close.
 */
export function snapToLines(
  t: number,
  lines: ReadonlyArray<{ startTime: number; endTime: number }>,
  reach: number,
): number {
  let best = t;
  let dist = reach;
  for (const l of lines) {
    for (const edge of [l.startTime, l.endTime]) {
      const d = Math.abs(edge - t);
      if (d < dist) {
        dist = d;
        best = edge;
      }
    }
  }
  return best;
}
