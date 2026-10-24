import type { BgVideoFilter, ColorFilter } from "@/types/project";
import type { LoadedImage } from "./looks/illustration";
import type { Ctx2D } from "./motifs";
import { applyColorFilter, COLOR_FILTERS } from "./looks/color-filter";

// A filter on the background video alone: brightness, contrast, saturation,
// hue, blur and a color tint, applied to each video frame before the theme
// draws it, so the lyrics, decorations and illustrations keep their colors.

export const NEUTRAL_BG_FILTER: BgVideoFilter = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
  blur: 0,
  tint: "none",
  tintAmount: 0.4,
};

/** Ready-made looks; each one replaces every setting. */
export const BG_FILTER_PRESETS: ReadonlyArray<{ id: string; label: string; filter: BgVideoFilter }> = [
  { id: "plain", label: "원본", filter: NEUTRAL_BG_FILTER },
  { id: "dim", label: "어둡게", filter: { ...NEUTRAL_BG_FILTER, brightness: 0.6 } },
  { id: "soft", label: "흐리게", filter: { ...NEUTRAL_BG_FILTER, brightness: 0.85, blur: 0.35 } },
  { id: "vivid", label: "선명하게", filter: { ...NEUTRAL_BG_FILTER, contrast: 1.25, saturate: 1.35 } },
  {
    id: "faded",
    label: "빛바랜",
    filter: {
      ...NEUTRAL_BG_FILTER,
      contrast: 0.85,
      saturate: 0.6,
      brightness: 1.05,
      tint: "yellow",
      tintAmount: 0.3,
    },
  },
  {
    id: "cold",
    label: "차갑게",
    filter: { ...NEUTRAL_BG_FILTER, saturate: 0.8, brightness: 0.9, tint: "blue", tintAmount: 0.35 },
  },
  { id: "mono", label: "모노톤", filter: { ...NEUTRAL_BG_FILTER, saturate: 0, contrast: 1.1 } },
];

/** Range of each number setting, with the value that leaves the video as it is. */
export const BG_FILTER_RANGES: Record<Exclude<keyof BgVideoFilter, "tint">, [number, number]> = {
  brightness: [0.2, 2],
  contrast: [0.2, 2],
  saturate: [0, 2],
  hue: [-180, 180],
  blur: [0, 1],
  tintAmount: [0, 1],
};

export function sanitizeBgFilter(saved: unknown): BgVideoFilter {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const out: BgVideoFilter = { ...NEUTRAL_BG_FILTER };
  for (const [k, [lo, hi]] of Object.entries(BG_FILTER_RANGES) as Array<
    [keyof typeof BG_FILTER_RANGES, [number, number]]
  >) {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  }
  if (COLOR_FILTERS.some((f) => f.kind === s.tint)) out.tint = s.tint as ColorFilter["kind"];
  return out;
}

/** True when the filter changes nothing, so the frame can be used as it is. */
export const isNeutralBgFilter = (f: BgVideoFilter | undefined): boolean =>
  !f ||
  (f.brightness === 1 &&
    f.contrast === 1 &&
    f.saturate === 1 &&
    f.hue === 0 &&
    f.blur <= 0 &&
    (f.tint === "none" || f.tintAmount <= 0));

/** Blur radius in pixels for a frame of the given height: at most 2% of it. */
export const bgBlurPx = (f: BgVideoFilter, height: number): number => f.blur * height * 0.02;

/** The CSS filter string for the number settings, "none" when they change nothing. */
export function cssBgFilter(f: BgVideoFilter, height: number): string {
  const parts: string[] = [];
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturate !== 1) parts.push(`saturate(${f.saturate})`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  const blur = bgBlurPx(f, height);
  if (blur > 0.2) parts.push(`blur(${blur.toFixed(1)}px)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

type Scratch = OffscreenCanvas | HTMLCanvasElement;
/** One canvas for the preview and one for the export, which can run at the same time. */
const scratches = new Map<string, Scratch>();

function scratchOf(slot: string, w: number, h: number): Scratch | null {
  let s = scratches.get(slot) ?? null;
  if (!s) {
    if (typeof OffscreenCanvas !== "undefined") s = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") s = document.createElement("canvas");
    else return null;
    scratches.set(slot, s);
  }
  if (s.width !== w) s.width = w;
  if (s.height !== h) s.height = h;
  return s;
}

/**
 * The background video frame with the filter applied, drawn on a canvas kept
 * for the slot ("preview" or "export"); the frame itself when the filter does
 * nothing or no canvas is available.
 */
export function filterBackground(img: LoadedImage, f: BgVideoFilter | undefined, slot: string): LoadedImage {
  if (!f || isNeutralBgFilter(f) || img.width <= 0 || img.height <= 0) return img;
  const w = Math.round(img.width);
  const h = Math.round(img.height);
  const s = scratchOf(slot, w, h);
  const ctx = s?.getContext("2d") as Ctx2D | null | undefined;
  if (!s || !ctx) return img;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  (ctx as CanvasRenderingContext2D).filter = cssBgFilter(f, h);
  // Blur pulls in see-through pixels at the edges, so the frame is drawn a little larger
  const pad = bgBlurPx(f, h) * 2;
  ctx.drawImage(img.source, -pad, -pad, w + pad * 2, h + pad * 2);
  (ctx as CanvasRenderingContext2D).filter = "none";
  ctx.restore();
  if (f.tint !== "none" && f.tintAmount > 0) applyColorFilter(ctx, { kind: f.tint, amount: f.tintAmount });
  return { source: s, width: w, height: h };
}
