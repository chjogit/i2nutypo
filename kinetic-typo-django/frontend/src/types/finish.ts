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
  | "dust";

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
}
