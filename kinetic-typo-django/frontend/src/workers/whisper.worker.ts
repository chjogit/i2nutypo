/// <reference lib="webworker" />
import {
  LogitsProcessor,
  LogitsProcessorList,
  pipeline,
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
  type PretrainedModelOptions,
  type Tensor,
} from "@huggingface/transformers";
import { runSeparation } from "@/lib/separation/run-separation";
import type { SeparateRequest, SeparateResponse } from "@/lib/separation/protocol";
import type { TranscriptChunk } from "@/lib/sync/align";
import { LyricBias } from "@/lib/sync/lyric-bias";
import { isSilent, placeWindowChunks, planVoicedWindows, planWindows } from "@/lib/sync/windows";
import {
  WHISPER_SAMPLE_RATE,
  type TimestampMode,
  type WhisperRequest,
  type WhisperResponse,
} from "@/lib/sync/whisper-protocol";

// Runs Whisper in the browser, one worker per job (terminated afterwards to
// free memory). Model files are downloaded once from the Hugging Face hub and
// cached by the browser; the audio itself never leaves the device. The same
// worker also separates the vocals from the song before recognition
// (lib/separation), sharing the ONNX runtime.

const post = (msg: WhisperResponse | SeparateResponse) => self.postMessage(msg);

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

/** Hands each row of next-token scores to the lyric bias. */
class LyricBiasProcessor extends LogitsProcessor {
  constructor(private readonly bias: LyricBias) {
    super();
  }

  _call(inputIds: bigint[][], logits: Tensor): Tensor {
    for (let i = 0; i < inputIds.length; i++) {
      this.bias.apply(inputIds[i], (logits as unknown as { data: Float32Array }[])[i].data);
    }
    return logits;
  }
}

function lyricBiasFor(pipe: AutomaticSpeechRecognitionPipeline, lyrics: readonly string[]): LyricBias | null {
  if (lyrics.length === 0) return null;
  const sequences: number[][] = [];
  for (const line of lyrics) {
    // A line can start a segment or follow a word, which tokenizes with or without a leading space
    for (const text of [line, ` ${line}`]) {
      sequences.push(pipe.tokenizer.encode(text, { add_special_tokens: false }));
    }
  }
  const config = pipe.model.generation_config as { eos_token_id?: number } | undefined;
  return new LyricBias(sequences, config?.eos_token_id ?? 50257);
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
  const windows = req.vocalsOnly
    ? planVoicedWindows(req.audio, WHISPER_SAMPLE_RATE)
    : planWindows(req.audio.length / WHISPER_SAMPLE_RATE);
  const bias = lyricBiasFor(pipe, req.lyrics ?? []);
  const chunks: TranscriptChunk[] = [];
  for (const [i, w] of windows.entries()) {
    const samples = req.audio.subarray(
      Math.floor(w.start * WHISPER_SAMPLE_RATE),
      Math.ceil(w.end * WHISPER_SAMPLE_RATE),
    );
    if (!isSilent(samples)) {
      // A new list per call: generate() appends its own processors to it
      const logitsProcessor = new LogitsProcessorList();
      if (bias) logitsProcessor.push(new LyricBiasProcessor(bias));
      const raw = await pipe(samples, {
        language: req.language,
        task: "transcribe",
        return_timestamps: mode === "word" ? "word" : true,
        logits_processor: logitsProcessor,
      } as Parameters<AutomaticSpeechRecognitionPipeline["_call"]>[1]);
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

self.onmessage = async (event: MessageEvent<WhisperRequest | SeparateRequest>) => {
  const req = event.data;
  if (req.type === "separate") {
    try {
      await runSeparation(req, post);
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
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
