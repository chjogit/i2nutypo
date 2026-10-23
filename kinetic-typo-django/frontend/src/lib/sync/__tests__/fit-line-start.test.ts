import { describe, expect, it } from "vitest";
import { fitLineStart, type UnitHit } from "../align";

// A line sung from 7.0 s at 0.15 s per sound
const sung = (offsets: number[]): UnitHit[] =>
  offsets.map((o) => ({ offset: o, time: 7 + o * 0.15, weight: 1 }));

describe("fitLineStart", () => {
  it("places a cleanly heard line at its first sound", () => {
    expect(fitLineStart(sung([0, 1, 2, 3, 4, 5, 6, 7]))).toBeCloseTo(7, 5);
  });

  it("ignores a first word heard somewhere else", () => {
    const hits = [
      { offset: 0, time: 3.2, weight: 1 },
      { offset: 1, time: 3.4, weight: 1 },
      ...sung([2, 3, 4, 5, 6, 7, 8, 9]),
    ];
    expect(fitLineStart(hits)).toBeCloseTo(7, 1);
  });

  it("steps back over a dropped opening", () => {
    expect(fitLineStart(sung([4, 5, 6, 7, 8, 9]))).toBeCloseTo(7, 5);
  });

  it("uses a default pace for a single match", () => {
    expect(fitLineStart([{ offset: 2, time: 10, weight: 1 }])).toBeCloseTo(10 - 2 * 0.12, 5);
  });
});
