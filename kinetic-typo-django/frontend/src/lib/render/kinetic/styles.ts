import type {
  KineticBackground,
  KineticReveal,
  MotionCurveId,
  MotionStyleId,
  StyleSettings,
} from "@/types/project";
import { cubicBezier, DEFAULT_SPRING, SNAPPY_SPRING, type SpringConfig } from "./easing";

// The four motion styles: how the lyrics move and are set, apart from their
// colors. Every style paints with the user's palette (color.ts); switching
// style changes motion, type setting and camera only.

export interface MotionStyleDef {
  id: Exclude<MotionStyleId, "theme">;
  label: string;
  hint: string;
  /** What is split and staggered: each character or each word. */
  unit: "char" | "word";
  /** Seconds between neighbours (0.025–0.04). */
  stagger: number;
  /** Seconds one piece takes to come in. */
  inDur: number;
  /** Where a piece starts, in px at 1080p (y), as a scale, in degrees and in px of blur. */
  from: { y: number; scale: number; rot: number; blur: number };
  /** Scale and turn settle on this spring; position, blur and fade on the expo curve. */
  spring: SpringConfig;
  /** Seconds the fade-in takes (shorter than inDur: the piece is solid before it stops). */
  fade: number;
  /** Pieces rise from under an invisible floor (clipped at the row's baseline). */
  mask: boolean;
  /** Backlight glow in the point color: share of the type size as blur, 0 for none. */
  glow: number;
  /** Soft drop shadow from the deep background color: blur as a share of size, 0 for none. */
  shadow: number;
  /** Marked words: point color, a pill box in the point color, or a hard inverted block. */
  accent: "color" | "pill" | "invert";
  /** Size as a share of the short side, for normal and big lines; weight. */
  size: [number, number];
  weight: number;
  /** Letter spacing in em for spaced (Latin, Hangul) and unspaced (Japanese) text, negative = tighter. */
  tracking: number;
  /** Row height as a multiple of the type size. */
  leading: number;
  align: "center" | "left";
  /** Camera: slow zoom between 1 and 1 + drift, its period in seconds, and the punch on hits. */
  camera: { drift: number; period: number; punch: number; punchOnLine: boolean };
  /** Entrance curve for position, blur and fade, when a curve choice replaces the expo-out. */
  ease?: (x: number) => number;
}

export const MOTION_STYLES: readonly MotionStyleDef[] = [
  {
    id: "smooth_reveal",
    label: "스무스 리빌",
    hint: "글자가 보이지 않는 바닥에서 솟아오르며 흐림이 걷히고, 포인트 색 빛이 뒤에서 은은하게",
    unit: "char",
    stagger: 0.03,
    inDur: 0.75,
    from: { y: 40, scale: 0.85, rot: 3, blur: 8 },
    spring: DEFAULT_SPRING,
    fade: 0.28,
    mask: true,
    glow: 0.42,
    shadow: 0,
    accent: "color",
    size: [0.1, 0.13],
    weight: 700,
    tracking: -0.04,
    leading: 1.15,
    align: "center",
    camera: { drift: 0.04, period: 14, punch: 0.03, punchOnLine: false },
  },
  {
    id: "hype_pop",
    label: "하이프 팝인",
    hint: "단어마다 크게 튀어나왔다 자리 잡고, 강조 단어는 반전 색 상자, 화면이 박자에 맞춰 튕김",
    unit: "word",
    stagger: 0.04,
    inDur: 0.42,
    from: { y: 40, scale: 1.25, rot: 3, blur: 8 },
    spring: SNAPPY_SPRING,
    fade: 0.06,
    mask: false,
    glow: 0,
    shadow: 0.06,
    accent: "invert",
    size: [0.12, 0.155],
    weight: 900,
    tracking: -0.05,
    leading: 1.1,
    align: "center",
    camera: { drift: 0.03, period: 9, punch: 0.08, punchOnLine: true },
  },
  {
    id: "editorial_blur",
    label: "에디토리얼 블러",
    hint: "글자마다 초점이 스르륵 맞고, 화면은 천천히 다가가는 미니멀한 조판",
    unit: "char",
    stagger: 0.035,
    inDur: 1.05,
    from: { y: 14, scale: 0.94, rot: 1, blur: 16 },
    spring: { stiffness: 170, damping: 26, mass: 1 },
    fade: 0.55,
    mask: false,
    glow: 0,
    shadow: 0,
    accent: "color",
    size: [0.088, 0.112],
    weight: 500,
    tracking: -0.03,
    leading: 1.2,
    align: "left",
    camera: { drift: 0.06, period: 22, punch: 0, punchOnLine: false },
  },
  {
    id: "highlight_box",
    label: "키네틱 하이라이트 박스",
    hint: "강조 단어 뒤로 포인트 색 상자가 먼저 펼쳐지고, 대비를 맞춘 글자가 튀어나옴",
    unit: "word",
    stagger: 0.035,
    inDur: 0.6,
    from: { y: 40, scale: 0.85, rot: 3, blur: 8 },
    spring: DEFAULT_SPRING,
    fade: 0.16,
    mask: true,
    glow: 0,
    shadow: 0.08,
    accent: "pill",
    size: [0.104, 0.135],
    weight: 800,
    tracking: -0.04,
    leading: 1.15,
    align: "center",
    camera: { drift: 0.035, period: 12, punch: 0.05, punchOnLine: false },
  },
];

export const MOTION_STYLE_IDS: readonly MotionStyleId[] = ["theme", ...MOTION_STYLES.map((s) => s.id)];

const BY_ID = new Map(MOTION_STYLES.map((s) => [s.id, s]));

/** Elastic ease-out: rings a few times around 1 and settles. */
const elasticOut = (x: number): number => {
  const p = Math.min(1, Math.max(0, x));
  if (p === 0 || p === 1) return p;
  return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/** What each curve choice changes: the entrance curve, the spring, and how long the entrance takes. */
const CURVES: Record<
  Exclude<MotionCurveId, "style">,
  { ease: (x: number) => number; spring: SpringConfig; dur: number }
> = {
  smooth: { ease: cubicBezier(0.22, 1, 0.36, 1), spring: { stiffness: 120, damping: 24, mass: 1 }, dur: 1.3 },
  snappy: { ease: cubicBezier(0.05, 0.9, 0.1, 1), spring: SNAPPY_SPRING, dur: 0.7 },
  bouncy: {
    ease: cubicBezier(0.34, 1.56, 0.64, 1),
    spring: { stiffness: 260, damping: 11, mass: 1 },
    dur: 1,
  },
  elastic: { ease: elasticOut, spring: { stiffness: 320, damping: 7, mass: 1 }, dur: 1.4 },
  linear: {
    ease: (x) => Math.min(1, Math.max(0, x)),
    spring: { stiffness: 200, damping: 40, mass: 1 },
    dur: 1,
  },
};

const CURVED = new Map<string, MotionStyleDef>();

/** The motion style that draws the lyrics, or null when the theme draws them its own way. */
export function motionStyleOf(
  style: Pick<StyleSettings, "motionStyle" | "motionCurve">,
): MotionStyleDef | null {
  const id = style.motionStyle;
  if (!id || id === "theme") return null;
  const def = BY_ID.get(id) ?? null;
  const curve = style.motionCurve;
  if (!def || !curve || curve === "style" || !(curve in CURVES)) return def;
  const key = `${id}:${curve}`;
  let out = CURVED.get(key);
  if (!out) {
    const c = CURVES[curve];
    out = { ...def, ease: c.ease, spring: c.spring, inDur: def.inDur * c.dur };
    CURVED.set(key, out);
  }
  return out;
}

export const DEFAULT_MOTION_STYLE: MotionStyleId = "smooth_reveal";

export function sanitizeMotionStyle(raw: unknown): MotionStyleId {
  return MOTION_STYLE_IDS.includes(raw as MotionStyleId) ? (raw as MotionStyleId) : DEFAULT_MOTION_STYLE;
}

export const KINETIC_BACKGROUNDS: readonly { id: KineticBackground; label: string; hint: string }[] = [
  { id: "theme", label: "테마 배경", hint: "고른 테마가 그리는 배경 그대로" },
  { id: "solid", label: "단색", hint: "배경색 한 가지" },
  { id: "spotlight", label: "스포트라이트", hint: "배경색을 밝힌 빛이 가운데에서 퍼짐" },
  { id: "aurora", label: "오로라", hint: "배경·포인트·보조 색에서 만든 빛 덩어리가 천천히 흐름" },
];

export function sanitizeKineticBg(raw: unknown): KineticBackground {
  return KINETIC_BACKGROUNDS.some((b) => b.id === raw) ? (raw as KineticBackground) : "theme";
}

export function sanitizeKineticReveal(raw: unknown): KineticReveal {
  return raw === "line" ? "line" : "sung";
}
