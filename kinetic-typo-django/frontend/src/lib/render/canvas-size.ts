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

/** Every aspect ratio, in the order the preview offers them. */
export const ASPECT_RATIOS = Object.keys(CANVAS_SIZE) as AspectRatio[];
