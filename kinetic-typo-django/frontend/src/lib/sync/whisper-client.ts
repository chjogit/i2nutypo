import type { LanguageCode } from "@/types/project";
import type { TranscriptChunk } from "./align";
import {
  WHISPER_SAMPLE_RATE,
  type TimestampMode,
  type WhisperLanguage,
  type WhisperRequest,
  type WhisperResponse,
} from "./whisper-protocol";

export const WHISPER_LANGUAGE: Record<LanguageCode, WhisperLanguage> = {
  "ko-KR": "korean",
  "ja-JP": "japanese",
  "en-US": "english",
};

/** Decodes an audio file to mono PCM at Whisper's 16 kHz sample rate. */
export async function decodeForWhisper(objectUrl: string): Promise<Float32Array> {
  const data = await (await fetch(objectUrl)).arrayBuffer();
  const ctx = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
  try {
    const buffer = await ctx.decodeAudioData(data);
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
    }
    return mono;
  } finally {
    await ctx.close();
  }
}

export interface TranscribeCallbacks {
  onStatus: (status: "loading-model" | "transcribing") => void;
  onLoadProgress: (progress: number) => void;
  onTranscribeProgress?: (progress: number) => void;
}

export interface TranscribeResult {
  chunks: TranscriptChunk[];
  text: string;
  mode: TimestampMode;
}

export interface TranscribeHandle {
  result: Promise<TranscribeResult>;
  /** Stops the worker; the result promise then rejects. */
  cancel: () => void;
}

/**
 * Transcribes in a fresh Web Worker that is terminated when done or
 * cancelled, which also frees the model's memory.
 */
export function transcribeInWorker(
  audio: Float32Array,
  modelId: string,
  language: WhisperLanguage,
  callbacks: TranscribeCallbacks,
): TranscribeHandle {
  // Built next to the editor bundle: static/js/whisper-worker.js
  const worker = new Worker(new URL("./whisper-worker.js", import.meta.url), { type: "module" });
  let rejectFn: (err: Error) => void = () => {};

  const result = new Promise<TranscribeResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent<WhisperResponse>) => {
      const msg = e.data;
      if (msg.type === "status") callbacks.onStatus(msg.status);
      else if (msg.type === "load-progress") callbacks.onLoadProgress(msg.progress);
      else if (msg.type === "transcribe-progress") callbacks.onTranscribeProgress?.(msg.progress);
      else if (msg.type === "result") {
        worker.terminate();
        resolve({ chunks: msg.chunks, text: msg.text, mode: msg.mode });
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "음성 인식 워커 오류"));
    };
  });

  const req: WhisperRequest = { type: "transcribe", modelId, language, audio };
  worker.postMessage(req, [audio.buffer]);

  return {
    result,
    cancel: () => {
      worker.terminate();
      rejectFn(new Error("cancelled"));
    },
  };
}
