// Vocal separation models. Both have MIT-licensed weights and are fetched from
// Hugging Face at a pinned revision, checked by SHA-256 (@audio/neural-separate),
// then kept in the browser's Cache Storage ("audio-neural").

export const SEPARATION_SAMPLE_RATE = 44100;

export type SeparationModel = "scnet" | "mel-roformer";

export interface SeparationModelInfo {
  id: SeparationModel;
  label: string;
  /** Download size in MB. */
  sizeMb: number;
  note: string;
  /** Needs a GPU (WebGPU) to finish in reasonable time. */
  gpuOnly: boolean;
}

export const SEPARATION_MODELS: readonly SeparationModelInfo[] = [
  { id: "scnet", label: "가볍게 (SCNet)", sizeMb: 13, note: "작고 빠름, CPU에서도 동작", gpuOnly: false },
  {
    id: "mel-roformer",
    label: "정밀하게 (Mel-Band RoFormer)",
    sizeMb: 464,
    note: "가장 깨끗한 보컬, GPU 전용, 처음 한 번 큰 다운로드",
    gpuOnly: true,
  },
];

export const DEFAULT_SEPARATION_MODEL: SeparationModel = "scnet";

export type SeparateRequest = {
  type: "separate";
  model: SeparationModel;
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
