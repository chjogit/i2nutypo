import type { TranscriptChunk } from "./align";

// The worker cuts the song into its own fixed windows and transcribes each
// one on its own, instead of letting the pipeline chunk and stitch long audio.
// Each window's times are relative to its own start, so adding the window's
// offset is exact; a long interlude can no longer shift everything after it.

/** Whisper hears 30 s at a time. */
export const WINDOW_SEC = 30;
/** Neighbouring windows overlap so a word cut at one edge is heard whole in the other. */
export const OVERLAP_SEC = 4;
/** RMS under this is silence; such windows are skipped (Whisper invents text in silence). */
const SILENCE_RMS = 0.003;

export interface AudioWindow {
  /** Window span in song seconds. */
  start: number;
  end: number;
  /** Words whose middle falls in [keepFrom, keepTo) belong to this window. */
  keepFrom: number;
  keepTo: number;
}

export function planWindows(durationSec: number): AudioWindow[] {
  const step = WINDOW_SEC - OVERLAP_SEC;
  const windows: AudioWindow[] = [];
  for (let start = 0; start < durationSec; start += step) {
    const end = Math.min(durationSec, start + WINDOW_SEC);
    windows.push({ start, end, keepFrom: start === 0 ? 0 : start + OVERLAP_SEC / 2, keepTo: end });
    if (end >= durationSec) break;
  }
  // Each overlap is split down the middle between its two windows
  for (let i = 0; i < windows.length - 1; i++) windows[i].keepTo = windows[i + 1].keepFrom;
  windows[windows.length - 1].keepTo = Infinity;
  return windows;
}

/** Moves a window's chunks to song time and keeps the ones that belong to it. */
export function placeWindowChunks(relative: readonly TranscriptChunk[], w: AudioWindow): TranscriptChunk[] {
  return relative
    .map((c) => ({ text: c.text, start: c.start + w.start, end: Math.min(c.end, w.end - w.start) + w.start }))
    .filter((c) => {
      const mid = (c.start + c.end) / 2;
      return mid >= w.keepFrom && mid < w.keepTo;
    });
}

export function isSilent(samples: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length)) < SILENCE_RMS;
}
