import { describe, expect, it } from "vitest";
import { istftStereo, stftStereo } from "../stft";

const signal = (n: number, f: number) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin(i * f) * 0.5 + Math.sin(i * f * 3.7) * 0.2);

/** torch.stft(center=True, pad_mode="reflect", window=hann(periodic)) written out directly. */
function referenceStft(x: Float32Array, nFft: number, hop: number) {
  const pad = nFft / 2;
  const padded = (i: number) => (i < 0 ? x[-i] : i >= x.length ? x[2 * (x.length - 1) - i] : x[i]);
  const frames = 1 + Math.floor(x.length / hop);
  const out: [number, number][][] = [];
  for (let k = 0; k <= nFft / 2; k++) {
    out.push([]);
    for (let t = 0; t < frames; t++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < nFft; n++) {
        const v = padded(t * hop - pad + n) * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / nFft));
        re += v * Math.cos((-2 * Math.PI * k * n) / nFft);
        im += v * Math.sin((-2 * Math.PI * k * n) / nFft);
      }
      out[k].push([re, im]);
    }
  }
  return out;
}

describe("stereo STFT", () => {
  const nFft = 60;
  const hop = 15;
  const left = signal(300, 0.31);
  const right = signal(300, 0.07);

  it("matches torch.stft for both channels in the model's layout", () => {
    const spec = stftStereo(left, right, nFft, hop, 31);
    const refL = referenceStft(left, nFft, hop);
    const refR = referenceStft(right, nFft, hop);
    const plane = spec.bins * spec.frames;
    expect(spec.frames).toBe(21);
    for (let k = 0; k < 31; k++) {
      for (let t = 0; t < spec.frames; t++) {
        const at = k * spec.frames + t;
        expect(spec.data[at]).toBeCloseTo(refL[k][t][0], 4);
        expect(spec.data[plane + at]).toBeCloseTo(refL[k][t][1], 4);
        expect(spec.data[2 * plane + at]).toBeCloseTo(refR[k][t][0], 4);
        expect(spec.data[3 * plane + at]).toBeCloseTo(refR[k][t][1], 4);
      }
    }
  });

  it("reconstructs the signal", () => {
    const spec = stftStereo(left, right, nFft, hop, nFft / 2 + 1);
    const back = istftStereo(spec, nFft, hop, left.length);
    for (let i = 0; i < left.length; i++) {
      expect(back.left[i]).toBeCloseTo(left[i], 4);
      expect(back.right[i]).toBeCloseTo(right[i], 4);
    }
  });
});
