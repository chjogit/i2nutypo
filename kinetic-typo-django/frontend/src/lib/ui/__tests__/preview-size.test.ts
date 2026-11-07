import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_HEIGHT,
  keyResize,
  MINI_PRESETS,
  MINI_WIDTH_RANGE,
  miniWidthCap,
  nearestMiniPreset,
  nextMiniPreset,
  PREVIEW_HEIGHT_RANGE,
  readMiniWidth,
  readPreviewHeight,
} from "../preview-size";

describe("preview height", () => {
  it("falls back to the default for missing or broken values", () => {
    expect(readPreviewHeight(undefined)).toBe(DEFAULT_PREVIEW_HEIGHT);
    expect(readPreviewHeight("600")).toBe(DEFAULT_PREVIEW_HEIGHT);
    expect(readPreviewHeight(Number.NaN)).toBe(DEFAULT_PREVIEW_HEIGHT);
  });
  it("grows at most 20% past the default", () => {
    expect(PREVIEW_HEIGHT_RANGE[1]).toBe(576);
    expect(readPreviewHeight(1200)).toBe(576);
  });
  it("keeps saved heights inside the range", () => {
    expect(readPreviewHeight(50)).toBe(PREVIEW_HEIGHT_RANGE[0]);
    expect(readPreviewHeight(99999)).toBe(PREVIEW_HEIGHT_RANGE[1]);
    expect(readPreviewHeight(540.4)).toBe(540);
  });
});

describe("mini window width", () => {
  it("reads the old step index saves", () => {
    expect(readMiniWidth(0)).toBe(MINI_PRESETS[0]);
    expect(readMiniWidth(2)).toBe(MINI_PRESETS[2]);
  });
  it("reads and clamps widths", () => {
    expect(readMiniWidth(300)).toBe(300);
    expect(readMiniWidth(5000)).toBe(1152);
    expect(readMiniWidth(1000)).toBe(1000);
    expect(readMiniWidth(null)).toBe(MINI_PRESETS[0]);
  });
  it("cycles the size button through the steps", () => {
    expect(nextMiniPreset(240)).toBe(360);
    expect(nextMiniPreset(300)).toBe(360);
    expect(nextMiniPreset(480)).toBe(240);
    expect(nextMiniPreset(700)).toBe(240);
    expect(nearestMiniPreset(330)).toBe(1);
  });
});

describe("mini window cap", () => {
  it("is twice the old 576 px top", () => {
    expect(MINI_WIDTH_RANGE).toEqual([200, 1152]);
  });
  it("reaches the top on a large screen", () => {
    expect(miniWidthCap(2560, 1440, 16 / 9)).toBe(1152);
  });
  it("stays inside the screen width", () => {
    expect(miniWidthCap(1024, 2000, 16 / 9)).toBe(1000);
  });
  it("stays inside the screen height", () => {
    // 768 - 24 - 28 = 716 px for the picture; 16:9 gives 1273, 9:16 gives 403
    expect(miniWidthCap(1920, 768, 16 / 9)).toBe(1152);
    expect(miniWidthCap(1920, 768, 9 / 16)).toBe(403);
  });
  it("never drops below the smallest width and ignores broken sizes", () => {
    expect(miniWidthCap(150, 100, 1)).toBe(200);
    expect(miniWidthCap(0, Number.NaN, 0)).toBe(1152);
  });
});

describe("keyboard resizing", () => {
  const steps = { step: 20, big: 80 };
  const range = [200, 1600] as const;
  const grow = ["ArrowDown"];
  const shrink = ["ArrowUp"];
  it("steps, big-steps and jumps to the ends", () => {
    expect(keyResize("ArrowDown", false, 480, range, steps, grow, shrink)).toBe(500);
    expect(keyResize("ArrowUp", true, 480, range, steps, grow, shrink)).toBe(400);
    expect(keyResize("Home", false, 480, range, steps, grow, shrink)).toBe(200);
    expect(keyResize("End", false, 480, range, steps, grow, shrink)).toBe(1600);
  });
  it("stays in range and ignores other keys", () => {
    expect(keyResize("ArrowUp", true, 210, range, steps, grow, shrink)).toBe(200);
    expect(keyResize("a", false, 480, range, steps, grow, shrink)).toBeNull();
  });
});
