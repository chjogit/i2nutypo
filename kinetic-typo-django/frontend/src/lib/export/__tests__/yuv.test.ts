import { describe, expect, it } from "vitest";
import { rgbaToI420Bt709 } from "../yuv";

const solid = (r: number, g: number, b: number, w = 4, h = 2) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([r, g, b, 255], i * 4);
  return rgbaToI420Bt709(px, w, h);
};

describe("rgbaToI420Bt709", () => {
  it("puts black, white and grey in the limited range", () => {
    expect(solid(0, 0, 0).slice(0, 8)).toEqual(new Uint8Array(8).fill(16));
    expect(solid(255, 255, 255)[0]).toBe(235);
    const grey = solid(128, 128, 128);
    expect(grey[0]).toBe(126);
    // Neutral colors have no chroma
    expect(grey[8]).toBe(128);
    expect(grey[10]).toBe(128);
  });

  it("uses the BT.709 weights", () => {
    // Pure red, green and blue: Y = 16 + 219 × (0.2126, 0.7152, 0.0722)
    expect(solid(255, 0, 0)[0]).toBe(63);
    expect(solid(0, 255, 0)[0]).toBe(173);
    expect(solid(0, 0, 255)[0]).toBe(32);
    // Blue has the most Cb, red the most Cr; both stay inside 16..240
    const blue = solid(0, 0, 255);
    const red = solid(255, 0, 0);
    expect(blue[8]).toBe(240);
    expect(red[10]).toBe(240);
  });

  it("lays out the Y, then the U, then the V plane", () => {
    expect(solid(10, 20, 30, 8, 6).length).toBe(8 * 6 + 2 * (4 * 3));
  });
});
