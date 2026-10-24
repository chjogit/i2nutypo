import type { AspectRatio } from "@/types/project";

/** Logical drawing size of each aspect ratio; the renderer lays everything out in these units. */
export const CANVAS_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 960, height: 720 },
  "3:4": { width: 720, height: 960 },
  "4:5": { width: 720, height: 900 },
  "21:9": { width: 1680, height: 720 },
};

/** Pixel size of a canvas drawn at `shortSide` pixels on its short side, and its scale from the logical size. */
export function pixelSize(aspect: AspectRatio, shortSide: number) {
  const base = CANVAS_SIZE[aspect];
  const scale = shortSide / Math.min(base.width, base.height);
  return { width: Math.round(base.width * scale), height: Math.round(base.height * scale), scale, base };
}

/** The renderer's size for a preview canvas drawn at a finer pixel size (its data-lw / data-lh). */
export const logicalSize = (c: HTMLCanvasElement) => ({
  width: Number(c.dataset.lw) || c.width,
  height: Number(c.dataset.lh) || c.height,
});

/** Every aspect ratio, in the order the preview offers them. */
export const ASPECT_RATIOS = Object.keys(CANVAS_SIZE) as AspectRatio[];
