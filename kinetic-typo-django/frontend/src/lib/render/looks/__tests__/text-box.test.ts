import { describe, expect, it } from "vitest";
import type { LyricLine } from "@/types/project";
import { formatLineOptions, parseLineOptions } from "@/lib/lyrics/line-options";
import { boxHeight, boxWidth, fitWidth, rowLimit, type LookFrame } from "../frame";

const frame = (lineStyle: LyricLine["lineStyle"] | null) =>
  ({ W: 1280, H: 720, line: lineStyle ? ({ lineStyle } as LyricLine) : null }) as LookFrame;

describe("text box shape", () => {
  it("scales the wrap width but never past the frame margins", () => {
    expect(fitWidth(frame(null), 600)).toBe(600);
    expect(fitWidth(frame({ width: 0.5 }), 600)).toBe(300);
    // 1280 wide with a 4% (of 720) margin on each side
    expect(fitWidth(frame({ width: 1.6 }), 1000)).toBeCloseTo(1280 - 720 * 0.04 * 2);
  });

  it("allows more rows in a narrowed box before the type shrinks", () => {
    expect(rowLimit(frame(null), 3)).toBe(3);
    expect(rowLimit(frame({ width: 1.4 }), 3)).toBe(3);
    expect(rowLimit(frame({ width: 0.5 }), 3)).toBe(6);
  });

  it("defaults to the theme's own width and spacing", () => {
    expect([boxWidth(frame({})), boxHeight(frame({}))]).toEqual([1, 1]);
    expect([
      boxWidth(frame({ width: 0.8, height: 1.3 })),
      boxHeight(frame({ width: 0.8, height: 1.3 })),
    ]).toEqual([0.8, 1.3]);
  });

  it("keeps the box shape in the lyrics text, clamped to range", () => {
    const o = parseLineOptions("x=0.10;width=0.75;height=9");
    expect(o.lineStyle).toEqual({ width: 0.75, height: 2 });
    expect(formatLineOptions(o)).toBe(";x=0.10;width=0.75;height=2.00");
  });
});
