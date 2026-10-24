import { create } from "zustand";

/**
 * Per-browser workspace settings: which layout the editor uses, its contrast,
 * and the side columns' widths. Kept in localStorage, never in the project.
 */
export type LayoutPreset = "standard" | "preview" | "timeline";
export type Contrast = "normal" | "high" | "dim";
/** Short side of the preview canvas in pixels. */
export type PreviewQuality = 480 | 540 | 720 | 1080;
export const PREVIEW_QUALITIES: readonly PreviewQuality[] = [480, 540, 720, 1080];

interface LayoutStore {
  preset: LayoutPreset;
  contrast: Contrast;
  previewQuality: PreviewQuality;
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  paletteOpen: boolean;
  set: (patch: Partial<Omit<LayoutStore, "set" | "load">>) => void;
  load: () => void;
}

const KEY = "kinetic-typo-layout-v1";
export const LEFT_RANGE = [240, 560] as const;
export const RIGHT_RANGE = [260, 520] as const;
export const DEFAULT_LEFT = 300;
export const DEFAULT_RIGHT = 320;

const SAVED: Array<keyof LayoutStore> = [
  "preset",
  "contrast",
  "previewQuality",
  "leftWidth",
  "rightWidth",
  "leftOpen",
  "rightOpen",
];

export const useLayoutStore = create<LayoutStore>()((set, get) => ({
  preset: "standard",
  contrast: "normal",
  previewQuality: 720,
  leftWidth: DEFAULT_LEFT,
  rightWidth: DEFAULT_RIGHT,
  leftOpen: true,
  rightOpen: true,
  paletteOpen: false,
  set: (patch) => {
    set(patch);
    try {
      const s = get();
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(SAVED.map((k) => [k, s[k]]))));
    } catch {
      // Storage blocked: the layout lasts for this page only
    }
  },
  load: () => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<LayoutStore>;
      // The old width setting of the style column carries over
      const oldLeft = Number(localStorage.getItem("kinetic-typo-style-width"));
      const clamp = (v: unknown, [lo, hi]: readonly [number, number], d: number) =>
        typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
      set({
        preset: raw.preset === "preview" || raw.preset === "timeline" ? raw.preset : "standard",
        contrast: raw.contrast === "high" || raw.contrast === "dim" ? raw.contrast : "normal",
        previewQuality: PREVIEW_QUALITIES.includes(raw.previewQuality as PreviewQuality)
          ? (raw.previewQuality as PreviewQuality)
          : 720,
        leftWidth: clamp(raw.leftWidth ?? (oldLeft > 0 ? oldLeft : undefined), LEFT_RANGE, DEFAULT_LEFT),
        rightWidth: clamp(raw.rightWidth, RIGHT_RANGE, DEFAULT_RIGHT),
        leftOpen: raw.leftOpen !== false,
        rightOpen: raw.rightOpen !== false,
      });
    } catch {
      // Nothing saved or storage blocked
    }
  },
}));
