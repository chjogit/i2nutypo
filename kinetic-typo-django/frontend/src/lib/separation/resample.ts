// Windowed-sinc resampling, used to bring the separated vocals (44.1 kHz) down
// to Whisper's 16 kHz in the worker, where no AudioContext is available.
// The output points fall on a repeating set of fractional input positions
// (160 of them for 44.1 → 16 kHz), so one filter is built per position.

/** Zero crossings of the sinc on each side of the output point. */
const ZERO_CROSSINGS = 16;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input.slice();
  const g = gcd(fromRate, toRate);
  const up = toRate / g; // output points per period
  const down = fromRate / g; // input samples per period
  const outLength = Math.floor((input.length * toRate) / fromRate);
  // Low-pass a little under the lower Nyquist so nothing folds back
  const cutoff = 0.95 * Math.min(1, toRate / fromRate);
  const half = Math.ceil(ZERO_CROSSINGS / cutoff);
  const taps = 2 * half + 1;

  // filters[phase][tap] for input sample floor(center) - half + tap
  const filters = new Float32Array(up * taps);
  for (let phase = 0; phase < up; phase++) {
    const frac = ((phase * down) % up) / up;
    let sum = 0;
    for (let t = 0; t < taps; t++) {
      const d = t - half - frac;
      const x = Math.PI * cutoff * d;
      const sinc = d === 0 ? 1 : Math.sin(x) / x;
      const p = (d + half + 1) / (2 * half + 2); // Blackman window over the taps
      const h = sinc * (0.42 - 0.5 * Math.cos(2 * Math.PI * p) + 0.08 * Math.cos(4 * Math.PI * p));
      filters[phase * taps + t] = h;
      sum += h;
    }
    for (let t = 0; t < taps; t++) filters[phase * taps + t] /= sum;
  }

  const out = new Float32Array(outLength);
  for (let o = 0; o < outLength; o++) {
    const phase = o % up;
    const base = Math.floor((o * down) / up) - half;
    const f = phase * taps;
    let acc = 0;
    if (base >= 0 && base + taps <= input.length) {
      for (let t = 0; t < taps; t++) acc += input[base + t] * filters[f + t];
    } else {
      for (let t = 0; t < taps; t++) {
        const i = base + t;
        if (i >= 0 && i < input.length) acc += input[i] * filters[f + t];
      }
    }
    out[o] = acc;
  }
  return out;
}

export function toMono(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) out[i] = (left[i] + right[i]) / 2;
  return out;
}
