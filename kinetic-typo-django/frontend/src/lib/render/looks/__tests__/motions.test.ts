import { describe, expect, it } from "vitest";
import { MOTION_BY_ID, MOTIONS_PER_SONG, pickMotions, sanitizeMotionPicks, THEME_MOTIONS } from "../motions";

describe("lyric motions", () => {
  it("gives every theme twelve known motions", () => {
    for (const list of Object.values(THEME_MOTIONS)) {
      expect(new Set(list).size).toBe(12);
      for (const id of list) expect(MOTION_BY_ID.has(id)).toBe(true);
    }
  });

  it("picks six per theme, the same for the same seed and different for another", () => {
    const a = pickMotions(42);
    expect(pickMotions(42)).toEqual(a);
    for (const list of Object.values(a)) expect(list).toHaveLength(MOTIONS_PER_SONG);
    expect(pickMotions(43)).not.toEqual(a);
  });

  it("drops unknown themes and motions", () => {
    expect(sanitizeMotionPicks({ pop_cutout: ["stamp", "nope"], nope: ["stamp"] })).toEqual({
      pop_cutout: ["stamp"],
    });
  });
});
