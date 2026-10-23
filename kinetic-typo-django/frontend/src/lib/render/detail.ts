import type { DetailSettings, LyricLine } from "@/types/project";
import { hashSigned } from "./looks/noise";

export const DEFAULT_DETAIL: DetailSettings = {
  glitch: 0.5,
  shake: 0.3,
  lyricX: 0,
  lyricY: 0,
  subtitleX: 0,
  subtitleY: 0,
};

/** Glitch multiplier: 1 at the default, 0..2 across the slider. */
export const glitchGain = (d: DetailSettings): number => d.glitch / DEFAULT_DETAIL.glitch;

/** Shake multiplier for each look's own motion: 1 at the default. */
export const shakeGain = (d: DetailSettings): number => d.shake / DEFAULT_DETAIL.shake;

/** Extra whole-frame jolt on the beat, only once shake is raised above its default. */
export function frameShake(
  d: DetailSettings,
  energy: number,
  timeSec: number,
  W: number,
  H: number,
): { x: number; y: number } {
  const extra = Math.max(0, d.shake - DEFAULT_DETAIL.shake) / (1 - DEFAULT_DETAIL.shake);
  if (extra <= 0 || energy <= 0.05) return { x: 0, y: 0 };
  const frame = Math.floor(timeSec * 30);
  const amp = Math.min(W, H) * 0.03 * extra * energy;
  return { x: hashSigned(frame, 11) * amp, y: hashSigned(frame, 12) * amp };
}

/** Where a line's lyrics move: the global shift plus the line's own offset. */
export function lyricOffset(
  d: DetailSettings,
  line: LyricLine | null,
  W: number,
  H: number,
): { x: number; y: number } {
  return { x: (d.lyricX + (line?.offsetX ?? 0)) * W, y: (d.lyricY + (line?.offsetY ?? 0)) * H };
}

/** Keeps saved detail values in range. */
export function sanitizeDetail(saved: unknown): DetailSettings {
  const out = { ...DEFAULT_DETAIL };
  if (!saved || typeof saved !== "object") return out;
  const rec = saved as Record<string, unknown>;
  const ranges: Record<keyof DetailSettings, [number, number]> = {
    glitch: [0, 1],
    shake: [0, 1],
    lyricX: [-0.5, 0.5],
    lyricY: [-0.5, 0.5],
    subtitleX: [-0.5, 0.5],
    subtitleY: [-0.5, 0.5],
  };
  for (const key of Object.keys(ranges) as Array<keyof DetailSettings>) {
    const v = rec[key];
    if (typeof v === "number" && Number.isFinite(v))
      out[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], v));
  }
  return out;
}
