import { describe, expect, it } from "vitest";
import { propVideoTime } from "../prop-video";

describe("video illustrations", () => {
  const clips = [
    { start: 2, end: 6 },
    { start: 10, end: 11 },
  ] as never;

  it("plays from each clip's start and loops by the video's length", () => {
    expect(propVideoTime(clips, 3, 2.5)).toBeCloseTo(0.5);
    expect(propVideoTime(clips, 3, 5.5)).toBeCloseTo(0.5);
    expect(propVideoTime(clips, 3, 10.2)).toBeCloseTo(0.2);
  });

  it("is off between clips", () => {
    expect(propVideoTime(clips, 3, 1)).toBeNull();
    expect(propVideoTime(clips, 3, 8)).toBeNull();
  });
});
