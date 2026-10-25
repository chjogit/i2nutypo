import {
  SEPARATION_SAMPLE_RATE,
  type SeparateRequest,
  type SeparateResponse,
  type SeparationModel,
} from "./protocol";

/** Decodes an audio file to stereo PCM at 44.1 kHz, the separation model's rate. */
export async function decodeStereo(objectUrl: string): Promise<{ left: Float32Array; right: Float32Array }> {
  const data = await (await fetch(objectUrl)).arrayBuffer();
  const ctx = new AudioContext({ sampleRate: SEPARATION_SAMPLE_RATE });
  try {
    const buffer = await ctx.decodeAudioData(data);
    const left = buffer.getChannelData(0).slice();
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : left.slice();
    return { left, right };
  } finally {
    await ctx.close();
  }
}

export interface SeparateCallbacks {
  onStatus: (status: "loading-model" | "separating") => void;
  onLoadProgress: (progress: number) => void;
  onProgress: (progress: number) => void;
}

export interface SeparateHandle {
  /** Mono vocals at 16 kHz, and where the model ran. */
  result: Promise<{ vocals: Float32Array; device: "webgpu" | "wasm" }>;
  cancel: () => void;
}

/** Separates the vocals in a fresh worker, terminated when done. */
export function separateInWorker(
  left: Float32Array,
  right: Float32Array,
  model: SeparationModel,
  callbacks: SeparateCallbacks,
): SeparateHandle {
  const worker = new Worker(new URL("./separation-worker.js", import.meta.url), { type: "module" });
  let rejectFn: (err: Error) => void = () => {};
  const result = new Promise<{ vocals: Float32Array; device: "webgpu" | "wasm" }>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent<SeparateResponse>) => {
      const msg = e.data;
      if (msg.type === "status") callbacks.onStatus(msg.status);
      else if (msg.type === "load-progress") callbacks.onLoadProgress(msg.progress);
      else if (msg.type === "separate-progress") callbacks.onProgress(msg.progress);
      else if (msg.type === "separated") {
        worker.terminate();
        resolve({ vocals: msg.vocals, device: msg.device });
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "보컬 분리 워커 오류"));
    };
  });
  const req: SeparateRequest = { type: "separate", model, left, right };
  worker.postMessage(req, left.buffer === right.buffer ? [left.buffer] : [left.buffer, right.buffer]);
  return {
    result,
    cancel: () => {
      worker.terminate();
      rejectFn(new Error("cancelled"));
    },
  };
}

/** 16-bit mono WAV, so the separated vocals can be listened to. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? Math.min(4, 0.9 / peak) : 1;
  for (let i = 0; i < samples.length; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * gain)) * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
