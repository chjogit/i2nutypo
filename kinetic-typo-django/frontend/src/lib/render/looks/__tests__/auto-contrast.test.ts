import { describe, expect, it } from "vitest";
import { contrastFix, contrastRatio, luminance, poorSpots, READABLE } from "../auto-contrast";

const mix = (c: readonly number[], end: number, k: number) =>
  c.map((v) => v + (end - v) * k) as [number, number, number];

describe("auto contrast", () => {
  it("measures contrast the WCAG way", () => {
    expect(contrastRatio(luminance(255, 255, 255), luminance(0, 0, 0))).toBeCloseTo(21, 0);
    expect(contrastRatio(luminance(119, 119, 119), luminance(255, 255, 255))).toBeCloseTo(4.48, 1);
  });

  it("leaves readable text alone", () => {
    expect(contrastFix([255, 255, 255], [20, 20, 40])).toBeNull();
  });

  it("darkens light text on a light background just enough", () => {
    const text = [250, 240, 200] as const;
    const bg = [245, 245, 235] as const;
    const fix = contrastFix(text, bg);
    expect(fix?.toward).toBe("black");
    const got = mix(text, 0, fix?.k ?? 0);
    expect(contrastRatio(luminance(...got), luminance(...bg))).toBeGreaterThanOrEqual(READABLE);
    expect(contrastRatio(luminance(...mix(text, 0, (fix?.k ?? 0) - 0.05)), luminance(...bg))).toBeLessThan(
      READABLE,
    );
  });

  it("lightens dark text on a dark background", () => {
    const fix = contrastFix([30, 20, 60], [25, 25, 35]);
    expect(fix?.toward).toBe("white");
  });
});

describe("poor spots", () => {
  const px = (list: number[][]) => new Uint8ClampedArray(list.flat());

  it("finds a dark word among light ones on a dark background", () => {
    const text = px([
      [230, 230, 255, 255],
      [230, 230, 255, 255],
      [30, 30, 80, 255],
      [30, 30, 80, 255],
      [0, 0, 0, 0],
    ]);
    const bg = px([
      [25, 25, 90, 255],
      [25, 25, 90, 255],
      [25, 25, 90, 255],
      [25, 25, 90, 255],
      [25, 25, 90, 255],
    ]);
    const spots = poorSpots(text, bg);
    expect(spots?.text[2]).toBeCloseTo(80);
    expect(contrastFix(spots!.text, spots!.bg)?.toward).toBe("white");
  });

  it("ignores text that reads everywhere", () => {
    const text = px([
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    const bg = px([
      [0, 0, 0, 255],
      [10, 10, 10, 255],
    ]);
    expect(poorSpots(text, bg)).toBeNull();
  });
});
