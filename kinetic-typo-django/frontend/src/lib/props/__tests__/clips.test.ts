import { describe, expect, it } from "vitest";
import type { PropClip } from "@/types/project";
import { clipAlpha, fitClip, freeAt, makeClip } from "../clips";

const clip = (id: string, start: number, end: number): PropClip => ({
  ...makeClip(start, 100),
  id,
  start,
  end,
});

describe("prop clips", () => {
  const lane = [clip("a", 0, 4), clip("b", 10, 14)];

  it("makes a 4s clip at the playhead, cut short by the song end", () => {
    expect(makeClip(3, 100)).toMatchObject({ start: 3, end: 7 });
    expect(makeClip(98, 100)).toMatchObject({ start: 98, end: 100 });
  });

  it("moves a clip without overlapping its neighbors, keeping its length", () => {
    const b = lane[1];
    expect(fitClip({ ...b, start: 2, end: 6 }, b, lane, 100)).toMatchObject({ start: 4, end: 8 });
    expect(fitClip({ ...b, start: 97, end: 101 }, b, lane, 100)).toMatchObject({ start: 96, end: 100 });
  });

  it("stops a dragged end at the neighbor and keeps a minimum length", () => {
    const a = lane[0];
    expect(fitClip({ ...a, end: 12 }, a, lane, 100)).toMatchObject({ start: 0, end: 10 });
    expect(fitClip({ ...a, end: 0 }, a, lane, 100).end).toBeCloseTo(0.2);
  });

  it("cuts a new clip short at the next one", () => {
    const n = clip("n", 8, 12);
    expect(fitClip(n, n, lane, 100)).toMatchObject({ start: 8, end: 10 });
  });

  it("knows free time", () => {
    expect(freeAt(lane, 5)).toBe(true);
    expect(freeAt(lane, 11)).toBe(false);
  });

  it("fades in and out at the ends", () => {
    const c = { ...clip("c", 10, 14), fade: 1, opacity: 0.8 };
    expect(clipAlpha(c, 10.5)).toBeCloseTo(0.4);
    expect(clipAlpha(c, 12)).toBeCloseTo(0.8);
    expect(clipAlpha(c, 13.75)).toBeCloseTo(0.2);
  });
});
