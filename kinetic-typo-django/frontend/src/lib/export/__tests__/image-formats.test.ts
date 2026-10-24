import { describe, expect, it } from "vitest";
import { encodeSgi, encodeTga } from "../image-formats";

// Small decoders that read the files back the way the formats define them
function decodeTga(f: Uint8Array): Uint8Array {
  const w = f[12] | (f[13] << 8);
  const h = f[14] | (f[15] << 8);
  const out = new Uint8Array(w * h * 4);
  let i = 18;
  let p = 0;
  while (p < w * h) {
    const head = f[i++];
    const n = (head & 0x7f) + 1;
    for (let k = 0; k < n; k++) {
      const src = head & 0x80 ? i : i + k * 4;
      out.set([f[src + 2], f[src + 1], f[src], f[src + 3]], (p + k) * 4);
    }
    i += head & 0x80 ? 4 : n * 4;
    p += n;
  }
  return out;
}

function decodeSgi(f: Uint8Array): Uint8Array {
  const v = new DataView(f.buffer, f.byteOffset);
  const w = v.getUint16(6);
  const h = v.getUint16(8);
  const out = new Uint8Array(w * h * 4);
  for (let c = 0; c < 4; c++)
    for (let y = 0; y < h; y++) {
      let i = v.getUint32(512 + (c * h + y) * 4);
      let x = 0;
      const row = (h - 1 - y) * w;
      for (;;) {
        const head = f[i++];
        const n = head & 0x7f;
        if (n === 0) break;
        for (let k = 0; k < n; k++) out[(row + x + k) * 4 + c] = head & 0x80 ? f[i + k] : f[i];
        i += head & 0x80 ? n : 1;
        x += n;
      }
    }
  return out;
}

const W = 203;
const H = 9;
const image = (() => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const x = p % W;
    // Flat runs, noise and transparent stretches in every row
    d.set(
      x < 80
        ? [12, 34, 56, 255]
        : x > 180
          ? [0, 0, 0, 0]
          : [(p * 37) & 255, (p * 11) & 255, x, (p * 5) & 255],
      p * 4,
    );
  }
  return d;
})();

describe("frame sequence formats", () => {
  it("writes RLE TGA that reads back exactly", () => {
    const f = encodeTga(image, W, H);
    expect(f[2]).toBe(10);
    expect(f[16]).toBe(32);
    expect(Array.from(decodeTga(f))).toEqual(Array.from(image));
  });

  it("writes RLE SGI that reads back exactly", () => {
    const f = encodeSgi(image, W, H);
    expect(new DataView(f.buffer).getInt16(0)).toBe(474);
    expect(Array.from(decodeSgi(f))).toEqual(Array.from(image));
  });
});
