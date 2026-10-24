import type { SfxClip, SoundAsset } from "@/types/project";
import { clipBuffer } from "./mix";

// Plays the timeline's sound effects along with the preview, and previews a
// sound from the library. Its own AudioContext, started from a click.

let ctx: AudioContext | null = null;
const playing = new Set<AudioBufferSourceNode>();

function context(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a user gesture (play, preview) so the browser lets sound start. */
export function wakeSfx(): void {
  context();
}

export function playBuffer(buf: AudioBuffer, offset = 0, gain = 1, duration?: number): void {
  const c = context();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  src.onended = () => playing.delete(src);
  playing.add(src);
  src.start(0, Math.max(0, offset), duration);
}

export function stopAllSfx(): void {
  for (const s of playing) {
    try {
      s.stop();
    } catch {
      // Already stopped
    }
  }
  playing.clear();
}

/** Plays one clip from `offset` seconds into it. */
export async function playClip(clip: SfxClip, sounds: readonly SoundAsset[], offset = 0): Promise<void> {
  const buf = await clipBuffer(clip, sounds);
  const len = clip.end - clip.start;
  if (buf && offset < len) playBuffer(buf, offset, clip.gain, len - offset);
}

/**
 * Follows the playhead: called every frame with the song time, it starts the
 * clips the playhead just reached (or lands inside after a jump while playing).
 */
export class SfxFollower {
  private last = -1;
  private wasPlaying = false;

  tick(t: number, isPlaying: boolean, clips: readonly SfxClip[], sounds: readonly SoundAsset[]): void {
    if (!isPlaying) {
      if (this.wasPlaying) stopAllSfx();
      this.wasPlaying = false;
      this.last = t;
      return;
    }
    const jumped = !this.wasPlaying || t < this.last || t - this.last > 0.3;
    for (const c of clips) {
      if (jumped) {
        if (t >= c.start && t < c.end) void playClip(c, sounds, t - c.start);
      } else if (c.start > this.last && c.start <= t) {
        void playClip(c, sounds, t - c.start);
      }
    }
    if (jumped && this.wasPlaying) stopAllSfx();
    this.wasPlaying = true;
    this.last = t;
  }
}
