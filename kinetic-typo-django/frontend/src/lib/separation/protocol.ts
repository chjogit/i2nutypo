import { MDX_SAMPLE_RATE } from "./mdx";

/** Kim Vocal 2 from the Ultimate Vocal Remover project (MIT), 67 MB, downloaded once and cached by the browser. */
export const VOCAL_MODEL_URL =
  "https://huggingface.co/Politrees/UVR_resources/resolve/main/models/MDXNet/Kim_Vocal_2.onnx";

export const SEPARATION_SAMPLE_RATE = MDX_SAMPLE_RATE;

export type SeparateRequest = {
  type: "separate";
  modelUrl: string;
  /** Stereo PCM at 44.1 kHz (the same array twice for a mono file). */
  left: Float32Array;
  right: Float32Array;
};

export type SeparateResponse =
  | { type: "status"; status: "loading-model" | "separating" }
  | { type: "load-progress"; progress: number }
  | { type: "separate-progress"; progress: number }
  /** Mono vocals at Whisper's 16 kHz; device says where the model ran. */
  | { type: "separated"; vocals: Float32Array; device: "webgpu" | "wasm" }
  | { type: "error"; message: string };
