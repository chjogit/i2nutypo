/**
 * Beat energy per video frame from the decoded song, standing in for the live
 * analyser the preview reads while playing (readBassEnergy), so an exported
 * video pulses where the song does even though it renders faster than real time.
 */

/** Smoothing between frames at 60 fps, close to the analyser's default 0.8. */
const SMOOTHING_60FPS = 0.8;
/** The analyser's 10 lowest bins span about this much at 48 kHz with fftSize 128. */
const LOWPASS_HZ = 3500;

/** Mono mix of all channels. */
export function mixDown(channels: readonly Float32Array[]): Float32Array {
  const n = channels[0]?.length ?? 0;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/**
 * Level 0..1 of the low band for each frame, like the analyser's normalized
 * bass sum: a one-pole low-pass, RMS over the frame, then a dB scale over
 * the analyser's -100..-30 dB range.
 */
export function bassLevels(
  mono: Float32Array,
  sampleRate: number,
  fps: number,
  frames: number,
): Float32Array {
  const alpha = 1 - Math.exp((-2 * Math.PI * LOWPASS_HZ) / sampleRate);
  const perFrame = sampleRate / fps;
  const smooth = Math.pow(SMOOTHING_60FPS, 60 / fps);
  const out = new Float32Array(frames);
  let lp = 0;
  let prev = 0;
  let pos = 0;
  for (let f = 0; f < frames; f++) {
    const end = Math.min(mono.length, Math.round((f + 1) * perFrame));
    let sum = 0;
    const count = Math.max(1, end - pos);
    for (; pos < end; pos++) {
      lp += alpha * (mono[pos] - lp);
      sum += lp * lp;
    }
    const rms = Math.sqrt(sum / count);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const level = Math.min(1, Math.max(0, (db + 100) / 70));
    prev = smooth * prev + (1 - smooth) * level;
    out[f] = prev;
  }
  return out;
}
