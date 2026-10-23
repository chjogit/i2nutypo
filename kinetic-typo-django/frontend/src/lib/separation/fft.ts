// Complex FFT of any length made of the factors 2, 3, 4 and 5 (7680 = 4⁴·2·3·5
// for the separation model), Stockham autosort, so no bit reversal is needed.
// Plans are built once per length and reused for every frame.

interface Stage {
  radix: number;
  /** Sub-transform length at this stage and the stride between its elements. */
  n: number;
  stride: number;
  /** Twiddles w^(p·t) for p < n/radix, t < radix, interleaved re/im. */
  twiddle: Float64Array;
}

export interface FftPlan {
  size: number;
  stages: Stage[];
  scratch: Float64Array;
}

const plans = new Map<number, FftPlan>();

export function fftPlan(size: number): FftPlan {
  const cached = plans.get(size);
  if (cached) return cached;
  const radices: number[] = [];
  let rest = size;
  for (const r of [4, 2, 3, 5]) {
    while (rest % r === 0) {
      radices.push(r);
      rest /= r;
    }
  }
  if (rest !== 1) throw new Error(`FFT size ${size} has a factor other than 2, 3, 5`);

  const stages: Stage[] = [];
  let n = size;
  let stride = 1;
  for (const radix of radices) {
    const m = n / radix;
    const twiddle = new Float64Array(2 * m * radix);
    for (let p = 0; p < m; p++) {
      for (let t = 0; t < radix; t++) {
        const a = (-2 * Math.PI * p * t) / n;
        twiddle[2 * (p * radix + t)] = Math.cos(a);
        twiddle[2 * (p * radix + t) + 1] = Math.sin(a);
      }
    }
    stages.push({ radix, n, stride, twiddle });
    n = m;
    stride *= radix;
  }
  const plan = { size, stages, scratch: new Float64Array(2 * size) };
  plans.set(size, plan);
  return plan;
}

const C3 = -0.5; // cos(2π/3)
const S3 = -Math.sqrt(3) / 2; // -sin(2π/3)
const C51 = Math.cos((2 * Math.PI) / 5);
const C52 = Math.cos((4 * Math.PI) / 5);
const S51 = -Math.sin((2 * Math.PI) / 5);
const S52 = -Math.sin((4 * Math.PI) / 5);

/**
 * In-place forward FFT of interleaved complex data (re, im, re, im…).
 * Unnormalized, e^(-2πi·kn/N), like numpy and torch.
 */
export function fft(plan: FftPlan, data: Float64Array): void {
  let x = data;
  let y = plan.scratch;
  const br = new Float64Array(5);
  const bi = new Float64Array(5);
  for (const { radix, n, stride: s, twiddle } of plan.stages) {
    const m = n / radix;
    const sm = s * m;
    for (let p = 0; p < m; p++) {
      for (let q = 0; q < s; q++) {
        const i0 = 2 * (q + s * p);
        // Butterfly of the radix on x[i0 + k·2sm], k < radix → br/bi
        if (radix === 4) {
          const i1 = i0 + 2 * sm;
          const i2 = i1 + 2 * sm;
          const i3 = i2 + 2 * sm;
          const ar = x[i0] + x[i2];
          const ai = x[i0 + 1] + x[i2 + 1];
          const cr = x[i0] - x[i2];
          const ci = x[i0 + 1] - x[i2 + 1];
          const dr = x[i1] + x[i3];
          const di = x[i1 + 1] + x[i3 + 1];
          const er = x[i1] - x[i3];
          const ei = x[i1 + 1] - x[i3 + 1];
          br[0] = ar + dr;
          bi[0] = ai + di;
          br[1] = cr + ei;
          bi[1] = ci - er;
          br[2] = ar - dr;
          bi[2] = ai - di;
          br[3] = cr - ei;
          bi[3] = ci + er;
        } else if (radix === 2) {
          const i1 = i0 + 2 * sm;
          br[0] = x[i0] + x[i1];
          bi[0] = x[i0 + 1] + x[i1 + 1];
          br[1] = x[i0] - x[i1];
          bi[1] = x[i0 + 1] - x[i1 + 1];
        } else if (radix === 3) {
          const i1 = i0 + 2 * sm;
          const i2 = i1 + 2 * sm;
          const sr = x[i1] + x[i2];
          const si = x[i1 + 1] + x[i2 + 1];
          const dr = x[i1] - x[i2];
          const di = x[i1 + 1] - x[i2 + 1];
          br[0] = x[i0] + sr;
          bi[0] = x[i0 + 1] + si;
          const mr = x[i0] + C3 * sr;
          const mi = x[i0 + 1] + C3 * si;
          br[1] = mr - S3 * di;
          bi[1] = mi + S3 * dr;
          br[2] = mr + S3 * di;
          bi[2] = mi - S3 * dr;
        } else {
          const i1 = i0 + 2 * sm;
          const i2 = i1 + 2 * sm;
          const i3 = i2 + 2 * sm;
          const i4 = i3 + 2 * sm;
          const s1r = x[i1] + x[i4];
          const s1i = x[i1 + 1] + x[i4 + 1];
          const d1r = x[i1] - x[i4];
          const d1i = x[i1 + 1] - x[i4 + 1];
          const s2r = x[i2] + x[i3];
          const s2i = x[i2 + 1] + x[i3 + 1];
          const d2r = x[i2] - x[i3];
          const d2i = x[i2 + 1] - x[i3 + 1];
          br[0] = x[i0] + s1r + s2r;
          bi[0] = x[i0 + 1] + s1i + s2i;
          const ar = x[i0] + C51 * s1r + C52 * s2r;
          const ai = x[i0 + 1] + C51 * s1i + C52 * s2i;
          const cr = x[i0] + C52 * s1r + C51 * s2r;
          const ci = x[i0 + 1] + C52 * s1i + C51 * s2i;
          const er = S51 * d1r + S52 * d2r;
          const ei = S51 * d1i + S52 * d2i;
          const fr = S52 * d1r - S51 * d2r;
          const fi = S52 * d1i - S51 * d2i;
          br[1] = ar - ei;
          bi[1] = ai + er;
          br[4] = ar + ei;
          bi[4] = ai - er;
          br[2] = cr - fi;
          bi[2] = ci + fr;
          br[3] = cr + fi;
          bi[3] = ci - fr;
        }
        const tw = 2 * p * radix;
        const out = 2 * (q + s * radix * p);
        y[out] = br[0];
        y[out + 1] = bi[0];
        for (let t = 1; t < radix; t++) {
          const tr = twiddle[tw + 2 * t];
          const ti = twiddle[tw + 2 * t + 1];
          const o = out + 2 * s * t;
          y[o] = br[t] * tr - bi[t] * ti;
          y[o + 1] = br[t] * ti + bi[t] * tr;
        }
      }
    }
    [x, y] = [y, x];
  }
  if (x !== data) data.set(x);
}

/** In-place inverse FFT, scaled by 1/N so that ifft(fft(x)) = x. */
export function ifft(plan: FftPlan, data: Float64Array): void {
  for (let i = 1; i < data.length; i += 2) data[i] = -data[i];
  fft(plan, data);
  const scale = 1 / plan.size;
  for (let i = 0; i < data.length; i += 2) {
    data[i] *= scale;
    data[i + 1] *= -scale;
  }
}
