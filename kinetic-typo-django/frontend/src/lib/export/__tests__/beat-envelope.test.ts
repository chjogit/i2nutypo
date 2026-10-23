import { describe, expect, it } from "vitest";
import { bassLevels, mixDown } from "../beat-envelope";

describe("beat envelope", () => {
  it("is silent for silence and rises on a loud low tone", () => {
    const rate = 48000;
    const fps = 30;
    const quiet = new Float32Array(rate);
    const loud = new Float32Array(rate).map((_, i) => 0.8 * Math.sin((2 * Math.PI * 80 * i) / rate));
    const song = new Float32Array(rate * 2);
    song.set(quiet, 0);
    song.set(loud, rate);
    const levels = bassLevels(song, rate, fps, 60);
    expect(levels[20]).toBe(0);
    expect(levels[59]).toBeGreaterThan(0.8);
  });

  it("averages channels", () => {
    const mono = mixDown([new Float32Array([1, 0]), new Float32Array([0, 1])]);
    expect(Array.from(mono)).toEqual([0.5, 0.5]);
  });
});
