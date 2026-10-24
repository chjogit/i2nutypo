import { describe, expect, it } from "vitest";
import { contrastFor, sanitizeThemeContrast, THEME_CONTRAST_DEFAULTS } from "../theme-contrast";

describe("auto contrast per theme", () => {
  it("uses the theme's default until the theme has its own choice", () => {
    expect(contrastFor({ themeContrast: {} }, "neon_sign")).toEqual(THEME_CONTRAST_DEFAULTS.neon_sign);
    expect(contrastFor({ themeContrast: {} }, "flat_type").mode).toBe("off");
    const own = { themeContrast: { flat_type: { mode: "color" as const, amount: 0.8 } } };
    expect(contrastFor(own, "flat_type")).toEqual({ mode: "color", amount: 0.8 });
    // Another theme is not affected
    expect(contrastFor(own, "neon_sign").mode).toBe("outline");
  });

  it("keeps only known themes and valid values from a save", () => {
    const out = sanitizeThemeContrast({
      album_jacket: { mode: "outline", amount: 3 },
      nope: { mode: "color", amount: 0.5 },
      deep_sea: { mode: "weird", amount: 0.5 },
    });
    expect(out).toEqual({ album_jacket: { mode: "outline", amount: 1 } });
  });
});
