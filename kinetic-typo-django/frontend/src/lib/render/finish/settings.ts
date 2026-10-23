import type { FilterId, FilterState, FinishSettings, GradeId } from "@/types/finish";

export const BASIC_KEYS = ["exposure", "contrast", "saturation", "temperature", "tint"] as const;
export type BasicKey = (typeof BASIC_KEYS)[number];

export const DEFAULT_FINISH: FinishSettings = {
  grade: "none",
  gradeAmount: 0.7,
  shadowTint: "#1f5f8b",
  highlightTint: "#f2a65a",
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  filters: {},
};

export interface GradeDef {
  id: Exclude<GradeId, "none">;
  label: string;
  hint: string;
}

export const GRADES: readonly GradeDef[] = [
  { id: "tealOrange", label: "틸 & 오렌지", hint: "그림자는 청록, 밝은 곳과 피부는 주황. 영화 포스터 느낌" },
  { id: "bleachBypass", label: "블리치 바이패스", hint: "채도를 빼고 대비를 올린 거친 은빛 톤" },
  { id: "filmFade", label: "필름 페이드", hint: "검정을 띄운 매트한 필름 톤, 따뜻한 하이라이트" },
  { id: "splitTone", label: "스플릿 토닝", hint: "그림자와 하이라이트에 각각 다른 색을 입힘" },
  { id: "noir", label: "흑백 누아르", hint: "대비가 강한 흑백" },
];

export interface FilterDef {
  id: FilterId;
  label: string;
  hint: string;
  /** Amount a freshly switched-on filter starts at. */
  initial: number;
}

export const FILTERS: readonly FilterDef[] = [
  { id: "vignette", label: "비네팅", hint: "가장자리를 어둡게 해 시선을 가운데로", initial: 0.5 },
  { id: "grain", label: "필름 그레인", hint: "매 프레임 바뀌는 고운 입자", initial: 0.4 },
  { id: "bloom", label: "블룸", hint: "밝은 부분이 빛처럼 번짐", initial: 0.5 },
  { id: "halation", label: "할레이션", hint: "밝은 곳 둘레의 붉은 필름 번짐", initial: 0.5 },
  { id: "chromatic", label: "색수차", hint: "가장자리로 갈수록 빨강·파랑이 어긋남", initial: 0.4 },
  { id: "lightLeak", label: "빛샘", hint: "천천히 흐르는 따뜻한 빛 얼룩", initial: 0.5 },
  { id: "mist", label: "소프트 미스트", hint: "디퓨전 필터처럼 부드럽고 몽환적으로", initial: 0.5 },
  { id: "sharpen", label: "선명하게", hint: "윤곽을 또렷하게", initial: 0.4 },
  { id: "scanlines", label: "스캔라인", hint: "브라운관 같은 가로줄", initial: 0.4 },
  { id: "dust", label: "먼지·스크래치", hint: "오래된 필름의 먼지 점과 세로 긁힘", initial: 0.4 },
];

const GRADE_INDEX: Record<GradeId, number> = {
  none: 0,
  tealOrange: 1,
  bleachBypass: 2,
  filmFade: 3,
  splitTone: 4,
  noir: 5,
};

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Reads whatever was saved (or nothing) into complete, in-range settings. */
export function sanitizeFinish(raw: unknown): FinishSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<FinishSettings>;
  const filters: Partial<Record<FilterId, FilterState>> = {};
  for (const def of FILTERS) {
    const f = r.filters?.[def.id];
    if (f && typeof f === "object")
      filters[def.id] = { on: f.on === true, amount: clamp(f.amount, 0, 1, def.initial) };
  }
  const out: FinishSettings = {
    grade: typeof r.grade === "string" && r.grade in GRADE_INDEX ? r.grade : "none",
    gradeAmount: clamp(r.gradeAmount, 0, 1, DEFAULT_FINISH.gradeAmount),
    shadowTint: isHex(r.shadowTint) ? r.shadowTint : DEFAULT_FINISH.shadowTint,
    highlightTint: isHex(r.highlightTint) ? r.highlightTint : DEFAULT_FINISH.highlightTint,
    exposure: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    filters,
  };
  for (const k of BASIC_KEYS) out[k] = clamp(r[k], -1, 1, 0);
  return out;
}

/** Amount a filter is drawn at; 0 when off. */
export const filterAmount = (f: FinishSettings, id: FilterId) => {
  const s = f.filters[id];
  return s?.on ? s.amount : 0;
};

/** True when the pass would leave every pixel as it is, so it can be skipped. */
export function isNeutralFinish(f: FinishSettings): boolean {
  if (f.grade !== "none" && f.gradeAmount > 0) return false;
  if (BASIC_KEYS.some((k) => f[k] !== 0)) return false;
  return FILTERS.every((d) => filterAmount(f, d.id) === 0);
}

/** Filters that read the blurred copy of the frame. */
export const needsBlur = (f: FinishSettings) =>
  filterAmount(f, "bloom") > 0 || filterAmount(f, "halation") > 0 || filterAmount(f, "mist") > 0;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface FinishUniforms {
  grade: number;
  gradeAmount: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  basic: Record<BasicKey, number>;
  filters: Record<FilterId, number>;
}

/** Shader inputs for the settings, kept apart from WebGL so it can be tested. */
export function finishUniforms(f: FinishSettings): FinishUniforms {
  const filters = {} as Record<FilterId, number>;
  for (const d of FILTERS) filters[d.id] = filterAmount(f, d.id);
  return {
    grade: GRADE_INDEX[f.grade],
    gradeAmount: f.grade === "none" ? 0 : f.gradeAmount,
    shadowTint: hexToRgb(f.shadowTint),
    highlightTint: hexToRgb(f.highlightTint),
    basic: {
      exposure: f.exposure,
      contrast: f.contrast,
      saturation: f.saturation,
      temperature: f.temperature,
      tint: f.tint,
    },
    filters,
  };
}
