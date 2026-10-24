// A ZIP archive written in the browser without compression ("stored"): the
// files going in are PNG frames, which are compressed already.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array<ArrayBuffer>;
  crc: number;
  size: number;
  offset: number;
}

/** Collects files one by one and builds the archive as a Blob, so the frames need not sit in one buffer. */
export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: Entry[] = [];
  private offset = 0;

  add(fileName: string, data: Uint8Array<ArrayBuffer>): void {
    const name = new TextEncoder().encode(fileName);
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    // Bit 11: the file name is UTF-8
    head.setUint16(6, 0x0800, true);
    head.setUint16(8, 0, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, 0x21, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    this.parts.push(head.buffer, name, data);
    this.entries.push({ name, crc, size: data.length, offset: this.offset });
    this.offset += 30 + name.length + data.length;
  }

  /** The finished archive. ZIP64 is not written, so it holds up to 65535 files and 4 GB. */
  finish(): Blob {
    const start = this.offset;
    let size = 0;
    for (const e of this.entries) {
      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true);
      dir.setUint16(4, 20, true);
      dir.setUint16(6, 20, true);
      dir.setUint16(8, 0x0800, true);
      dir.setUint16(10, 0, true);
      dir.setUint16(12, 0, true);
      dir.setUint16(14, 0x21, true);
      dir.setUint32(16, e.crc, true);
      dir.setUint32(20, e.size, true);
      dir.setUint32(24, e.size, true);
      dir.setUint16(28, e.name.length, true);
      dir.setUint32(42, e.offset, true);
      this.parts.push(dir.buffer, e.name);
      size += 46 + e.name.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, start, true);
    this.parts.push(end.buffer);
    return new Blob(this.parts, { type: "application/zip" });
  }

  get count(): number {
    return this.entries.length;
  }

  /** Bytes written so far. */
  get bytes(): number {
    return this.offset;
  }
}
