import { describe, expect, it } from "vitest";
import { breakUnits, fitScale, isSpaced, manualRows, MIN_FIT_SCALE, widthAround, wrapText } from "../wrap";

// One unit of width per character, so widths are easy to reason about
const measure = (s: string) => Array.from(s).length;

describe("wrapText", () => {
  it("breaks spaced text between words", () => {
    expect(wrapText("그래 나 외로웠지만 덕분에 버텼던 Tonight", 10, measure)).toEqual([
      "그래 나 외로웠지만",
      "덕분에 버텼던",
      "Tonight",
    ]);
  });

  it("breaks Japanese between characters, never starting a line with small kana or punctuation", () => {
    const lines = wrapText("君がいないよるはさびしいっ。", 5, measure);
    expect(lines.join("")).toBe("君がいないよるはさびしいっ。");
    for (const l of lines.slice(1)) expect(l[0]).not.toMatch(/[っ。]/);
    expect(lines.every((l) => measure(l) <= 6)).toBe(true);
  });

  it("keeps Latin words whole inside Japanese", () => {
    expect(breakUnits("夜Without You")).toEqual(["夜Without", "You"]);
    expect(breakUnits("夜にWithout")).toEqual(["夜", "に", "Without"]);
  });

  it("splits a single word wider than the line", () => {
    expect(wrapText("Supercalifragilistic", 8, measure)).toEqual(["Supercal", "ifragili", "stic"]);
  });

  it("returns nothing for blank text", () => {
    expect(wrapText("   ", 10, measure)).toEqual([]);
  });
});

describe("widthAround", () => {
  it("narrows as the center moves toward an edge", () => {
    expect(widthAround(500, 1000, 50)).toBe(900);
    expect(widthAround(800, 1000, 50)).toBe(300);
    expect(widthAround(1200, 1000, 50)).toBe(0);
  });
});

describe("phrases and manual breaks", () => {
  it("shrinks a Japanese phrase written with spaces instead of cutting it", () => {
    const text = "変わらぬ人の 惨さに近い";
    // The longer phrase (6 characters) does not fit 5: shrink to 5/6 rather than leave "の" alone
    expect(fitScale(text, 5, measure)).toBeCloseTo(5 / 6);
    expect(wrapText(text, 6, measure)).toEqual(["変わらぬ人の", "惨さに近い"]);
    expect(fitScale(text, 20, measure)).toBe(1);
  });

  it("never shrinks below the floor", () => {
    expect(fitScale("Supercalifragilistic", 4, measure)).toBe(MIN_FIT_SCALE);
  });

  it("starts a new row at /n and at newlines", () => {
    expect(wrapText("変わらぬ人の/n惨さに近い", 40, measure)).toEqual(["変わらぬ人の", "惨さに近い"]);
    expect(wrapText("one two\nthree", 40, measure)).toEqual(["one two", "three"]);
    expect(manualRows(" a /n b ")).toEqual(["a", "b"]);
  });

  it("does not count a manual break as a space", () => {
    expect(isSpaced("変わらぬ人の\n惨さに近い")).toBe(false);
    expect(isSpaced("変わらぬ人の 惨さに近い")).toBe(true);
  });
});
