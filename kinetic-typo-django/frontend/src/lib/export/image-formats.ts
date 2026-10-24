// Still-image formats for frame sequences with an alpha channel, written by
// hand so they need no library: Truevision TGA and SGI (.rgb), both RLE
// compressed, 8 bits per channel, RGBA, straight (not premultiplied) alpha.
// PNG frames come from the canvas itself.

export type SequenceFormat = "png" | "tga" | "sgi";

/** TGA type 10 (RLE true color), 32 bits per pixel, top-left origin. */
export function encodeTga(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array<ArrayBuffer> {
  // Worst case every packet is a single literal pixel: 1 + 4 bytes per pixel
  const out = new Uint8Array(18 + width * height * 5 + 26);
  out[2] = 10;
  out[12] = width & 0xff;
  out[13] = width >> 8;
  out[14] = height & 0xff;
  out[15] = height >> 8;
  out[16] = 32;
  // 8 alpha bits, rows stored top to bottom
  out[17] = 0x28;
  let o = 18;
  const px = (i: number) => (rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3];
  const put = (i: number) => {
    out[o++] = rgba[i + 2];
    out[o++] = rgba[i + 1];
    out[o++] = rgba[i];
    out[o++] = rgba[i + 3];
  };
  // Packets never cross a row, as the format asks
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let x = 0;
    while (x < width) {
      const at = row + x * 4;
      let run = 1;
      while (x + run < width && run < 128 && px(at + run * 4) === px(at)) run++;
      if (run > 1) {
        out[o++] = 0x80 | (run - 1);
        put(at);
        x += run;
        continue;
      }
      // Literal packet up to the next run of two or more
      let lit = 1;
      while (
        x + lit < width &&
        lit < 128 &&
        !(x + lit + 1 < width && px(at + lit * 4) === px(at + (lit + 1) * 4))
      )
        lit++;
      out[o++] = lit - 1;
      for (let k = 0; k < lit; k++) put(at + k * 4);
      x += lit;
    }
  }
  // TGA 2.0 footer (no extension or developer areas)
  o += 8;
  const sig = "TRUEVISION-XFILE.\0";
  for (let k = 0; k < sig.length; k++) out[o++] = sig.charCodeAt(k);
  return out.slice(0, o);
}

/** SGI image, RLE, four channels (R, G, B, A), rows stored bottom to top. */
export function encodeSgi(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array<ArrayBuffer> {
  const channels = 4;
  const rows = height * channels;
  const tableBytes = rows * 4;
  // Worst case: one count byte per 127 bytes of literal, plus the terminating 0
  const maxRow = width + Math.ceil(width / 127) + 1;
  const out = new Uint8Array(512 + tableBytes * 2 + rows * maxRow);
  const view = new DataView(out.buffer);
  view.setInt16(0, 474);
  out[2] = 1; // RLE
  out[3] = 1; // one byte per channel
  view.setUint16(4, 3);
  view.setUint16(6, width);
  view.setUint16(8, height);
  view.setUint16(10, channels);
  view.setInt32(12, 0);
  view.setInt32(16, 255);
  const name = "kinetic-typo";
  for (let k = 0; k < name.length; k++) out[24 + k] = name.charCodeAt(k);
  let o = 512 + tableBytes * 2;
  const line = new Uint8Array(width);
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < height; y++) {
      // y = 0 is the bottom row
      const src = (height - 1 - y) * width * 4 + c;
      for (let x = 0; x < width; x++) line[x] = rgba[src + x * 4];
      const start = o;
      let x = 0;
      while (x < width) {
        let run = 1;
        while (x + run < width && run < 127 && line[x + run] === line[x]) run++;
        if (run > 2) {
          out[o++] = run;
          out[o++] = line[x];
          x += run;
          continue;
        }
        let lit = 1;
        while (
          x + lit < width &&
          lit < 127 &&
          !(x + lit + 2 < width && line[x + lit] === line[x + lit + 1] && line[x + lit] === line[x + lit + 2])
        )
          lit++;
        out[o++] = 0x80 | lit;
        out.set(line.subarray(x, x + lit), o);
        o += lit;
        x += lit;
      }
      out[o++] = 0;
      const r = c * height + y;
      view.setUint32(512 + r * 4, start);
      view.setUint32(512 + tableBytes + r * 4, o - start);
    }
  }
  return out.slice(0, o);
}

/** File extension of each format's frames. */
export const SEQUENCE_EXT: Record<SequenceFormat, string> = { png: "png", tga: "tga", sgi: "sgi" };
