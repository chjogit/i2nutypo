import type { PropAsset, PropClip } from "@/types/project";

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
    fade: 0.3,
    front: false,
    flip: false,
  };
}

export const sortClips = (clips: readonly PropClip[]): PropClip[] =>
  [...clips].sort((a, b) => a.start - b.start);

/**
 * Keeps an edited clip inside the song, at least MIN_CLIP long, and between its
 * neighbors in the lane (found from where it was, `cur`). A move (both ends
 * changed) keeps the length; dragging one end stops at the neighbor.
 */
export function fitClip(
  next: PropClip,
  cur: PropClip,
  others: readonly PropClip[],
  duration: number,
): PropClip {
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
export function freeAt(clips: readonly PropClip[], at: number): boolean {
  return !clips.some((c) => at >= c.start && at < c.end);
}

/** The clip on screen at timeSec, if any. */
export function clipAt(asset: PropAsset, timeSec: number): PropClip | null {
  return asset.clips.find((c) => timeSec >= c.start && timeSec < c.end) ?? null;
}

/** Opacity at timeSec: the clip's own, faded in and out at its ends. */
export function clipAlpha(clip: PropClip, timeSec: number): number {
  const f = Math.min(clip.fade, (clip.end - clip.start) / 2);
  const edge = f > 0 ? Math.min(1, (timeSec - clip.start) / f, (clip.end - timeSec) / f) : 1;
  return clip.opacity * clamp(edge, 0, 1);
}
