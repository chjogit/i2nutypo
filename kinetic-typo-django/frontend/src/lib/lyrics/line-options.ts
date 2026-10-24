import type { LineStyle } from "@/types/project";

// Per-line settings stored inside a line's time bracket after the times, as
// ";key=value" pairs: [00:06.00~00:09.50;x=0.10;y=-0.20;glitch=0.80].
// Unknown keys are ignored, so older or newer lyrics text still parses.

/** Largest position offset of a line, as a share of the frame; 0 is the usual place. */
export const MAX_LINE_OFFSET = 0.45;
export const MIN_LINE_SIZE = 0.5;
export const MAX_LINE_SIZE = 2;
export const MIN_BOX_WIDTH = 0.3;
export const MAX_BOX_WIDTH = 1.6;
export const MIN_BOX_HEIGHT = 0.5;
export const MAX_BOX_HEIGHT = 2;

export interface LineOptions {
  offsetX: number;
  offsetY: number;
  lineStyle: LineStyle;
  /** When each word or character appears, as a share of the line's length (";t=0,0.2,0.45"). */
  timing?: number[];
}

/** A timing list kept between 0 and 1 and never going back in time, or undefined when empty. */
export function sanitizeTiming(list: readonly unknown[] | undefined): number[] | undefined {
  if (!list || list.length === 0) return undefined;
  let last = 0;
  const out: number[] = [];
  for (const v of list) {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    last = Math.max(last, clamp(n, 0, 1));
    out.push(last);
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keys of LineStyle with their allowed range. */
const STYLE_RANGES: Record<keyof LineStyle, [number, number]> = {
  glitch: [0, 1],
  shake: [0, 1],
  size: [MIN_LINE_SIZE, MAX_LINE_SIZE],
  width: [MIN_BOX_WIDTH, MAX_BOX_WIDTH],
  height: [MIN_BOX_HEIGHT, MAX_BOX_HEIGHT],
  lock: [0, 1],
  flash: [0, 1],
  motion: [0, 99],
};
const STYLE_KEYS = Object.keys(STYLE_RANGES) as Array<keyof LineStyle>;

export function parseLineOptions(raw: string | undefined): LineOptions {
  const out: LineOptions = { offsetX: 0, offsetY: 0, lineStyle: {} };
  if (!raw) return out;
  for (const pair of raw.split(";")) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (key === "t" && value) {
      out.timing = sanitizeTiming(value.split(","));
      continue;
    }
    const n = Number(value);
    if (!key || value === undefined || !Number.isFinite(n)) continue;
    if (key === "x") out.offsetX = clamp(n, -MAX_LINE_OFFSET, MAX_LINE_OFFSET);
    else if (key === "y") out.offsetY = clamp(n, -MAX_LINE_OFFSET, MAX_LINE_OFFSET);
    else if ((STYLE_KEYS as string[]).includes(key)) {
      const k = key as keyof LineStyle;
      out.lineStyle[k] = clamp(n, ...STYLE_RANGES[k]);
    }
  }
  return out;
}

/** The ";key=value" tail for a line, or "" when it has nothing of its own. */
export function formatLineOptions({ offsetX, offsetY, lineStyle, timing }: LineOptions): string {
  const parts: string[] = [];
  if (Math.abs(offsetX) >= 0.005) parts.push(`x=${offsetX.toFixed(2)}`);
  if (Math.abs(offsetY) >= 0.005) parts.push(`y=${offsetY.toFixed(2)}`);
  for (const k of STYLE_KEYS) {
    const v = lineStyle[k];
    if (v !== undefined) parts.push(`${k}=${v.toFixed(2)}`);
  }
  if (timing && timing.length > 0) parts.push(`t=${timing.map((v) => Number(v.toFixed(3))).join(",")}`);
  return parts.map((p) => `;${p}`).join("");
}
