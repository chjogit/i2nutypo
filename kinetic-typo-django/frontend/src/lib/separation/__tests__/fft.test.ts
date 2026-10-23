import { describe, expect, it } from "vitest";
import { fft, fftPlan, ifft } from "../fft";

function naiveDft(x: Float64Array): Float64Array {
  const n = x.length / 2;
  const out = new Float64Array(2 * n);
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      const a = (-2 * Math.PI * k * j) / n;
      out[2 * k] += x[2 * j] * Math.cos(a) - x[2 * j + 1] * Math.sin(a);
      out[2 * k + 1] += x[2 * j] * Math.sin(a) + x[2 * j + 1] * Math.cos(a);
    }
  }
  return out;
}

const random = (n: number) =>
  Float64Array.from({ length: 2 * n }, (_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1);

describe("fft", () => {
  for (const n of [1, 2, 3, 4, 5, 8, 12, 30, 60, 120, 240]) {
    it(`matches the plain DFT for N=${n}`, () => {
      const x = random(n);
      const want = naiveDft(x);
      const got = x.slice();
      fft(fftPlan(n), got);
      for (let i = 0; i < got.length; i++) expect(got[i]).toBeCloseTo(want[i], 9);
    });
  }

  it("inverts at the separation model's size", () => {
    const x = random(7680);
    const y = x.slice();
    const plan = fftPlan(7680);
    fft(plan, y);
    ifft(plan, y);
    for (let i = 0; i < x.length; i++) expect(y[i]).toBeCloseTo(x[i], 9);
  });

  it("refuses sizes with other prime factors", () => {
    expect(() => fftPlan(14)).toThrow();
  });
});
