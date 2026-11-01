import { describe, expect, it } from "vitest";
import { getLookPreset, LOOK_PRESET_IDS } from "../presets";
import { THEME_CONTRAST_DEFAULTS } from "../theme-contrast";

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("theme palettes", () => {
  // Themes that draw their lyrics over their own pictures (paper, film, soft scenery) can start with
  // a palette whose lyric and background colors are close, but only if the automatic contrast is on.
  it("lyric and background colors differ enough, or the theme's automatic contrast is on", () => {
    for (const id of LOOK_PRESET_IDS) {
      if (id === "classic") continue;
      const { palette } = getLookPreset(id);
      const enough = ratio(palette.bgColor, palette.textColor) >= 3;
      expect(enough || THEME_CONTRAST_DEFAULTS[id].mode !== "off", id).toBe(true);
    }
  });
});
