/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { WHISPER_SAMPLE_RATE } from "@/lib/sync/whisper-protocol";
import { KIM_VOCAL_2, separateVocals } from "./mdx";
import { SEPARATION_SAMPLE_RATE, type SeparateRequest, type SeparateResponse } from "./protocol";
import { resample, toMono } from "./resample";

// Runs inside the speech worker (workers/whisper.worker.ts), so it shares the
// ONNX runtime that transformers.js already set up. The model file is kept in
// the browser's Cache Storage after the first download.

const CACHE_NAME = "kinetic-typo-models";

async function fetchModel(url: string, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) {
    onProgress(1);
    return hit.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`분리 모델을 내려받지 못했습니다 (fetch ${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (total) onProgress(loaded / total);
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  await cache?.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
  return bytes.buffer;
}

async function createSession(
  model: ArrayBuffer,
): Promise<{ session: ort.InferenceSession; device: "webgpu" | "wasm" }> {
  const hasGpu = "gpu" in self.navigator;
  if (hasGpu) {
    try {
      return {
        session: await ort.InferenceSession.create(model, { executionProviders: ["webgpu"] }),
        device: "webgpu",
      };
    } catch (err) {
      console.warn("Separation on WebGPU failed, using the CPU:", err);
    }
  }
  return {
    session: await ort.InferenceSession.create(model, { executionProviders: ["wasm"] }),
    device: "wasm",
  };
}

export async function runSeparation(
  req: SeparateRequest,
  post: (msg: SeparateResponse) => void,
): Promise<void> {
  post({ type: "status", status: "loading-model" });
  const model = await fetchModel(req.modelUrl, (progress) => post({ type: "load-progress", progress }));
  const { session, device } = await createSession(model);
  try {
    post({ type: "status", status: "separating" });
    const cfg = KIM_VOCAL_2;
    const shape = [1, 4, cfg.dimF, cfg.dimT];
    const stems = await separateVocals(
      req.left,
      req.right,
      cfg,
      async (spectrum) => {
        const out = await session.run({
          [session.inputNames[0]]: new ort.Tensor("float32", spectrum, shape),
        });
        return out[session.outputNames[0]].data as Float32Array;
      },
      (progress) => post({ type: "separate-progress", progress }),
    );
    const vocals = resample(toMono(stems.left, stems.right), SEPARATION_SAMPLE_RATE, WHISPER_SAMPLE_RATE);
    self.postMessage({ type: "separated", vocals, device } satisfies SeparateResponse, [vocals.buffer]);
  } finally {
    await session.release();
  }
}
