/** Final-look pass drawn over the whole frame: one color grade, basic correction and stacked filters. */

export type GradeId = "none" | "tealOrange" | "bleachBypass" | "filmFade" | "splitTone" | "noir";

export type FilterId =
  | "vignette"
  | "grain"
  | "bloom"
  | "halation"
  | "chromatic"
  | "lightLeak"
  | "mist"
  | "sharpen"
  | "scanlines"
  | "dust"
  | "posterize"
  | "pixelate"
  | "edges"
  | "halftone"
  | "twoTone"
  | "kaleido"
  | "gate";

/** Film stock emulation (generic stocks, no brand look-alikes named). */
export type FilmId =
  | "none"
  | "warmNegative"
  | "slide"
  | "cinemaPrint"
  | "greenNegative"
  | "instant"
  | "expired"
  | "bwFast"
  | "bwFine";

/** One color wheel: a push toward a hue (x, y in the unit disk) and a brightness offset l, each -1..1. */
export interface ColorWheel {
  x: number;
  y: number;
  l: number;
}

/** Where the color correction applies: everywhere, inside an oval, or the top or bottom of the frame. */
export interface GradeMask {
  kind: "none" | "center" | "top" | "bottom";
  /** 0..1 softness of the edge. */
  feather: number;
  /** Applies outside the shape instead. */
  invert: boolean;
}

export interface FilterState {
  on: boolean;
  /** 0..1 */
  amount: number;
}

export interface FinishSettings {
  grade: GradeId;
  /** 0..1, how far the grade is mixed in. */
  gradeAmount: number;
  /** Split toning colors ("#rrggbb"). */
  shadowTint: string;
  highlightTint: string;
  /** Basic correction, each -1..1 with 0 leaving the picture as it is. */
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  /** Missing filters are off. */
  filters: Partial<Record<FilterId, FilterState>>;
  /** Three-way color correction: shadows (lift), midtones (gamma), highlights (gain). */
  wheels: { lift: ColorWheel; gamma: ColorWheel; gain: ColorWheel };
  /** Tone and color, each -1..1. */
  shadows: number;
  highlights: number;
  vibrance: number;
  mask: GradeMask;
  /** Film stock, how much of it, and push (+) or pull (-) processing, -1..1. */
  film: FilmId;
  filmAmount: number;
  push: number;
  /** Printer light filters (cyan, magenta, yellow), -1..1. */
  cmy: { c: number; m: number; y: number };
  /** Cool (-) to warm (+) per tonal range, -1..1. */
  toning: { shadows: number; mids: number; highs: number };
  /** Film-like highlight roll-off, 0..1. */
  compression: number;
  /** Frame sway through the gate and frame-to-frame exposure flicker, 0..1. */
  weave: number;
  breath: number;
  /** Grain size in pixels (8 mm coarse ≈ 3, 65 mm fine ≈ 0.8). */
  grainSize: number;
}
