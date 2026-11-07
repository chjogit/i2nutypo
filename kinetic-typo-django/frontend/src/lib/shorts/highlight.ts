import type { Section } from "@/lib/structure/sections";

// Picks the part of the song a short (Shorts, Reels, TikTok) is cut from: the
// first chorus when the lyrics show one, else the stretch with the most lyric
// lines. The cut starts a little before the first line of that part and is
// moved to land on a line start or a beat, so the clip opens on something.

export const SHORT_LENGTHS = [15, 30, 60] as const;
export type ShortLength = (typeof SHORT_LENGTHS)[number];

/** Seconds the clip starts before the first sung line, so it does not open mid-word. */
const LEAD_IN = 0.6;

export interface HighlightInput {
  /** Start times of the lyric lines, in order. */
  lineStarts: readonly number[];
  sections: readonly Pick<Section, "kind" | "startTime" | "endTime">[];
  duration: number;
  /** Beat times, to start on a beat when one is close. */
  beats?: readonly number[];
}

export interface Highlight {
  start: number;
  end: number;
  /** Why this part: the chorus, or the busiest stretch of lyrics. */
  reason: "chorus" | "dense" | "start";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The beat nearest to t within `within` seconds, or t. */
function snapToBeat(t: number, beats: readonly number[] | undefined, within = 0.25): number {
  if (!beats || beats.length === 0) return t;
  let best = t;
  let gap = within;
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d <= gap) {
      gap = d;
      best = b;
    }
  }
  return best;
}

/** Start of the window of `length` seconds holding the most line starts (ties go to the earlier one). */
function densestStart(lineStarts: readonly number[], length: number): number {
  let best = lineStarts[0] ?? 0;
  let most = -1;
  for (let i = 0; i < lineStarts.length; i++) {
    let n = 0;
    for (let j = i; j < lineStarts.length && lineStarts[j] < lineStarts[i] + length; j++) n++;
    if (n > most) {
      most = n;
      best = lineStarts[i];
    }
  }
  return best;
}

/** Keeps [start, start + length] inside the song, moving it back from the end when needed. */
function fit(start: number, length: number, duration: number): { start: number; end: number } {
  const len = Math.min(length, duration);
  const s = Math.max(0, Math.min(start, duration - len));
  return { start: round2(s), end: round2(s + len) };
}

/** The part of the song to cut a short of `length` seconds from. */
export function pickHighlight(input: HighlightInput, length: number): Highlight {
  const { lineStarts, sections, duration, beats } = input;
  if (duration <= 0) return { start: 0, end: 0, reason: "start" };
  const chorus = sections.find((s) => s.kind === "chorus");
  let reason: Highlight["reason"];
  let from: number;
  if (chorus) {
    reason = "chorus";
    from = chorus.startTime;
  } else if (lineStarts.length > 0) {
    reason = "dense";
    from = densestStart(lineStarts, length);
  } else {
    return { ...fit(0, length, duration), reason: "start" };
  }
  const start = snapToBeat(Math.max(0, from - LEAD_IN), beats);
  return { ...fit(start, length, duration), reason };
}

/**
 * Gain 0..1 at `t` seconds into a clip of `length` seconds that fades in over
 * `fadeIn` and out over `fadeOut` (an equal-power curve, so it never dips).
 */
export function edgeGain(t: number, length: number, fadeIn: number, fadeOut: number): number {
  let g = 1;
  if (fadeIn > 0 && t < fadeIn) g = Math.min(g, Math.sin((Math.max(0, t) / fadeIn) * (Math.PI / 2)));
  const left = length - t;
  if (fadeOut > 0 && left < fadeOut) g = Math.min(g, Math.sin((Math.max(0, left) / fadeOut) * (Math.PI / 2)));
  return g;
}

/**
 * Where a short platform's own buttons and caption sit over a 9:16 video, as
 * shares of the frame: keep lyrics out of these (top bar, bottom caption, the
 * column of buttons at the right).
 */
export const SHORTS_SAFE = { top: 0.1, bottom: 0.2, right: 0.14, left: 0.04 } as const;
