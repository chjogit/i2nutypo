import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_HEIGHT,
  keyResize,
  MINI_PRESETS,
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
  it("keeps saved heights inside the range", () => {
    expect(readPreviewHeight(50)).toBe(PREVIEW_HEIGHT_RANGE[0]);
    expect(readPreviewHeight(99999)).toBe(PREVIEW_HEIGHT_RANGE[1]);
    expect(readPreviewHeight(640.4)).toBe(640);
  });
});

describe("mini window width", () => {
  it("reads the old step index saves", () => {
    expect(readMiniWidth(0)).toBe(MINI_PRESETS[0]);
    expect(readMiniWidth(2)).toBe(MINI_PRESETS[2]);
  });
  it("reads and clamps widths", () => {
    expect(readMiniWidth(300)).toBe(300);
    expect(readMiniWidth(5000)).toBe(720);
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
