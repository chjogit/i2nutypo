import { describe, expect, it } from "vitest";
import type { LyricLine } from "@/types/project";
import { recentLines } from "../render-frame";

const line = (index: number, startTime: number, overlap = false) =>
  ({ index, startTime, endTime: startTime + 2, overlap }) as LyricLine;

describe("recent lines", () => {
  it("keeps the sung main lines before now, oldest first, without the active one", () => {
    const lines = [line(0, 0), line(1, 2), line(2, 2.5, true), line(3, 4), line(4, 6)];
    expect(recentLines(lines, 4.5, lines[3]).map((l) => l.index)).toEqual([0, 1]);
    expect(recentLines(lines, 10, null, 2).map((l) => l.index)).toEqual([3, 4]);
  });
});
