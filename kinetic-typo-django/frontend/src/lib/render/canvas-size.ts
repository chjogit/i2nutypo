import type { AspectRatio } from "@/types/project";

/** Logical drawing size of each aspect ratio; the renderer lays everything out in these units. */
export const CANVAS_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
};
