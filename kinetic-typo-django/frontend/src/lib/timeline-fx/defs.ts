import type {
  AdjustClip,
  AdjustKind,
  ElementMotion,
  ElementMotionMode,
  TransitionClip,
  TransitionColor,
  TransitionKind,
} from "@/types/project";
import { newId, sortClips } from "@/lib/props/clips";

// Screen transitions and adjustment layers laid on the timeline, modeled on
// the transition / motion template packs of editing plugins: a library of
// named effects, a quick preview, and one click (or a drop) to place them.

export interface TransitionDef {
  id: TransitionKind;
  label: string;
  /** Group in the library. */
  group: "빛" | "카메라" | "도형" | "디지털";
  hint: string;
  /** Length a new one gets, in seconds. */
  len: number;
  /** Paints the frame with a color (picked per clip). */
  colored: boolean;
}

export const TRANSITIONS: readonly TransitionDef[] = [
  { id: "flash", label: "화이트 플래시", group: "빛", hint: "컷 순간 하얗게 번쩍", len: 0.4, colored: false },
  {
    id: "dip",
    label: "색으로 디졸브",
    group: "빛",
    hint: "고른 색으로 어두워졌다 밝아짐",
    len: 0.8,
    colored: true,
  },
  {
    id: "leak",
    label: "빛샘",
    group: "빛",
    hint: "따뜻한 필름 빛이 화면을 덮었다 걷힘",
    len: 1,
    colored: false,
  },
  { id: "blur", label: "흐림 전환", group: "빛", hint: "초점이 나갔다 돌아옴", len: 0.7, colored: false },
  {
    id: "zoom",
    label: "줌 펀치",
    group: "카메라",
    hint: "카메라가 확 들어갔다 나옴",
    len: 0.5,
    colored: false,
  },
  { id: "whip", label: "휩 팬", group: "카메라", hint: "옆으로 빠르게 휙 넘김", len: 0.45, colored: false },
  { id: "spin", label: "회전", group: "카메라", hint: "화면이 돌며 넘어감", len: 0.6, colored: false },
  {
    id: "slide",
    label: "밀어내기",
    group: "카메라",
    hint: "화면이 위로 밀려 올라감",
    len: 0.6,
    colored: false,
  },
  {
    id: "circle",
    label: "원형 닫힘",
    group: "도형",
    hint: "원이 좁혀져 덮였다 열림",
    len: 0.8,
    colored: true,
  },
  {
    id: "diagonal",
    label: "사선 와이프",
    group: "도형",
    hint: "사선 띠가 화면을 쓸고 지나감",
    len: 0.7,
    colored: true,
  },
  {
    id: "bars",
    label: "줄무늬 와이프",
    group: "도형",
    hint: "세로 띠가 차례로 덮었다 걷힘",
    len: 0.8,
    colored: true,
  },
  {
    id: "shutter",
    label: "블라인드",
    group: "도형",
    hint: "가로 블라인드가 닫혔다 열림",
    len: 0.7,
    colored: true,
  },
  {
    id: "ink",
    label: "잉크 번짐",
    group: "도형",
    hint: "잉크 방울이 번져 덮였다 걷힘",
    len: 1,
    colored: true,
  },
  {
    id: "glitch",
    label: "글리치",
    group: "디지털",
    hint: "가로 조각이 어긋나며 튐",
    len: 0.4,
    colored: false,
  },
  {
    id: "rgb",
    label: "RGB 분리",
    group: "디지털",
    hint: "빨강·파랑이 갈라졌다 모임",
    len: 0.4,
    colored: false,
  },
  {
    id: "pixel",
    label: "모자이크",
    group: "디지털",
    hint: "화면이 픽셀로 부서졌다 맞춰짐",
    len: 0.6,
    colored: false,
  },
];

export const TRANSITION_BY_ID = new Map(TRANSITIONS.map((t) => [t.id, t]));

export const TRANSITION_COLORS: ReadonlyArray<readonly [TransitionColor, string]> = [
  ["accent", "포인트색"],
  ["bg", "배경색"],
  ["white", "흰색"],
  ["black", "검정"],
];

export interface AdjustDef {
  id: AdjustKind;
  label: string;
  hint: string;
  initial: number;
}

export const ADJUSTS: readonly AdjustDef[] = [
  { id: "zoom", label: "천천히 줌 인", hint: "구간 동안 화면이 조금씩 다가옴", initial: 0.5 },
  { id: "shake", label: "카메라 흔들림", hint: "손으로 든 카메라처럼 떨림", initial: 0.4 },
  { id: "tilt", label: "기울이기", hint: "화면을 비스듬히 (더치 앵글)", initial: 0.4 },
  { id: "blur", label: "흐리게", hint: "화면 전체를 부드럽게 흐림", initial: 0.4 },
  { id: "invert", label: "색 반전", hint: "네거티브처럼 색을 뒤집음", initial: 1 },
  { id: "mono", label: "흑백", hint: "구간만 흑백으로", initial: 1 },
  { id: "bright", label: "밝게", hint: "노출을 올림 (음수 효과는 강도를 낮춰서)", initial: 0.4 },
  { id: "saturate", label: "진하게", hint: "색을 진하게", initial: 0.5 },
  { id: "hue", label: "색상 돌리기", hint: "색상환을 돌려 다른 색감으로", initial: 0.5 },
  { id: "rgb", label: "RGB 분리", hint: "빨강·파랑이 계속 어긋나 있음", initial: 0.4 },
  { id: "pixel", label: "모자이크", hint: "화면을 굵은 픽셀로", initial: 0.4 },
  { id: "mirror", label: "거울", hint: "왼쪽 반을 오른쪽에 비춤", initial: 1 },
  { id: "vhs", label: "VHS", hint: "비디오테이프처럼 줄이 흔들림", initial: 0.5 },
  { id: "beatFlash", label: "비트 번쩍", hint: "비트마다 화면이 번쩍", initial: 0.5 },
];

export const ADJUST_BY_ID = new Map(ADJUSTS.map((a) => [a.id, a]));

export const ELEMENT_MOTIONS: ReadonlyArray<readonly [ElementMotionMode, string, string]> = [
  ["still", "고정", "놓은 자리에 그대로"],
  ["drift", "떠다님", "천천히 둥실둥실 흘러다님"],
  ["hop", "자리 옮김", "줄이 바뀔 때마다 다른 자리로 미끄러져 이동"],
  ["draw", "그려짐", "줄마다 선을 긋듯 새로 그려지며 나타남"],
  ["organic", "모두 섞기", "떠다니며 자리를 옮기고, 옮길 때마다 새로 그려짐"],
];

export const DEFAULT_ELEMENT_MOTION: ElementMotion = { mode: "organic", amount: 0.5, marks: 0.6 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function sanitizeTransitions(raw: unknown): TransitionClip[] {
  if (!Array.isArray(raw)) return [];
  const out: TransitionClip[] = [];
  for (const r of raw as Array<Partial<TransitionClip>>) {
    if (!r || typeof r !== "object" || !TRANSITION_BY_ID.has(r.kind as TransitionKind)) continue;
    const start = num(r.start, 0, 1e5, NaN);
    const end = num(r.end, 0, 1e5, NaN);
    if (!(end > start)) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : newId("tr"),
      start,
      end,
      kind: r.kind as TransitionKind,
      color: TRANSITION_COLORS.some(([c]) => c === r.color) ? (r.color as TransitionColor) : "accent",
    });
  }
  return sortClips(out);
}

export function sanitizeAdjustClips(raw: unknown): AdjustClip[] {
  if (!Array.isArray(raw)) return [];
  const out: AdjustClip[] = [];
  for (const r of raw as Array<Partial<AdjustClip>>) {
    if (!r || typeof r !== "object" || !ADJUST_BY_ID.has(r.kind as AdjustKind)) continue;
    const start = num(r.start, 0, 1e5, NaN);
    const end = num(r.end, 0, 1e5, NaN);
    if (!(end > start)) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : newId("adj"),
      start,
      end,
      kind: r.kind as AdjustKind,
      amount: num(r.amount, 0, 1, 0.5),
      fade: num(r.fade, 0, 5, 0.3),
    });
  }
  return sortClips(out);
}

export function sanitizeElementMotion(raw: unknown): ElementMotion {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ElementMotion>;
  return {
    mode: ELEMENT_MOTIONS.some(([m]) => m === r.mode)
      ? (r.mode as ElementMotionMode)
      : DEFAULT_ELEMENT_MOTION.mode,
    amount: num(r.amount, 0, 1, DEFAULT_ELEMENT_MOTION.amount),
    marks: num(r.marks, 0, 1, DEFAULT_ELEMENT_MOTION.marks),
  };
}

/** A transition of `kind` centered on the cut at `at`, kept inside the song. */
export function makeTransition(kind: TransitionKind, at: number, duration: number): TransitionClip {
  const len = TRANSITION_BY_ID.get(kind)?.len ?? 0.6;
  const start = round2(clamp(at - len / 2, 0, Math.max(0, duration - len)));
  return { id: newId("tr"), start, end: round2(Math.min(duration, start + len)), kind, color: "accent" };
}

/** An adjustment layer of `kind` from `start` to `end`. */
export function makeAdjust(kind: AdjustKind, start: number, end: number): AdjustClip {
  return {
    id: newId("adj"),
    start: round2(start),
    end: round2(end),
    kind,
    amount: ADJUST_BY_ID.get(kind)?.initial ?? 0.5,
    fade: 0.3,
  };
}

/**
 * Transitions on every cut in `cuts` (seconds), skipping cuts that already
 * have one; transitions never overlap, so a cut too close to a neighbor is skipped too.
 */
export function transitionsAtCuts(
  existing: readonly TransitionClip[],
  cuts: readonly number[],
  kinds: readonly TransitionKind[],
  duration: number,
): TransitionClip[] {
  const out = [...existing];
  let k = 0;
  for (const at of cuts) {
    if (at <= 0.05 || at >= duration - 0.05) continue;
    const made = makeTransition(kinds[k % kinds.length], at, duration);
    if (out.some((o) => made.start < o.end && made.end > o.start)) continue;
    out.push(made);
    k++;
  }
  return sortClips(out);
}

/** Where a transition is, 0..1 through it, and how much it covers: 0 at the ends, 1 at the cut. */
export function transitionPhase(c: TransitionClip, t: number): { p: number; cover: number } | null {
  if (t < c.start || t >= c.end) return null;
  const p = (t - c.start) / Math.max(0.01, c.end - c.start);
  return { p, cover: 1 - Math.abs(2 * p - 1) };
}

/** Strength of an adjustment layer at t: its amount, faded in and out over `fade` seconds. */
export function adjustStrength(c: AdjustClip, t: number): number {
  if (t < c.start || t >= c.end) return 0;
  const half = (c.end - c.start) / 2;
  const f = Math.min(c.fade, half);
  const k = f <= 0 ? 1 : Math.min(1, (t - c.start) / f, (c.end - t) / f);
  return c.amount * clamp(k, 0, 1);
}
