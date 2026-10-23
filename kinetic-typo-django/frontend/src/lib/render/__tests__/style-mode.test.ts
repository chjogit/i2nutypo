import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "@/store/project-store";
import type { LyricLine, StyleSettings } from "@/types/project";
import { DEFAULT_DETAIL } from "../detail";
import { effectiveFx, effectiveStyle, lineForOffsets } from "../style-mode";
import { defaultFxToggles } from "@/lib/fx/toggles";

const DEFAULT_FX = defaultFxToggles();

const line = { offsetX: 0.2, offsetY: 0, lineStyle: { glitch: 0.9, size: 1.5 } } as LyricLine;
const tuned: StyleSettings = {
  ...DEFAULT_STYLE,
  lookPreset: "dark_glitch",
  lookElements: { "dark_glitch.rgb": { on: false, amount: 0.4 } },
  detail: { ...DEFAULT_DETAIL, glitch: 0.1, shake: 0.8 },
};

describe("effectiveStyle", () => {
  it("treats an old preset-mode save like everything else", () => {
    const s = effectiveStyle({ ...tuned, styleMode: "preset" }, line);
    expect(s.lookElements).toBe(tuned.lookElements);
    expect(s.detail.glitch).toBe(0.9);
    expect(lineForOffsets({ ...tuned, styleMode: "preset" }, line)).toBe(line);
  });

  it("applies the line's own overrides on top in custom mode", () => {
    const s = effectiveStyle({ ...tuned, styleMode: "custom" }, line);
    expect(s.detail.glitch).toBe(0.9);
    expect(s.detail.shake).toBe(0.8);
    expect(s.fontScale).toBeCloseTo(tuned.fontScale * 1.5);
    expect(s.lookElements).toBe(tuned.lookElements);
    expect(lineForOffsets({ ...tuned, styleMode: "custom" }, line)).toBe(line);
  });
});

describe("effectiveFx", () => {
  it("draws the user's classic switches", () => {
    const fx = { ...DEFAULT_FX, fxBlur: false };
    expect(effectiveFx({ ...tuned, styleMode: "preset" }, fx).fxBlur).toBe(false);
    expect(effectiveFx({ ...tuned, styleMode: "custom" }, fx).fxBlur).toBe(false);
  });
});
