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

// With the vocals separated out, quiet means nobody is singing, so windows can
// follow the singing: silence is skipped, and each window ends at the quietest
// moment of its last stretch instead of a fixed point that may cut a word.

const FRAME_SEC = 0.02;
/** A frame is voiced above this share of the song's loud level (95th percentile of frame levels). */
const VOICED_SHARE = 0.08;
const MIN_VOICED_RMS = 0.002;
/** Windows end at the quietest point in this range after their start. */
const MIN_WINDOW_SEC = 18;
const MAX_KEEP_SEC = WINDOW_SEC - 1;
/** Heard audio around the kept span, so words at the edges are heard whole. */
const EDGE_SEC = 0.5;
/** Silence shorter than this is not skipped. */
const SKIP_GAP_SEC = 2;
const SMOOTH_FRAMES = 15;

function frameLevels(samples: Float32Array, sampleRate: number): Float32Array {
  const size = Math.round(FRAME_SEC * sampleRate);
  const levels = new Float32Array(Math.ceil(samples.length / size));
  for (let f = 0; f < levels.length; f++) {
    let sum = 0;
    const end = Math.min(samples.length, (f + 1) * size);
    for (let i = f * size; i < end; i++) sum += samples[i] * samples[i];
    levels[f] = Math.sqrt(sum / Math.max(1, end - f * size));
  }
  return levels;
}

/** Windows over the stretches where the (separated) vocals are heard. */
export function planVoicedWindows(samples: Float32Array, sampleRate: number): AudioWindow[] {
  const duration = samples.length / sampleRate;
  const levels = frameLevels(samples, sampleRate);
  if (levels.length === 0) return [];
  const sorted = Float32Array.from(levels).sort();
  const loud = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const threshold = Math.max(MIN_VOICED_RMS, loud * VOICED_SHARE);
  const voiced = Array.from(levels, (l) => l >= threshold);
  const smooth = levels.map((_, f) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, f - SMOOTH_FRAMES); k <= Math.min(levels.length - 1, f + SMOOTH_FRAMES); k++) {
      s += levels[k];
      n++;
    }
    return s / n;
  });
  const nextVoiced = (from: number) => {
    for (let f = Math.max(0, from); f < voiced.length; f++) if (voiced[f]) return f;
    return -1;
  };

  const windows: AudioWindow[] = [];
  let cursor = 0; // frame
  for (;;) {
    const v = nextVoiced(cursor);
    if (v < 0) break;
    if ((v - cursor) * FRAME_SEC >= SKIP_GAP_SEC) cursor = Math.max(0, v - Math.round(EDGE_SEC / FRAME_SEC));
    const startSec = cursor * FRAME_SEC;
    let endFrame: number;
    if (duration - startSec <= MAX_KEEP_SEC) {
      endFrame = levels.length;
    } else {
      endFrame = cursor + Math.round(MIN_WINDOW_SEC / FRAME_SEC);
      const last = cursor + Math.round(MAX_KEEP_SEC / FRAME_SEC);
      for (let f = endFrame; f <= last; f++) if (smooth[f] < smooth[endFrame]) endFrame = f;
    }
    const keepTo = Math.min(duration, endFrame * FRAME_SEC);
    windows.push({
      start: Math.max(0, startSec - EDGE_SEC),
      end: Math.min(duration, keepTo + EDGE_SEC),
      keepFrom: startSec,
      keepTo,
    });
    if (endFrame >= levels.length) break;
    cursor = endFrame;
  }
  if (windows.length) {
    windows[0].keepFrom = 0;
    windows[windows.length - 1].keepTo = Infinity;
  }
  return windows;
}
