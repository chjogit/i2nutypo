import type { AmbientParticles, DirectionId, MotionCurveId, TransitionKind } from "@/types/project";
import type { FilterId } from "@/types/finish";

// Two ways to direct a lyric video, and a mix of them by section:
//  서정 연출 (calm): slow 2.5D parallax, glow and light leaks, floating dust,
//    soft transitions at section changes; suits slow and mid tempos.
//  타격 연출 (impact): every kick pumps the picture 105–110 %, shakes it and
//    splits its colors, graphic frames and speed lines fill the space, and
//    zoom and glitch cuts land on the bars; suits fast songs and shorts.
//  섞기 (hybrid): calm through verses and build-ups, impact in each chorus.
// Applying a direction only adds clips marked as its own (DIRECTION_ID_PREFIX),
// so applying another one replaces them and leaves the user's own clips alone.

export const DIRECTION_ID_PREFIX = "dir-";

export const DIRECTIONS: readonly { id: Exclude<DirectionId, "none">; label: string; hint: string }[] = [
  {
    id: "calm",
    label: "서정 연출",
    hint: "느린 2.5D 카메라, 빛 번짐·빛샘, 떠다니는 먼지, 부드러운 전환. 발라드·어쿠스틱·시티팝처럼 느리거나 중간 빠르기 곡에",
  },
  {
    id: "impact",
    label: "타격 연출",
    hint: "킥마다 화면 확대 펌핑·흔들림·RGB 분리, UI 프레임·집중선·망점, 마디마다 줌·글리치 컷. 빠른 록·EDM·숏폼 훅에",
  },
  {
    id: "hybrid",
    label: "섞기 (절은 서정, 후렴은 타격)",
    hint: "절과 빌드업은 서정 연출로 쌓고, 후렴 구간마다 타격 연출로 터뜨립니다. 구간은 타임라인의 구간 줄을 따릅니다",
  },
];

export const directionLabel = (id: DirectionId): string =>
  DIRECTIONS.find((d) => d.id === id)?.label ?? "없음";

/** BPM at or under this suits the calm direction; at or over IMPACT_BPM the impact one. */
export const CALM_BPM = 130;
export const IMPACT_BPM = 140;

export interface DirectionAdvice {
  id: Exclude<DirectionId, "none">;
  /** Plain-language reason shown to the user. */
  reason: string;
}

/** The direction the song's tempo suggests (bpm null when no beats were found yet). */
export function recommendDirection(bpm: number | null, hasChorus: boolean): DirectionAdvice {
  if (!bpm || !Number.isFinite(bpm) || bpm <= 0)
    return {
      id: "hybrid",
      reason: "아직 비트를 분석하지 않아 빠르기를 몰라요. 절은 서정, 후렴은 타격으로 섞는 것을 추천해요.",
    };
  const b = Math.round(bpm);
  if (b <= CALM_BPM)
    return { id: "calm", reason: `약 ${b} BPM의 느리거나 중간 빠르기 곡이라 서정 연출을 추천해요.` };
  if (b >= IMPACT_BPM) return { id: "impact", reason: `약 ${b} BPM의 빠른 곡이라 타격 연출을 추천해요.` };
  return hasChorus
    ? { id: "hybrid", reason: `약 ${b} BPM으로 중간 빠르기라 절은 서정, 후렴은 타격으로 섞는 것을 추천해요.` }
    : { id: "calm", reason: `약 ${b} BPM으로 중간 빠르기라 서정 연출을 추천해요.` };
}

export interface DirectionPlan {
  parallax: number;
  ambient: AmbientParticles;
  motionCurve: MotionCurveId;
  /** Finish filters turned on at these amounts. */
  filters: Partial<Record<FilterId, number>>;
  /** Finish filters the other direction turns on, turned off here. */
  filtersOff: FilterId[];
  /** Beat impact layers (with the graphic layer) over these spans. */
  impact: { start: number; end: number }[];
  /** Strength of those layers and of their graphics. */
  impactAmount: number;
  graphics: number;
  /** Transitions: where, and which kinds in turn. */
  cuts: number[];
  cutKinds: TransitionKind[];
}

export interface DirectionInput {
  duration: number;
  /** Chorus spans from the section lane. */
  choruses: readonly { start: number; end: number }[];
  /** Starts of every section after the first. */
  sectionStarts: readonly number[];
  /** Bar starts from the beats, or null without beats. */
  bars: readonly number[] | null;
  /** Starts of the main lyric lines. */
  lineStarts: readonly number[];
}

const CALM_LOOK = {
  parallax: 0.6,
  ambient: { kind: "dust", amount: 0.5, color: "secondary" } as AmbientParticles,
  motionCurve: "smooth" as MotionCurveId,
  filters: { bloom: 0.35, lightLeak: 0.3, halation: 0.25, grain: 0.15 } as Partial<Record<FilterId, number>>,
};

/** Every other item, so cuts do not land on every bar or line. */
const everyOther = (xs: readonly number[]) => xs.filter((_, i) => i % 2 === 0);

export function planDirection(id: Exclude<DirectionId, "none">, input: DirectionInput): DirectionPlan {
  const { duration, choruses, sectionStarts, bars, lineStarts } = input;
  if (id === "calm")
    return {
      ...CALM_LOOK,
      filtersOff: ["chromatic", "halftone"],
      impact: [],
      impactAmount: 0,
      graphics: 0,
      cuts: [...sectionStarts],
      cutKinds: ["blur", "leak", "dip"],
    };
  if (id === "impact")
    return {
      parallax: 0.15,
      ambient: { kind: "cyber", amount: 0.4, color: "accent" },
      motionCurve: "snappy",
      filters: { chromatic: 0.3, grain: 0.25, bloom: 0.2 },
      filtersOff: ["lightLeak", "mist"],
      impact: duration > 0 ? [{ start: 0, end: duration }] : [],
      impactAmount: 0.6,
      graphics: 0.5,
      cuts: bars ? everyOther(bars) : everyOther(lineStarts.slice(1)),
      cutKinds: ["zoom", "glitch", "rgb", "whip"],
    };
  // Hybrid: the calm look everywhere, the impact layers and hard cuts on the choruses only
  return {
    ...CALM_LOOK,
    filters: { ...CALM_LOOK.filters, chromatic: 0.15 },
    filtersOff: ["halftone"],
    impact: choruses.map((c) => ({ start: c.start, end: c.end })),
    impactAmount: 0.6,
    graphics: 0.45,
    cuts: [...new Set([...sectionStarts, ...choruses.map((c) => c.start)])].sort((a, b) => a - b),
    cutKinds: ["zoom", "blur", "glitch", "leak"],
  };
}
