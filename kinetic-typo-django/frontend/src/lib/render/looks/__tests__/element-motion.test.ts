import { describe, expect, it } from "vitest";
import { hopClock } from "../element-motion";
import { exitFor } from "../motions";

describe("element motion", () => {
  it("counts ordinary lines only and times from the current line's start", () => {
    const lines = [
      { startTime: 1, overlap: false },
      { startTime: 1.5, overlap: true },
      { startTime: 4, overlap: false },
    ];
    expect(hopClock(lines, 0.5)).toEqual({ index: -1, elapsed: 0 });
    expect(hopClock(lines, 2)).toEqual({ index: 0, elapsed: 1 });
    expect(hopClock(lines, 5)).toEqual({ index: 1, elapsed: 1 });
  });

  it("gives every motion an exit, falling back to a fade", () => {
    expect(typeof exitFor("stamp")).toBe("function");
    expect(exitFor("nope")).toBe(exitFor(undefined));
  });
});
