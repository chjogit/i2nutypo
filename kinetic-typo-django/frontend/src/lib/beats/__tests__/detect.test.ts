import { describe, expect, it } from "vitest";
import { beatGridPulse, beatsEvery, detectBeats, sanitizeBeats, snapToBeat } from "../detect";

/** Clicks at `bpm` with a louder low thump on every fourth beat, starting at `start`. */
function clickTrack(bpm: number, seconds: number, start: number, sr = 22050): Float32Array {
  const x = new Float32Array(Math.round(seconds * sr));
  const period = 60 / bpm;
  for (let k = 0; start + k * period < seconds - 0.1; k++) {
    const at = Math.round((start + k * period) * sr);
    const bar = k % 4 === 1;
    for (let i = 0; i < sr * 0.06; i++) {
      const env = Math.exp(-i / (sr * 0.012));
      const v = Math.sin((2 * Math.PI * (bar ? 60 : 1800) * i) / sr) * env * (bar ? 1 : 0.6);
      if (at + i < x.length) x[at + i] += v;
    }
  }
  return x;
}

describe("beat detection", () => {
  it("finds the tempo and the beats of a click track", () => {
    const sr = 22050;
    const grid = detectBeats(clickTrack(120, 20, 0.5, sr), sr);
    expect(Math.abs(grid.bpm - 120)).toBeLessThan(3);
    const expected = Array.from({ length: 38 }, (_, k) => 0.5 + k * 0.5);
    const near = expected.filter((e) => grid.times.some((t) => Math.abs(t - e) < 0.04));
    expect(near.length).toBeGreaterThan(expected.length * 0.85);
  });

  it("finds a slower tempo too", () => {
    const sr = 22050;
    const grid = detectBeats(clickTrack(90, 24, 0.3, sr), sr);
    expect(Math.abs(grid.bpm - 90)).toBeLessThan(3);
  });

  it("puts bar starts on the low thumps", () => {
    const sr = 22050;
    const grid = detectBeats(clickTrack(120, 20, 0.5, sr), sr);
    const bars = beatsEvery(grid, 4);
    // Thumps are on beats 1, 5, 9… i.e. at 1.0 s, 3.0 s, 5.0 s
    const onThump = bars.filter(
      (t) => Math.abs((((t - 1.0) % 2) + 2) % 2) < 0.06 || Math.abs(((((t - 1.0) % 2) + 2) % 2) - 2) < 0.06,
    );
    expect(onThump.length).toBeGreaterThan(bars.length * 0.8);
  });

  it("snaps to the nearest beat within reach", () => {
    expect(snapToBeat(1.04, [0.5, 1, 1.5], 0.1)).toBe(1);
    expect(snapToBeat(1.3, [0.5, 1, 1.5], 0.1)).toBe(1.3);
  });

  it("pulses right on a beat and fades before the next", () => {
    const grid = { bpm: 120, times: [0, 0.5, 1, 1.5], downbeat: 0 };
    expect(beatGridPulse(0.001, grid, 100, true)).toBeGreaterThan(0.9);
    expect(beatGridPulse(0.4, grid, 100, true)).toBe(0);
  });

  it("reads saved beats safely", () => {
    expect(sanitizeBeats(null)).toBeNull();
    expect(sanitizeBeats({ bpm: 9999, times: [2, 1, "x"], downbeat: 7 })).toEqual({
      bpm: 120,
      times: [1, 2],
      downbeat: 3,
    });
  });
});
