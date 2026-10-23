import { istftStereo, stftStereo } from "./stft";

// Vocal separation with an MDX-Net model (UVR's Kim Vocal 2): the song is cut
// into overlapping chunks, each chunk's spectrogram goes through the model,
// and the predicted vocal spectrogram is turned back into sound. Chunk edges
// are trimmed, so every kept sample was predicted with context on both sides.

export interface MdxConfig {
  nFft: number;
  hop: number;
  /** Frequency bins the model sees (the rest are treated as silent). */
  dimF: number;
  /** Frames per chunk. */
  dimT: number;
  /** Level correction the model was tuned with. */
  compensate: number;
}

/** Kim Vocal 2 (MIT, from the Ultimate Vocal Remover project). */
export const KIM_VOCAL_2: MdxConfig = { nFft: 7680, hop: 1024, dimF: 3072, dimT: 256, compensate: 1.009 };

export const MDX_SAMPLE_RATE = 44100;

/** Runs the model on one chunk: input and output are [1, 4, dimF, dimT]. */
export type RunMdxModel = (spectrum: Float32Array) => Promise<Float32Array>;

export async function separateVocals(
  left: Float32Array,
  right: Float32Array,
  cfg: MdxConfig,
  run: RunMdxModel,
  onProgress?: (progress: number) => void,
): Promise<{ left: Float32Array; right: Float32Array }> {
  const n = left.length;
  const trim = cfg.nFft / 2;
  const chunk = cfg.hop * (cfg.dimT - 1);
  const gen = chunk - 2 * trim;
  const pad = gen - (n % gen);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const count = (n + pad) / gen;
  const segL = new Float32Array(chunk);
  const segR = new Float32Array(chunk);

  for (let c = 0; c < count; c++) {
    // Chunk c covers song samples [c·gen - trim, c·gen - trim + chunk), zero outside the song
    const from = c * gen - trim;
    for (let i = 0; i < chunk; i++) {
      const s = from + i;
      const inside = s >= 0 && s < n;
      segL[i] = inside ? left[s] : 0;
      segR[i] = inside ? right[s] : 0;
    }
    const spec = stftStereo(segL, segR, cfg.nFft, cfg.hop, cfg.dimF);
    const predicted = await run(spec.data);
    if (predicted.length !== spec.data.length) {
      throw new Error(`분리 모델 출력 크기가 다릅니다 (${predicted.length} ≠ ${spec.data.length})`);
    }
    const wave = istftStereo({ ...spec, data: predicted }, cfg.nFft, cfg.hop, chunk);
    const keep = Math.min(gen, n - c * gen);
    for (let i = 0; i < keep; i++) {
      outL[c * gen + i] = wave.left[trim + i] * cfg.compensate;
      outR[c * gen + i] = wave.right[trim + i] * cfg.compensate;
    }
    onProgress?.((c + 1) / count);
  }
  return { left: outL, right: outR };
}
