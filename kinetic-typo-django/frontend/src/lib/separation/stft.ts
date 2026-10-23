import { fft, fftPlan, ifft } from "./fft";

// Short-time Fourier transform of a stereo pair, matching torch.stft /
// torch.istft with center=True, reflect padding and a periodic Hann window,
// which is what the separation models were trained with. Left and right are
// packed into one complex FFT (left + i·right) and split apart afterwards.

export interface StereoSpectrum {
  /** Bins kept per frame (≤ nFft/2 + 1). */
  bins: number;
  frames: number;
  /** [left re, left im, right re, right im][bin][frame], the model's input layout. */
  data: Float32Array;
}

const windows = new Map<number, Float64Array>();
function hann(n: number): Float64Array {
  let w = windows.get(n);
  if (!w) {
    w = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    windows.set(n, w);
  }
  return w;
}

/** x[i] with reflect padding of pad samples on both sides (edge sample not repeated). */
function reflectAt(x: Float32Array, i: number): number {
  if (i < 0) return x[-i];
  if (i >= x.length) return x[2 * (x.length - 1) - i];
  return x[i];
}

export function stftStereo(
  left: Float32Array,
  right: Float32Array,
  nFft: number,
  hop: number,
  bins: number,
): StereoSpectrum {
  const pad = nFft / 2;
  const frames = 1 + Math.floor(left.length / hop);
  const plan = fftPlan(nFft);
  const w = hann(nFft);
  const buf = new Float64Array(2 * nFft);
  const plane = bins * frames;
  const data = new Float32Array(4 * plane);
  for (let t = 0; t < frames; t++) {
    const start = t * hop - pad;
    for (let i = 0; i < nFft; i++) {
      buf[2 * i] = reflectAt(left, start + i) * w[i];
      buf[2 * i + 1] = reflectAt(right, start + i) * w[i];
    }
    fft(plan, buf);
    for (let k = 0; k < bins; k++) {
      const nk = (nFft - k) % nFft;
      const zr = buf[2 * k];
      const zi = buf[2 * k + 1];
      const cr = buf[2 * nk];
      const ci = -buf[2 * nk + 1];
      const at = k * frames + t;
      data[at] = (zr + cr) / 2; // left = (Z[k] + conj Z[N-k]) / 2
      data[plane + at] = (zi + ci) / 2;
      data[2 * plane + at] = (zi - ci) / 2; // right = (Z[k] - conj Z[N-k]) / 2i
      data[3 * plane + at] = (cr - zr) / 2;
    }
  }
  return { bins, frames, data };
}

/**
 * Inverse of stftStereo; bins above spec.bins are taken as zero. Returns
 * length samples per channel.
 */
export function istftStereo(
  spec: StereoSpectrum,
  nFft: number,
  hop: number,
  length: number,
): { left: Float32Array; right: Float32Array } {
  const { bins, frames, data } = spec;
  const pad = nFft / 2;
  const plane = bins * frames;
  const plan = fftPlan(nFft);
  const w = hann(nFft);
  const total = nFft + hop * (frames - 1);
  const outL = new Float64Array(total);
  const outR = new Float64Array(total);
  const env = new Float64Array(total);
  const buf = new Float64Array(2 * nFft);
  const half = nFft / 2;
  for (let t = 0; t < frames; t++) {
    buf.fill(0);
    // Z = L + i·R over the full (Hermitian) spectrum of each channel
    for (let k = 0; k < Math.min(bins, half + 1); k++) {
      const at = k * frames + t;
      const lr = data[at];
      const rr = data[2 * plane + at];
      // DC and Nyquist are real; their imaginary parts are dropped, as irfft does
      const edge = k === 0 || k === half;
      const li = edge ? 0 : data[plane + at];
      const ri = edge ? 0 : data[3 * plane + at];
      buf[2 * k] = lr - ri;
      buf[2 * k + 1] = li + rr;
      if (k > 0 && k < half) {
        // conj(L) + i·conj(R) at N-k
        const nk = nFft - k;
        buf[2 * nk] = lr + ri;
        buf[2 * nk + 1] = -li + rr;
      }
    }
    ifft(plan, buf);
    const start = t * hop;
    for (let i = 0; i < nFft; i++) {
      outL[start + i] += buf[2 * i] * w[i];
      outR[start + i] += buf[2 * i + 1] * w[i];
      env[start + i] += w[i] * w[i];
    }
  }
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length && i + pad < total; i++) {
    const e = env[i + pad];
    if (e > 1e-11) {
      left[i] = outL[i + pad] / e;
      right[i] = outR[i + pad] / e;
    }
  }
  return { left, right };
}
