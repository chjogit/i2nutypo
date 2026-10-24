import type { BeatGrid } from "@/types/project";
import { fft, fftPlan } from "@/lib/separation/fft";

// Beat markers from the song, in the browser: an onset strength envelope
// (spectral flux), the tempo from its autocorrelation, then beat times by
// dynamic programming (each beat on a strong onset, about one period after
// the last). The bar starts are the phase with the most low-end punch.

const TARGET_RATE = 11025;
const N = 1024;
const HOP = 128;
const MIN_BPM = 60;
const MAX_BPM = 200;

export interface OnsetEnvelope {
  /** Onset strength per frame, zero mean and unit spread. */
  env: Float32Array;
  /** Low band (below ~200 Hz) onset strength per frame. */
  low: Float32Array;
  /** Frames per second. */
  rate: number;
  /** Seconds of frame 0's onset. */
  offset: number;
}

function downsample(mono: Float32Array, sampleRate: number): { x: Float32Array; rate: number } {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  const n = Math.floor(mono.length / factor);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += mono[i * factor + k];
    x[i] = s / factor;
  }
  return { x, rate: sampleRate / factor };
}

function normalize(a: Float32Array): void {
  let mean = 0;
  for (const v of a) mean += v;
  mean /= Math.max(1, a.length);
  let sd = 0;
  for (const v of a) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / Math.max(1, a.length)) || 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - mean) / sd;
}

/** Spectral-flux onset strength of a mono signal. */
export function onsetEnvelope(mono: Float32Array, sampleRate: number): OnsetEnvelope {
  const { x, rate } = downsample(mono, sampleRate);
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
  const env = new Float32Array(frames);
  const low = new Float32Array(frames);
  const plan = fftPlan(N);
  const buf = new Float64Array(2 * N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const bins = N / 2;
  const lowBins = Math.max(2, Math.round((200 / rate) * N));
  let prev = new Float64Array(bins);
  let cur = new Float64Array(bins);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < N; i++) {
      buf[2 * i] = x[o + i] * win[i];
      buf[2 * i + 1] = 0;
    }
    fft(plan, buf);
    let flux = 0;
    let lowFlux = 0;
    for (let b = 1; b < bins; b++) {
      const m = Math.log1p(100 * Math.hypot(buf[2 * b], buf[2 * b + 1]));
      cur[b] = m;
      const d = m - prev[b];
      if (d > 0) {
        flux += d;
        if (b < lowBins) lowFlux += d;
      }
    }
    env[f] = f === 0 ? 0 : flux;
    low[f] = f === 0 ? 0 : lowFlux;
    [prev, cur] = [cur, prev];
  }
  // Take away the slow loudness trend so quiet and loud parts count alike
  const detrend = (a: Float32Array) => {
    const w = Math.round(rate / HOP / 2);
    const out = new Float32Array(a.length);
    let sum = 0;
    for (let i = 0; i < a.length + w; i++) {
      if (i < a.length) sum += a[i];
      if (i - 2 * w - 1 >= 0) sum -= a[i - 2 * w - 1];
      const c = i - w;
      if (c >= 0 && c < a.length) {
        const n = Math.min(a.length, c + w + 1) - Math.max(0, c - w);
        out[c] = Math.max(0, a[c] - sum / n);
      }
    }
    normalize(out);
    return out;
  };
  return { env: detrend(env), low: detrend(low), rate: rate / HOP, offset: N / 2 / rate };
}

/** Tempo in BPM from the envelope's autocorrelation, leaning towards 120. */
export function estimateTempo(env: Float32Array, rate: number): number {
  const minLag = Math.floor((60 * rate) / MAX_BPM);
  const maxLag = Math.ceil((60 * rate) / MIN_BPM);
  let best = 0;
  let bestScore = -Infinity;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    ac[lag] = s / Math.max(1, env.length - lag);
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * rate) / lag;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    // A lag whose double also lines up is more likely the beat than an off-beat
    const score = w * (ac[lag] + 0.5 * (2 * lag <= maxLag + 1 ? ac[2 * lag] : 0));
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  if (best <= minLag || best >= maxLag) return best > 0 ? (60 * rate) / best : 120;
  // Parabolic peak for a finer lag
  const a = ac[best - 1];
  const b = ac[best];
  const c = ac[best + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return (60 * rate) / (best + Math.max(-0.5, Math.min(0.5, shift)));
}

/** Beat frames by dynamic programming (Ellis 2007). */
export function trackBeats(env: Float32Array, rate: number, bpm: number, tightness = 100): number[] {
  const period = (60 * rate) / bpm;
  const n = env.length;
  if (n === 0) return [];
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2);
  const hi = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let best = 0;
    let arg = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const cost = -tightness * Math.log((t - tau) / period) ** 2;
      const v = score[tau] + cost;
      if (v > best || arg < 0) {
        best = v;
        arg = tau;
      }
    }
    score[t] = env[t] + (arg >= 0 ? best : 0);
    back[t] = arg;
  }
  // End on the best-scoring frame within the last period
  let end = n - 1;
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) if (score[t] > score[end]) end = t;
  const beats: number[] = [];
  for (let t = end; t >= 0; t = back[t]) {
    beats.push(t);
    if (back[t] < 0) break;
  }
  return beats.reverse();
}

/** Phase 0..3 whose beats have the strongest low-end onsets: where the bars start. */
export function downbeatPhase(beats: readonly number[], low: Float32Array): number {
  let best = 0;
  let bestSum = -Infinity;
  for (let k = 0; k < 4; k++) {
    let s = 0;
    let c = 0;
    for (let i = k; i < beats.length; i += 4) {
      s += low[beats[i]] ?? 0;
      c++;
    }
    const mean = c ? s / c : 0;
    if (mean > bestSum) {
      bestSum = mean;
      best = k;
    }
  }
  return best;
}

/** Beats, tempo and bar starts of a mono signal. */
export function detectBeats(mono: Float32Array, sampleRate: number): BeatGrid {
  const o = onsetEnvelope(mono, sampleRate);
  if (o.env.length < 16) return { bpm: 120, times: [], downbeat: 0 };
  const bpm = estimateTempo(o.env, o.rate);
  const frames = trackBeats(o.env, o.rate, bpm);
  // Drop beats in silence at the very start
  const times = frames.map((f) => Math.round((f / o.rate + o.offset) * 1000) / 1000).filter((t) => t >= 0);
  return { bpm: Math.round(bpm * 10) / 10, times, downbeat: downbeatPhase(frames, o.low) };
}

/** Beats in a grid, every `every` beats (1 each beat, 2 every other, 4 each bar) from the bar starts. */
export function beatsEvery(grid: BeatGrid, every: 1 | 2 | 4 | 0.5): number[] {
  if (every === 0.5) {
    const out: number[] = [];
    grid.times.forEach((t, i) => {
      out.push(t);
      const next = grid.times[i + 1];
      if (next !== undefined) out.push(Math.round(((t + next) / 2) * 1000) / 1000);
    });
    return out;
  }
  return grid.times.filter((_, i) => (((i - grid.downbeat) % every) + every) % every === 0);
}

/** The beat nearest to t within `reach` seconds, or t itself. */
export function snapToBeat(t: number, times: readonly number[], reach: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  let best = t;
  let dist = reach;
  for (const i of [lo - 1, lo]) {
    const b = times[i];
    if (b === undefined) continue;
    const d = Math.abs(b - t);
    if (d < dist) {
      dist = d;
      best = b;
    }
  }
  return best;
}

/** Beat energy 0..1 from the found beats: a sharp pulse on each beat, stronger on bar starts. */
export function beatGridPulse(t: number, grid: BeatGrid, beatReact: number, isPlaying: boolean): number {
  const times = grid.times;
  if (times.length < 2) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  if (times[lo] > t) return 0;
  const next = times[lo + 1] ?? times[lo] + 60 / grid.bpm;
  const phase = (t - times[lo]) / Math.max(0.05, next - times[lo]);
  const bar = (((lo - grid.downbeat) % 4) + 4) % 4 === 0 ? 1 : 0.8;
  const pulse = Math.pow(Math.max(0, 1 - phase * 3), 2) * bar;
  return isPlaying ? pulse * (beatReact / 100) : pulse * 0.25;
}

export function sanitizeBeats(raw: unknown): BeatGrid | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<BeatGrid>;
  if (!Array.isArray(r.times)) return null;
  const times = r.times
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b);
  const bpm = typeof r.bpm === "number" && r.bpm >= 30 && r.bpm <= 300 ? r.bpm : 120;
  const downbeat = typeof r.downbeat === "number" ? Math.min(3, Math.max(0, Math.round(r.downbeat))) : 0;
  return times.length ? { bpm, times, downbeat } : null;
}
