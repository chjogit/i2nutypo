/**
 * RGBA (sRGB, as a 2D canvas holds it) to 8-bit I420 in BT.709 limited range,
 * the color form ordinary video players, editors and upload sites expect.
 * Chroma is the average of each 2×2 block. Width and height must be even.
 */
export function rgbaToI420Bt709(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  out?: Uint8Array,
): Uint8Array {
  const ySize = width * height;
  const cw = width >> 1;
  const cSize = cw * (height >> 1);
  const dst = out && out.length === ySize + cSize * 2 ? out : new Uint8Array(ySize + cSize * 2);
  // BT.709 in 16-bit fixed point: Y = 16 + 219/255 (0.2126 R + 0.7152 G + 0.0722 B),
  // Cb = 128 + 224/255 (B − Y′) / 1.8556, Cr = 128 + 224/255 (R − Y′) / 1.5748
  const YR = 11966; // 0.2126 × 219/255 × 65536
  const YG = 40254;
  const YB = 4064;
  const UR = -6596; // Cb row × 65536, for the sum of a 2×2 block (÷4 folded in below)
  const UG = -22189;
  const UB = 28784;
  const VR = 28784;
  const VG = -26145;
  const VB = -2639;
  const uOff = ySize;
  const vOff = ySize + cSize;
  const row = width * 4;
  for (let y = 0; y < height; y += 2) {
    let a = y * row;
    let o = y * width;
    let c = (y >> 1) * cw;
    for (let x = 0; x < width; x += 2, a += 8, o += 2, c++) {
      const b = a + row;
      const r0 = rgba[a],
        g0 = rgba[a + 1],
        b0 = rgba[a + 2];
      const r1 = rgba[a + 4],
        g1 = rgba[a + 5],
        b1 = rgba[a + 6];
      const r2 = rgba[b],
        g2 = rgba[b + 1],
        b2 = rgba[b + 2];
      const r3 = rgba[b + 4],
        g3 = rgba[b + 5],
        b3 = rgba[b + 6];
      dst[o] = (YR * r0 + YG * g0 + YB * b0 + 0x108000) >> 16;
      dst[o + 1] = (YR * r1 + YG * g1 + YB * b1 + 0x108000) >> 16;
      dst[o + width] = (YR * r2 + YG * g2 + YB * b2 + 0x108000) >> 16;
      dst[o + width + 1] = (YR * r3 + YG * g3 + YB * b3 + 0x108000) >> 16;
      const rs = r0 + r1 + r2 + r3;
      const gs = g0 + g1 + g2 + g3;
      const bs = b0 + b1 + b2 + b3;
      // The block sums are 4× a pixel: shift by 18 instead of 16
      dst[uOff + c] = (UR * rs + UG * gs + UB * bs + 0x2020000) >> 18;
      dst[vOff + c] = (VR * rs + VG * gs + VB * bs + 0x2020000) >> 18;
    }
  }
  return dst;
}

/** The color space of frames from {@link rgbaToI420Bt709}. */
export const BT709_LIMITED: VideoColorSpaceInit = {
  primaries: "bt709",
  transfer: "bt709",
  matrix: "bt709",
  fullRange: false,
};
