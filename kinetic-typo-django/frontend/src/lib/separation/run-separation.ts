/// <reference lib="webworker" />
import separate from "@audio/neural-separate";
import { WHISPER_SAMPLE_RATE } from "@/lib/sync/whisper-protocol";
import { SEPARATION_SAMPLE_RATE, type SeparateRequest, type SeparateResponse } from "./protocol";
import { resample, toMono } from "./resample";

// Runs inside the separation worker (workers/separation.worker.ts) with the
// onnxruntime-web build @audio/neural-separate is tested against. Its .wasm
// files come from jsDelivr at that exact version.

const ORT_VERSION = "1.30.0";
const WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

async function hasGpu(): Promise<boolean> {
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return Boolean(gpu && (await gpu.requestAdapter().catch(() => null)));
}

export async function runSeparation(
  req: SeparateRequest,
  post: (msg: SeparateResponse) => void,
): Promise<void> {
  post({ type: "status", status: "loading-model" });
  const run = async (device: "webgpu" | "wasm") => {
    let started = false;
    const out = await separate([req.left, req.right], {
      sampleRate: SEPARATION_SAMPLE_RATE,
      model: req.model,
      targets: ["vocals"],
      device,
      wasmPaths: WASM_PATHS,
      progress: ({ chunk, totalChunks }) => {
        if (!started) {
          started = true;
          post({ type: "status", status: "separating" });
        }
        post({ type: "separate-progress", progress: totalChunks ? chunk / totalChunks : 0 });
      },
    });
    return out.stems.vocals;
  };
  let device: "webgpu" | "wasm" = (await hasGpu()) ? "webgpu" : "wasm";
  let stems: Float32Array[];
  try {
    stems = await run(device);
  } catch (err) {
    if (device === "wasm" || req.model === "mel-roformer") throw err;
    console.warn("Separation on WebGPU failed, using the CPU:", err);
    device = "wasm";
    stems = await run(device);
  }
  const [left, right = left] = stems;
  const vocals = resample(toMono(left, right), SEPARATION_SAMPLE_RATE, WHISPER_SAMPLE_RATE);
  self.postMessage({ type: "separated", vocals, device } satisfies SeparateResponse, [vocals.buffer]);
}
