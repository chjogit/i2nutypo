/// <reference lib="webworker" />
import {
  pipeline,
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
  type PretrainedModelOptions,
} from "@huggingface/transformers";
import type { TranscriptChunk } from "@/lib/sync/align";
import { isSilent, placeWindowChunks, planWindows } from "@/lib/sync/windows";
import {
  WHISPER_SAMPLE_RATE,
  type TimestampMode,
  type WhisperRequest,
  type WhisperResponse,
} from "@/lib/sync/whisper-protocol";

// Runs Whisper in the browser, one worker per job (terminated afterwards to
// free memory). Model files are downloaded once from the Hugging Face hub and
// cached by the browser; the audio itself never leaves the device.

const post = (msg: WhisperResponse) => self.postMessage(msg);

// pipeline()'s generic overloads are too large for the type checker; pin the one task used here
const createAsrPipeline = pipeline as unknown as (
  task: "automatic-speech-recognition",
  model: string,
  options: PretrainedModelOptions,
) => Promise<AutomaticSpeechRecognitionPipeline>;

type Precision = Pick<PretrainedModelOptions, "device" | "dtype">;

/**
 * The encoder hears the song, so it gets the most precision the device can
 * afford: full precision on WebGPU (half for the large model when supported),
 * 8-bit on CPU. Quantizing the encoder to 4 bits, as before, costs a lot of
 * accuracy on music. The decoder only writes text and stays 4-bit on GPU.
 */
async function pickPrecision(modelId: string): Promise<Precision> {
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> } })
    .gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  if (!adapter) return CPU_PRECISION;
  const large = modelId.includes("large");
  const encoder = !large ? "fp32" : adapter.features.has("shader-f16") ? "fp16" : "q4";
  return { device: "webgpu", dtype: { encoder_model: encoder, decoder_model_merged: "q4" } };
}

interface GPUAdapterLike {
  features: { has(name: string): boolean };
}

const CPU_PRECISION: Precision = { device: "wasm", dtype: "q8" };

/** Loads on the chosen device; if WebGPU fails to start (driver, memory), retries on the CPU. */
async function loadPipeline(
  modelId: string,
  precision: Precision,
): Promise<AutomaticSpeechRecognitionPipeline> {
  try {
    return await loadOn(modelId, precision);
  } catch (err) {
    if (precision.device !== "webgpu" || /fetch|network|404|not found/i.test(String(err))) throw err;
    console.warn("WebGPU failed, retrying on CPU:", err);
    return loadOn(modelId, CPU_PRECISION);
  }
}

async function loadOn(modelId: string, precision: Precision): Promise<AutomaticSpeechRecognitionPipeline> {
  const fileBytes = new Map<string, { loaded: number; total: number }>();
  return createAsrPipeline("automatic-speech-recognition", modelId, {
    ...precision,
    progress_callback: (info: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress" || !info.file || !info.total) return;
      fileBytes.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
      let sumLoaded = 0;
      let sumTotal = 0;
      for (const f of fileBytes.values()) {
        sumLoaded += f.loaded;
        sumTotal += f.total;
      }
      post({ type: "load-progress", progress: sumTotal > 0 ? sumLoaded / sumTotal : 0 });
    },
  });
}

/**
 * Transcribes the song window by window (see lib/sync/windows.ts). Each
 * window is decoded on its own, so a window of pure music cannot shift the
 * timestamps of the windows after it, and silent windows are skipped.
 */
async function transcribe(
  pipe: AutomaticSpeechRecognitionPipeline,
  req: WhisperRequest,
  mode: TimestampMode,
): Promise<{ chunks: TranscriptChunk[]; text: string }> {
  const windows = planWindows(req.audio.length / WHISPER_SAMPLE_RATE);
  const chunks: TranscriptChunk[] = [];
  for (const [i, w] of windows.entries()) {
    const samples = req.audio.subarray(
      Math.floor(w.start * WHISPER_SAMPLE_RATE),
      Math.ceil(w.end * WHISPER_SAMPLE_RATE),
    );
    if (!isSilent(samples)) {
      const raw = await pipe(samples, {
        language: req.language,
        task: "transcribe",
        return_timestamps: mode === "word" ? "word" : true,
      });
      const result: AutomaticSpeechRecognitionOutput = Array.isArray(raw) ? raw[0] : raw;
      const relative = (result.chunks ?? [])
        .filter((c) => c.timestamp && c.text.trim())
        .map((c) => {
          const start = c.timestamp[0] ?? 0;
          return { text: c.text, start, end: c.timestamp[1] ?? start };
        });
      chunks.push(...placeWindowChunks(relative, w));
    }
    post({ type: "transcribe-progress", progress: (i + 1) / windows.length });
  }
  const text = chunks
    .map((c) => c.text)
    .join(mode === "word" ? "" : " ")
    .replace(/\s+/g, " ")
    .trim();
  return { chunks, text };
}

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  const req = event.data;
  if (req.type !== "transcribe") return;
  try {
    post({ type: "status", status: "loading-model" });
    const precision = await pickPrecision(req.modelId);

    // Word timestamps place each line far more precisely than whole segments,
    // but need an export with cross-attention outputs (the "_timestamped" repos).
    // If that model or its word timing is unavailable, fall back to segments.
    try {
      const pipe = await loadPipeline(`${req.modelId}_timestamped`, precision);
      post({ type: "status", status: "transcribing" });
      const out = await transcribe(pipe, req, "word");
      await pipe.dispose();
      post({ type: "result", ...out, mode: "word" });
      return;
    } catch (err) {
      console.warn("Word timestamps unavailable, using segments:", err);
    }

    post({ type: "status", status: "loading-model" });
    const pipe = await loadPipeline(req.modelId, precision);
    post({ type: "status", status: "transcribing" });
    const out = await transcribe(pipe, req, "segment");
    await pipe.dispose();
    post({ type: "result", ...out, mode: "segment" });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
