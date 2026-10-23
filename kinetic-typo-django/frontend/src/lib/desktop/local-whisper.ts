import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TranscriptChunk } from "@/lib/sync/align";
import type { TranscribeCallbacks, TranscribeHandle } from "@/lib/sync/whisper-client";
import type { WhisperLanguage } from "@/lib/sync/whisper-protocol";

// Bridge to the desktop app's whisper.cpp engine (src-tauri/src/local_whisper.rs).
// Only usable inside the Tauri app; the web build never calls these.

export const isDesktopApp = (): boolean => typeof window !== "undefined" && isTauri();

export type LocalBackend = "metal" | "cuda" | "vulkan" | "cpu";

export const LOCAL_BACKEND_LABEL: Record<LocalBackend, string> = {
  metal: "Apple GPU (Metal)",
  cuda: "NVIDIA GPU (CUDA)",
  vulkan: "GPU (Vulkan)",
  cpu: "CPU",
};

export interface LocalModel {
  id: string;
  label: string;
  note: string;
  sizeMb: number;
  installed: boolean;
}

export interface LocalWhisperInfo {
  backend: LocalBackend;
  models: LocalModel[];
}

export const DEFAULT_LOCAL_MODEL = "large-v3-turbo-q5_0";

const ISO_LANGUAGE: Record<WhisperLanguage, string> = {
  korean: "ko",
  japanese: "ja",
  english: "en",
};

export const getLocalWhisperInfo = () => invoke<LocalWhisperInfo>("local_whisper_info");

export const deleteLocalModel = (model: string) => invoke<void>("local_whisper_delete", { model });

/** Frees the GPU memory held by the last used model. */
export const unloadLocalModel = () => invoke<void>("local_whisper_unload");

export interface DownloadHandle {
  result: Promise<void>;
  cancel: () => void;
}

/** Downloads a ggml model into the app's data folder. */
export function downloadLocalModel(model: string, onProgress: (progress: number) => void): DownloadHandle {
  const result = (async () => {
    const unlisten = await listen<{ model: string; progress: number }>("local-whisper:download", (e) => {
      if (e.payload.model === model) onProgress(e.payload.progress);
    });
    try {
      await invoke<void>("local_whisper_download", { model });
    } finally {
      unlisten();
    }
  })();
  return { result, cancel: () => void invoke("local_whisper_cancel") };
}

type StatusEvent = { status: "loading-model" } | { status: "transcribing"; progress: number };

export interface LocalTranscribeCallbacks extends TranscribeCallbacks {
  onTranscribeProgress: (progress: number) => void;
}

/**
 * Same contract as transcribeInWorker, but runs whisper.cpp natively. The
 * PCM goes to the Rust side as a raw IPC body (no JSON copy of the samples).
 */
export function transcribeLocal(
  audio: Float32Array,
  modelId: string,
  language: WhisperLanguage,
  callbacks: LocalTranscribeCallbacks,
): TranscribeHandle {
  let rejectFn: (err: Error) => void = () => {};
  let unlisten: UnlistenFn | null = null;
  let settled = false;

  const run = async () => {
    const stop = await listen<StatusEvent>("local-whisper:status", (e) => {
      if (settled) return;
      if (e.payload.status === "loading-model") callbacks.onStatus("loading-model");
      else {
        callbacks.onStatus("transcribing");
        callbacks.onTranscribeProgress(e.payload.progress);
      }
    });
    if (settled) {
      // Cancelled while subscribing
      stop();
      throw new Error("cancelled");
    }
    unlisten = stop;
    const out = await invoke<{ chunks: TranscriptChunk[]; text: string }>(
      "local_whisper_transcribe",
      new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength),
      { headers: { "x-model": modelId, "x-language": ISO_LANGUAGE[language] } },
    );
    // max_len 1 + token timestamps gives one piece per word
    return { chunks: out.chunks, text: out.text, mode: "word" as const };
  };

  const result = new Promise<Awaited<ReturnType<typeof run>>>((resolve, reject) => {
    rejectFn = reject;
    run().then(resolve, (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
  }).finally(() => {
    settled = true;
    unlisten?.();
  });

  return {
    result,
    cancel: () => {
      settled = true;
      void invoke("local_whisper_cancel");
      rejectFn(new Error("cancelled"));
    },
  };
}
