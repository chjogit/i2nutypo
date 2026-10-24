import type {
  ColorWheel,
  FilmId,
  FilterId,
  FilterState,
  FinishSettings,
  GradeId,
  GradeMask,
} from "@/types/finish";
import { hashSigned } from "../looks/noise";

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
  wheels: { lift: { x: 0, y: 0, l: 0 }, gamma: { x: 0, y: 0, l: 0 }, gain: { x: 0, y: 0, l: 0 } },
  shadows: 0,
  highlights: 0,
  vibrance: 0,
  mask: { kind: "none", feather: 0.5, invert: false },
  film: "none",
  filmAmount: 0.8,
  push: 0,
  cmy: { c: 0, m: 0, y: 0 },
  toning: { shadows: 0, mids: 0, highs: 0 },
  compression: 0,
  weave: 0,
  breath: 0,
  grainSize: 1.3,
};

export interface FilmDef {
  id: Exclude<FilmId, "none">;
  label: string;
  hint: string;
}

export const FILMS: readonly FilmDef[] = [
  {
    id: "warmNegative",
    label: "따뜻한 컬러 네거티브",
    hint: "부드러운 대비, 살짝 초록빛 그림자와 따뜻한 하이라이트",
  },
  { id: "slide", label: "슬라이드 필름", hint: "진한 색과 깊은 검정, 차가운 그림자" },
  {
    id: "cinemaPrint",
    label: "극장 프린트",
    hint: "영화관 상영 프린트처럼 청록·주황이 갈리고 하이라이트가 부드럽게 눌림",
  },
  { id: "greenNegative", label: "초록 계열 네거티브", hint: "녹색이 깊고 차분한 일상 필름" },
  { id: "instant", label: "인스턴트 사진", hint: "들뜬 검정, 크림색 하이라이트, 바랜 색" },
  {
    id: "expired",
    label: "유통기한 지난 필름",
    hint: "크로스 현상처럼 색이 틀어진 노란 하이라이트와 자홍 그림자",
  },
  { id: "bwFast", label: "흑백 고감도", hint: "거칠고 부드러운 흑백" },
  { id: "bwFine", label: "흑백 저감도", hint: "또렷하고 대비가 센 흑백" },
];

/** One-click sets of grain, halation, bloom, gate weave, flicker and damage for a film gauge. */
export interface GaugeDef {
  id: "8" | "16" | "35" | "65";
  label: string;
  hint: string;
  grainSize: number;
  weave: number;
  breath: number;
  filters: Partial<Record<FilterId, number>>;
}

export const GAUGES: readonly GaugeDef[] = [
  {
    id: "8",
    label: "8mm",
    hint: "홈비디오처럼 굵은 입자, 크게 흔들리는 화면, 먼지와 필름 테두리",
    grainSize: 3,
    weave: 0.7,
    breath: 0.6,
    filters: { grain: 0.8, halation: 0.6, bloom: 0.4, dust: 0.6, vignette: 0.6, gate: 0.6 },
  },
  {
    id: "16",
    label: "16mm",
    hint: "다큐·뮤직비디오 느낌의 도드라진 입자와 약한 흔들림",
    grainSize: 2,
    weave: 0.4,
    breath: 0.4,
    filters: { grain: 0.55, halation: 0.5, bloom: 0.35, dust: 0.35, vignette: 0.45 },
  },
  {
    id: "35",
    label: "35mm",
    hint: "영화의 기본, 고운 입자와 은은한 번짐",
    grainSize: 1.3,
    weave: 0.15,
    breath: 0.2,
    filters: { grain: 0.35, halation: 0.4, bloom: 0.3, dust: 0.15, vignette: 0.3 },
  },
  {
    id: "65",
    label: "65mm",
    hint: "대형 필름, 아주 고운 입자에 거의 흔들림 없음",
    grainSize: 0.8,
    weave: 0.05,
    breath: 0.1,
    filters: { grain: 0.15, halation: 0.3, bloom: 0.25, vignette: 0.2 },
  },
];

const FILM_INDEX: Record<FilmId, number> = {
  none: 0,
  warmNegative: 1,
  slide: 2,
  cinemaPrint: 3,
  greenNegative: 4,
  instant: 5,
  expired: 6,
  bwFast: 7,
  bwFine: 8,
};

const MASK_INDEX: Record<GradeMask["kind"], number> = { none: 0, center: 1, top: 2, bottom: 3 };

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
  {
    id: "gate",
    label: "필름 테두리",
    hint: "필름 프레임의 둥근 테두리와 구멍(퍼포레이션)이 흘러감",
    initial: 0.6,
  },
  { id: "posterize", label: "포스터화", hint: "색 단계를 줄여 판화·포스터처럼", initial: 0.5 },
  { id: "pixelate", label: "픽셀화", hint: "화면 전체를 고전 게임처럼 굵은 픽셀로", initial: 0.3 },
  { id: "edges", label: "윤곽 발광", hint: "윤곽선이 빛나는 네온 스케치 느낌", initial: 0.5 },
  { id: "halftone", label: "망점", hint: "만화·신문 인쇄처럼 점으로 찍은 명암", initial: 0.5 },
  {
    id: "twoTone",
    label: "투톤",
    hint: "그림자 색과 하이라이트 색 두 가지로만 (스플릿 토닝 색 사용)",
    initial: 0.7,
  },
  { id: "kaleido", label: "만화경", hint: "화면을 거울처럼 대칭으로 접음", initial: 0.5 },
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
  const out: FinishSettings = structuredClone(DEFAULT_FINISH);
  out.filters = filters;
  out.grade = typeof r.grade === "string" && r.grade in GRADE_INDEX ? r.grade : "none";
  out.gradeAmount = clamp(r.gradeAmount, 0, 1, DEFAULT_FINISH.gradeAmount);
  out.shadowTint = isHex(r.shadowTint) ? r.shadowTint : DEFAULT_FINISH.shadowTint;
  out.highlightTint = isHex(r.highlightTint) ? r.highlightTint : DEFAULT_FINISH.highlightTint;
  for (const k of BASIC_KEYS) out[k] = clamp(r[k], -1, 1, 0);
  const wheel = (w: unknown): ColorWheel => {
    const o = (w && typeof w === "object" ? w : {}) as Partial<ColorWheel>;
    let x = clamp(o.x, -1, 1, 0);
    let y = clamp(o.y, -1, 1, 0);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, l: clamp(o.l, -1, 1, 0) };
  };
  const wheels = (r.wheels ?? {}) as Partial<FinishSettings["wheels"]>;
  out.wheels = { lift: wheel(wheels.lift), gamma: wheel(wheels.gamma), gain: wheel(wheels.gain) };
  out.shadows = clamp(r.shadows, -1, 1, 0);
  out.highlights = clamp(r.highlights, -1, 1, 0);
  out.vibrance = clamp(r.vibrance, -1, 1, 0);
  const mask = (r.mask ?? {}) as Partial<GradeMask>;
  out.mask = {
    kind: typeof mask.kind === "string" && mask.kind in MASK_INDEX ? mask.kind : "none",
    feather: clamp(mask.feather, 0, 1, 0.5),
    invert: mask.invert === true,
  };
  out.film = typeof r.film === "string" && r.film in FILM_INDEX ? r.film : "none";
  out.filmAmount = clamp(r.filmAmount, 0, 1, DEFAULT_FINISH.filmAmount);
  out.push = clamp(r.push, -1, 1, 0);
  const cmy = (r.cmy ?? {}) as Partial<FinishSettings["cmy"]>;
  out.cmy = { c: clamp(cmy.c, -1, 1, 0), m: clamp(cmy.m, -1, 1, 0), y: clamp(cmy.y, -1, 1, 0) };
  const ton = (r.toning ?? {}) as Partial<FinishSettings["toning"]>;
  out.toning = {
    shadows: clamp(ton.shadows, -1, 1, 0),
    mids: clamp(ton.mids, -1, 1, 0),
    highs: clamp(ton.highs, -1, 1, 0),
  };
  out.compression = clamp(r.compression, 0, 1, 0);
  out.weave = clamp(r.weave, 0, 1, 0);
  out.breath = clamp(r.breath, 0, 1, 0);
  out.grainSize = clamp(r.grainSize, 0.5, 4, DEFAULT_FINISH.grainSize);
  return out;
}

const wheelOff = (w: ColorWheel) => w.x !== 0 || w.y !== 0 || w.l !== 0;

/** True when the three-way correction, tone, film or printer lights change the picture. */
export function hasColorWork(f: FinishSettings): boolean {
  return (
    wheelOff(f.wheels.lift) ||
    wheelOff(f.wheels.gamma) ||
    wheelOff(f.wheels.gain) ||
    f.shadows !== 0 ||
    f.highlights !== 0 ||
    f.vibrance !== 0 ||
    (f.film !== "none" && f.filmAmount > 0) ||
    f.push !== 0 ||
    f.cmy.c !== 0 ||
    f.cmy.m !== 0 ||
    f.cmy.y !== 0 ||
    f.toning.shadows !== 0 ||
    f.toning.mids !== 0 ||
    f.toning.highs !== 0 ||
    f.compression > 0 ||
    f.weave > 0 ||
    f.breath > 0
  );
}

/** A wheel's hue push as an RGB offset (x toward red, y toward green-blue's split), length up to 1. */
export function wheelRgb(w: ColorWheel): [number, number, number] {
  return [w.x, -0.5 * w.x + 0.866 * w.y, -0.5 * w.x - 0.866 * w.y];
}

/** Lift (added in the shadows), gamma (midtone power) and gain (multiplier) per channel. */
export function wheelVectors(f: FinishSettings) {
  const [lr, lg, lb] = wheelRgb(f.wheels.lift);
  const [mr, mg, mb] = wheelRgb(f.wheels.gamma);
  const [hr, hg, hb] = wheelRgb(f.wheels.gain);
  const L = f.wheels.lift.l * 0.15;
  const M = f.wheels.gamma.l * 0.4;
  const G = f.wheels.gain.l * 0.4;
  return {
    lift: [L + lr * 0.1, L + lg * 0.1, L + lb * 0.1] as [number, number, number],
    gamma: [1 + M + mr * 0.3, 1 + M + mg * 0.3, 1 + M + mb * 0.3].map((v) => Math.max(0.2, v)) as [
      number,
      number,
      number,
    ],
    gain: [1 + G + hr * 0.25, 1 + G + hg * 0.25, 1 + G + hb * 0.25].map((v) => Math.max(0, v)) as [
      number,
      number,
      number,
    ],
  };
}

/**
 * Where the frame sits this frame as it sways through the gate (uv offset),
 * and the exposure flicker of film breath; both change 24 times a second.
 */
export function filmMotion(f: FinishSettings, timeSec: number): { weave: [number, number]; breath: number } {
  const frame = Math.floor(timeSec * 24);
  const sway = (k: number) => hashSigned(frame, k) * 0.5 + Math.sin(timeSec * (1.1 + k * 0.3)) * 0.5;
  return {
    weave: [sway(1) * f.weave * 0.003 || 0, sway(2) * f.weave * 0.005 || 0],
    breath: hashSigned(frame, 3) * f.breath * 0.06 || 0,
  };
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
  if (hasColorWork(f)) return false;
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
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  shadows: number;
  highlights: number;
  vibrance: number;
  mask: number;
  maskFeather: number;
  maskInvert: number;
  film: number;
  filmAmount: number;
  push: number;
  cmy: [number, number, number];
  toning: [number, number, number];
  compression: number;
  grainSize: number;
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
    ...wheelVectors(f),
    shadows: f.shadows,
    highlights: f.highlights,
    vibrance: f.vibrance,
    mask: MASK_INDEX[f.mask.kind],
    maskFeather: f.mask.feather,
    maskInvert: f.mask.invert ? 1 : 0,
    film: FILM_INDEX[f.film],
    filmAmount: f.film === "none" ? 0 : f.filmAmount,
    push: f.push,
    cmy: [f.cmy.c, f.cmy.m, f.cmy.y],
    toning: [f.toning.shadows, f.toning.mids, f.toning.highs],
    compression: f.compression,
    grainSize: f.grainSize,
  };
}
