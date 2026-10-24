import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINISH,
  FILTERS,
  filmMotion,
  finishUniforms,
  GRADES,
  hexToRgb,
  isNeutralFinish,
  needsBlur,
  sanitizeFinish,
} from "../settings";

describe("finish settings", () => {
  it("offers five grades and seventeen filters", () => {
    expect(GRADES).toHaveLength(5);
    expect(FILTERS).toHaveLength(17);
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

  it("keeps the new color tools neutral until set, and reads them safely", () => {
    const s = sanitizeFinish({
      wheels: { lift: { x: 4, y: 4, l: 9 } },
      film: "nope",
      mask: { kind: "center", feather: 7 },
    });
    expect(s.wheels.lift.x).toBeCloseTo(Math.SQRT1_2);
    expect(s.wheels.lift.y).toBeCloseTo(Math.SQRT1_2);
    expect(s.wheels.lift.l).toBe(1);
    expect(s.film).toBe("none");
    expect(s.mask).toEqual({ kind: "center", feather: 1, invert: false });
    expect(isNeutralFinish({ ...DEFAULT_FINISH, film: "slide" })).toBe(false);
    expect(isNeutralFinish({ ...DEFAULT_FINISH, weave: 0.2 })).toBe(false);
    const u = finishUniforms(DEFAULT_FINISH);
    expect(u.lift).toEqual([0, 0, 0]);
    expect(u.gamma).toEqual([1, 1, 1]);
    expect(u.gain).toEqual([1, 1, 1]);
  });

  it("pushes a wheel toward its hue", () => {
    const u = finishUniforms({
      ...DEFAULT_FINISH,
      wheels: { ...DEFAULT_FINISH.wheels, gain: { x: 1, y: 0, l: 0 } },
    });
    expect(u.gain[0]).toBeGreaterThan(1);
    expect(u.gain[2]).toBeLessThan(1);
  });

  it("sways the film frame only with weave on, the same for the same time", () => {
    expect(filmMotion(DEFAULT_FINISH, 3.2).weave).toEqual([0, 0]);
    const f = { ...DEFAULT_FINISH, weave: 1, breath: 1 };
    expect(filmMotion(f, 3.2)).toEqual(filmMotion(f, 3.2));
    expect(Math.abs(filmMotion(f, 3.2).weave[1])).toBeGreaterThan(0);
  });
});
