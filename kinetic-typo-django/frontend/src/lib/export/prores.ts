import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// MOV with Apple ProRes 4444 XQ and a 16-bit alpha channel, for compositing
// the lyrics layer in other editors. Browsers cannot encode ProRes, so this
// uses FFmpeg compiled to WebAssembly, run in a worker in this browser: the
// frames never leave the computer. The FFmpeg program (about 32 MB) is
// downloaded from a public CDN the first time it is used.

const CORE_VERSION = "0.12.10";
const CORE_BASES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
];
/** Frames encoded per piece, so the PNG frames never all sit in the worker's memory at once. */
const CHUNK_FRAMES = 240;

export interface ProResWriter {
  /** Adds the next frame (PNG with alpha). */
  add: (png: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** Encodes what is left and returns the finished MOV. */
  finish: () => Promise<Blob>;
  /** Stops the worker and frees its memory; safe to call twice. */
  dispose: () => void;
}

async function loadCore(onDownload: (share: number) => void): Promise<{ coreURL: string; wasmURL: string }> {
  let last: unknown = null;
  for (const base of CORE_BASES) {
    try {
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm", true, (e) => {
        if (e.total > 0) onDownload(Math.min(1, e.received / e.total));
      });
      return { coreURL, wasmURL };
    } catch (e) {
      last = e;
    }
  }
  throw new Error(
    `ProRes 인코더(FFmpeg)를 내려받지 못했습니다. 인터넷 연결을 확인해 주세요. (${last instanceof Error ? last.message : "download"})`,
  );
}

export async function openProResWriter(o: {
  fps: number;
  /** 0..1 while the encoder downloads (first use only; the browser caches it after). */
  onDownload: (share: number) => void;
}): Promise<ProResWriter> {
  const urls = await loadCore(o.onDownload);
  const ffmpeg = new FFmpeg();
  let alive = true;
  const dispose = () => {
    if (!alive) return;
    alive = false;
    ffmpeg.terminate();
    URL.revokeObjectURL(urls.coreURL);
    URL.revokeObjectURL(urls.wasmURL);
  };
  try {
    await ffmpeg.load({
      ...urls,
      classWorkerURL: new URL("./ffmpeg-worker.js", import.meta.url).href,
    });
  } catch (e) {
    dispose();
    throw e;
  }

  const name = (n: number) => `f${String(n).padStart(6, "0")}.png`;
  const parts: string[] = [];
  let frame = 0;
  let chunkStart = 0;

  const encodeChunk = async () => {
    const count = frame - chunkStart;
    if (count <= 0) return;
    const out = `part${String(parts.length).padStart(4, "0")}.mov`;
    // prores_ks profile 5 = 4444 XQ; 16-bit alpha; "apl0" so editors treat it as Apple's own
    const code = await ffmpeg.exec([
      "-framerate",
      String(o.fps),
      "-start_number",
      String(chunkStart),
      "-i",
      "f%06d.png",
      "-frames:v",
      String(count),
      "-c:v",
      "prores_ks",
      "-profile:v",
      "5",
      "-pix_fmt",
      "yuva444p10le",
      "-alpha_bits",
      "16",
      "-vendor",
      "apl0",
      out,
    ]);
    for (let n = chunkStart; n < frame; n++) await ffmpeg.deleteFile(name(n));
    if (code !== 0) throw new Error("ProRes 인코딩에 실패했습니다.");
    parts.push(out);
    chunkStart = frame;
  };

  return {
    add: async (png) => {
      await ffmpeg.writeFile(name(frame), png);
      frame++;
      if (frame - chunkStart >= CHUNK_FRAMES) await encodeChunk();
    },
    finish: async () => {
      await encodeChunk();
      let file = parts[0];
      if (parts.length > 1) {
        // Joins the pieces without encoding again
        await ffmpeg.writeFile("list.txt", parts.map((p) => `file '${p}'`).join("\n"));
        const code = await ffmpeg.exec([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "list.txt",
          "-c",
          "copy",
          "out.mov",
        ]);
        if (code !== 0) throw new Error("ProRes 조각을 잇지 못했습니다.");
        for (const p of parts) await ffmpeg.deleteFile(p);
        file = "out.mov";
      }
      if (!file) throw new Error("저장할 프레임이 없습니다.");
      const data = await ffmpeg.readFile(file);
      if (typeof data === "string") throw new Error("ProRes 파일을 읽지 못했습니다.");
      return new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/quicktime" });
    },
    dispose,
  };
}
