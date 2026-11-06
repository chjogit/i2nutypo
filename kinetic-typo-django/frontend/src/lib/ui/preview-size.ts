/**
 * Display sizes of the preview and of its small floating copy. Only the CSS
 * size changes here; the canvas keeps drawing at the chosen preview quality,
 * so resizing never re-renders a frame.
 */

/** Tallest the preview may be drawn, in CSS px (the column width still caps it). */
export const PREVIEW_HEIGHT_RANGE = [200, 1600] as const;
export const DEFAULT_PREVIEW_HEIGHT = 480;
/** One arrow key press, and one with Shift held. */
export const PREVIEW_HEIGHT_STEP = 20;
export const PREVIEW_HEIGHT_BIG_STEP = 80;

/** Width of the small floating window, in CSS px. */
export const MINI_WIDTH_RANGE = [200, 720] as const;
/** The three steps the size button cycles through. */
export const MINI_PRESETS = [240, 360, 480] as const;
export const MINI_PRESET_LABELS = ["작게", "보통", "크게"] as const;
export const MINI_WIDTH_STEP = 20;
export const MINI_WIDTH_BIG_STEP = 80;

export const clampTo = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.round(Math.min(hi, Math.max(lo, v)));

/** A saved preview height, or the default when it is missing or broken. */
export function readPreviewHeight(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? clampTo(v, PREVIEW_HEIGHT_RANGE)
    : DEFAULT_PREVIEW_HEIGHT;
}

/**
 * A saved mini window width. Older saves kept a step index (0, 1, 2) instead
 * of a width, and those map to the matching step.
 */
export function readMiniWidth(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return MINI_PRESETS[0];
  if (Number.isInteger(v) && v >= 0 && v < MINI_PRESETS.length) return MINI_PRESETS[v];
  return clampTo(v, MINI_WIDTH_RANGE);
}

/** Index of the step nearest to a width, for the size button's label. */
export function nearestMiniPreset(width: number): number {
  let best = 0;
  MINI_PRESETS.forEach((p, i) => {
    if (Math.abs(p - width) < Math.abs(MINI_PRESETS[best] - width)) best = i;
  });
  return best;
}

/** The next step up from a width, wrapping back to the smallest. */
export function nextMiniPreset(width: number): number {
  return MINI_PRESETS.find((p) => p > width + 1) ?? MINI_PRESETS[0];
}

/**
 * The new value for a size handle's key press, or null when the key does not
 * resize. Arrow keys move one step (Shift: a big step), Home/End go to the ends.
 * `grow` lists the keys that make it larger.
 */
export function keyResize(
  key: string,
  shift: boolean,
  value: number,
  range: readonly [number, number],
  steps: { step: number; big: number },
  grow: readonly string[],
  shrink: readonly string[],
): number | null {
  const d = shift ? steps.big : steps.step;
  if (grow.includes(key)) return clampTo(value + d, range);
  if (shrink.includes(key)) return clampTo(value - d, range);
  if (key === "Home") return range[0];
  if (key === "End") return range[1];
  return null;
}
