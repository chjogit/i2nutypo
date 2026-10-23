import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINISH,
  FILTERS,
  finishUniforms,
  GRADES,
  hexToRgb,
  isNeutralFinish,
  needsBlur,
  sanitizeFinish,
} from "../settings";

describe("finish settings", () => {
  it("offers five grades and ten filters", () => {
    expect(GRADES).toHaveLength(5);
    expect(FILTERS).toHaveLength(10);
  });

  it("reads missing or broken saves as the neutral default", () => {
    expect(sanitizeFinish(undefined)).toEqual(DEFAULT_FINISH);
    const s = sanitizeFinish({
      grade: "bogus",
      exposure: 9,
      shadowTint: "red",
      filters: { grain: { on: true, amount: 4 } },
    });
    expect(s.grade).toBe("none");
    expect(s.exposure).toBe(1);
    expect(s.shadowTint).toBe(DEFAULT_FINISH.shadowTint);
    expect(s.filters.grain).toEqual({ on: true, amount: 1 });
    expect(isNeutralFinish(DEFAULT_FINISH)).toBe(true);
  });

  it("is neutral until something changes the picture", () => {
    expect(isNeutralFinish({ ...DEFAULT_FINISH, grade: "noir" })).toBe(false);
    expect(isNeutralFinish({ ...DEFAULT_FINISH, grade: "noir", gradeAmount: 0 })).toBe(true);
    expect(isNeutralFinish({ ...DEFAULT_FINISH, filters: { vignette: { on: false, amount: 0.8 } } })).toBe(
      true,
    );
    expect(isNeutralFinish({ ...DEFAULT_FINISH, temperature: 0.2 })).toBe(false);
  });

  it("turns settings into shader inputs", () => {
    const u = finishUniforms({
      ...DEFAULT_FINISH,
      grade: "splitTone",
      gradeAmount: 0.5,
      filters: { bloom: { on: true, amount: 0.3 }, dust: { on: false, amount: 1 } },
    });
    expect(u.grade).toBe(4);
    expect(u.gradeAmount).toBe(0.5);
    expect(u.filters.bloom).toBe(0.3);
    expect(u.filters.dust).toBe(0);
    expect(u.filters.vignette).toBe(0);
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(needsBlur({ ...DEFAULT_FINISH, filters: { mist: { on: true, amount: 0.2 } } })).toBe(true);
    expect(needsBlur({ ...DEFAULT_FINISH, filters: { grain: { on: true, amount: 0.2 } } })).toBe(false);
  });
});
