import type { TranscriptChunk } from "./align";

export type WhisperLanguage = "korean" | "japanese" | "english";

/** Word timestamps when the model supports them, otherwise whole segments. */
export type TimestampMode = "word" | "segment";

export type WhisperRequest = {
  type: "transcribe";
  modelId: string;
  language: WhisperLanguage;
  /** Mono PCM at 16 kHz. */
  audio: Float32Array;
};

export type WhisperResponse =
  | { type: "status"; status: "loading-model" | "transcribing" }
  | { type: "load-progress"; progress: number }
  | { type: "transcribe-progress"; progress: number }
  | { type: "result"; chunks: TranscriptChunk[]; text: string; mode: TimestampMode }
  | { type: "error"; message: string };

export interface WhisperModelOption {
  id: string;
  label: string;
  note: string;
}

export const WHISPER_MODELS: readonly WhisperModelOption[] = [
  { id: "onnx-community/whisper-base", label: "Base", note: "빠름, 정확도 낮음" },
  { id: "onnx-community/whisper-small", label: "Small", note: "속도와 정확도 균형 (추천)" },
  { id: "onnx-community/whisper-large-v3-turbo", label: "Large v3 Turbo", note: "가장 정확, WebGPU 권장" },
];

export const DEFAULT_WHISPER_MODEL = "onnx-community/whisper-small";
/** Default when WebGPU is unavailable and Whisper runs on the CPU. */
export const CPU_WHISPER_MODEL = "onnx-community/whisper-base";

export const WHISPER_SAMPLE_RATE = 16000;
