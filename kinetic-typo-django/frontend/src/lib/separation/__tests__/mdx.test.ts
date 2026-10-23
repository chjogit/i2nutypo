import { describe, expect, it } from "vitest";
import { separateVocals, type MdxConfig } from "../mdx";
import { resample } from "../resample";

// A small model shape so the test runs quickly; the chunking is the same
const cfg: MdxConfig = { nFft: 64, hop: 16, dimF: 33, dimT: 32, compensate: 1 };

const tone = (n: number, f: number, phase = 0) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin(i * f + phase));

describe("separateVocals", () => {
  it("gives back the input exactly when the model passes the spectrum through", async () => {
    const left = tone(2000, 0.21);
    const right = tone(2000, 0.05, 1);
    let calls = 0;
    const out = await separateVocals(left, right, cfg, async (spec) => {
      calls++;
      expect(spec.length).toBe(4 * cfg.dimF * cfg.dimT);
      return spec;
    });
    expect(calls).toBe(Math.floor(2000 / 432) + 1);
    for (let i = 0; i < 2000; i++) {
      expect(out.left[i]).toBeCloseTo(left[i], 3);
      expect(out.right[i]).toBeCloseTo(right[i], 3);
    }
  });

  it("keeps only what the model keeps (a low-pass mask removes a high tone)", async () => {
    const low = tone(3000, 0.1);
    const mix = low.map((v, i) => v + Math.sin(i * 2.5));
    const out = await separateVocals(mix, mix, cfg, async (spec) => {
      const masked = spec.slice();
      const frames = cfg.dimT;
      for (let c = 0; c < 4; c++)
        for (let k = 10; k < cfg.dimF; k++)
          masked.fill(0, c * cfg.dimF * frames + k * frames, c * cfg.dimF * frames + (k + 1) * frames);
      return masked;
    });
    let err = 0;
    for (let i = 100; i < 2900; i++) err += (out.left[i] - low[i]) ** 2;
    expect(Math.sqrt(err / 2800)).toBeLessThan(0.02);
  });
});

describe("resample", () => {
  it("keeps a tone below the new Nyquist and removes one above it", () => {
    const n = 44100;
    const keep = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 44100));
    const out = resample(keep, 44100, 16000);
    expect(out.length).toBe(16000);
    for (let i = 100; i < 15900; i += 37)
      expect(out[i]).toBeCloseTo(Math.sin((2 * Math.PI * 440 * i) / 16000), 2);
    const high = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 12000 * i) / 44100));
    const gone = resample(high, 44100, 16000);
    const rms = Math.sqrt(gone.slice(100, -100).reduce((a, v) => a + v * v, 0) / (gone.length - 200));
    expect(rms).toBeLessThan(0.02);
  });
});
