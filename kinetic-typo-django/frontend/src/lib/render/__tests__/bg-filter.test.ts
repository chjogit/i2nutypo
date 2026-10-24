import { describe, expect, it } from "vitest";
import {
  BG_FILTER_PRESETS,
  cssBgFilter,
  isNeutralBgFilter,
  NEUTRAL_BG_FILTER,
  sanitizeBgFilter,
} from "../bg-filter";

describe("background video filter", () => {
  it("leaves the video alone by default", () => {
    expect(isNeutralBgFilter(NEUTRAL_BG_FILTER)).toBe(true);
    expect(cssBgFilter(NEUTRAL_BG_FILTER, 1080)).toBe("none");
    expect(isNeutralBgFilter(BG_FILTER_PRESETS[0].filter)).toBe(true);
  });

  it("builds the CSS filter with blur relative to the frame height", () => {
    const f = { ...NEUTRAL_BG_FILTER, brightness: 0.6, hue: 30, blur: 0.5 };
    expect(cssBgFilter(f, 1000)).toBe("brightness(0.6) hue-rotate(30deg) blur(10.0px)");
  });

  it("keeps saved values in range and drops unknown tints", () => {
    const f = sanitizeBgFilter({ brightness: 9, saturate: -1, tint: "pink", blur: "x" });
    expect(f.brightness).toBe(2);
    expect(f.saturate).toBe(0);
    expect(f.tint).toBe("none");
    expect(f.blur).toBe(0);
    expect(sanitizeBgFilter(undefined)).toEqual(NEUTRAL_BG_FILTER);
  });

  it("counts a tint as a change only with some strength", () => {
    expect(isNeutralBgFilter({ ...NEUTRAL_BG_FILTER, tint: "blue", tintAmount: 0 })).toBe(true);
    expect(isNeutralBgFilter({ ...NEUTRAL_BG_FILTER, tint: "blue" })).toBe(false);
  });
});
