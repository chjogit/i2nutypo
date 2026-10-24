import type { SfxClip, SoundAsset } from "@/types/project";
import { sfxBuffer, userSoundBuffer } from "./library";

/** The AudioBuffer a clip plays, or null when its sound is missing. */
export async function clipBuffer(clip: SfxClip, sounds: readonly SoundAsset[]): Promise<AudioBuffer | null> {
  if (clip.sound.startsWith("user:")) {
    const asset = sounds.find((s) => `user:${s.id}` === clip.sound);
    return asset ? userSoundBuffer(asset.id, asset.objectUrl).catch(() => null) : null;
  }
  return (await sfxBuffer(clip.sound)?.catch(() => null)) ?? null;
}

/**
 * The song with the sound effects mixed in, rendered offline. Without a song
 * the effects go over silence `length` seconds long. Returns the song itself
 * when there are no effects.
 */
export async function mixSoundEffects(
  song: AudioBuffer | null,
  length: number,
  clips: readonly SfxClip[],
  sounds: readonly SoundAsset[],
): Promise<AudioBuffer | null> {
  if (clips.length === 0) return song;
  const sampleRate = song?.sampleRate ?? 48000;
  const channels = Math.max(2, song?.numberOfChannels ?? 2);
  const frames = Math.max(1, Math.ceil((song?.duration ?? length) * sampleRate));
  const ctx = new OfflineAudioContext(channels, frames, sampleRate);
  if (song) {
    const src = ctx.createBufferSource();
    src.buffer = song;
    src.connect(ctx.destination);
    src.start(0);
  }
  for (const clip of clips) {
    const buf = await clipBuffer(clip, sounds);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = clip.gain;
    src.connect(g).connect(ctx.destination);
    src.start(clip.start, 0, Math.max(0.01, clip.end - clip.start));
  }
  return ctx.startRendering();
}
