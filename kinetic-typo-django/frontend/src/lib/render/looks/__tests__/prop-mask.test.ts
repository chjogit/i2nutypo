import { describe, expect, it } from "vitest";
import { DEFAULT_PROP_MASK, maskedPicture, maskSize } from "../prop-mask";

const img = { source: {} as CanvasImageSource, width: 3200, height: 1600 };

describe("illustration mask", () => {
  it("leaves the picture alone when off or missing", () => {
    expect(maskedPicture(img, undefined)).toBe(img);
    expect(maskedPicture(img, { ...DEFAULT_PROP_MASK, on: false })).toBe(img);
  });

  it("works large pictures at a capped size, keeping their shape", () => {
    expect(maskSize(img)).toEqual({ w: 1600, h: 800 });
    expect(maskSize({ width: 400, height: 300 })).toEqual({ w: 400, h: 300 });
  });
});
