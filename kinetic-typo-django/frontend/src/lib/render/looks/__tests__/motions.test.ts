import { describe, expect, it } from "vitest";
import { SCREEN_THEMES } from "../screen-kit";
import { MOTION_BY_ID, MOTIONS_PER_SONG, pickMotions, sanitizeMotionPicks, THEME_MOTIONS } from "../motions";

describe("lyric motions", () => {
  it("gives every theme nineteen known motions", () => {
    for (const [id, list] of Object.entries(THEME_MOTIONS)) {
      // The screen themes move their own app pieces and have no line motions
      if (SCREEN_THEMES.has(id)) {
        expect(list).toHaveLength(0);
        continue;
      }
      expect(new Set(list).size).toBe(19);
      for (const id of list) expect(MOTION_BY_ID.has(id)).toBe(true);
    }
  });

  it("picks six per theme, the same for the same seed and different for another", () => {
    const a = pickMotions(42);
    expect(pickMotions(42)).toEqual(a);
    for (const [id, list] of Object.entries(a))
      expect(list).toHaveLength(SCREEN_THEMES.has(id) ? 0 : MOTIONS_PER_SONG);
    expect(pickMotions(43)).not.toEqual(a);
  });

  it("drops unknown themes and motions", () => {
    expect(sanitizeMotionPicks({ pop_cutout: ["stamp", "nope"], nope: ["stamp"] })).toEqual({
      pop_cutout: ["stamp"],
    });
  });
});
