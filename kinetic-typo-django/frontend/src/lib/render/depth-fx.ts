import type { AmbientParticleKind, AmbientParticles, MotionCurveId } from "@/types/project";
import type { Ctx2D } from "./motifs";

// 2.5D parallax and the particle layer that any theme can carry. Both are
// pure functions of the song time, so the preview and every export agree.

/** How deep each part of the frame sits: far moves least, near moves most. */
export const PARALLAX_DEPTH = { back: 0.3, behind: 0.65, lyrics: 0.5, front: 1 } as const;
export type ParallaxLayer = keyof typeof PARALLAX_DEPTH;

/** Seconds of one slow sway across and up-down; long and unequal so the path never repeats visibly. */
const SWAY_X_SEC = 17;
const SWAY_Y_SEC = 23;
/** Share of the frame width the nearest layer travels at full strength. */
const TRAVEL = 0.035;

export interface ParallaxPose {
  dx: number;
  dy: number;
  scale: number;
}

/**
 * Where a layer at `depth` (0 far … 1 near) sits at timeSec under a camera
 * that sways slowly and breathes in. The layer is scaled up just enough that
 * its edges never show while it moves.
 */
export function parallaxPose(
  amount: number,
  depth: number,
  timeSec: number,
  W: number,
  H: number,
): ParallaxPose {
  const a = Math.min(1, Math.max(0, amount));
  if (a <= 0) return { dx: 0, dy: 0, scale: 1 };
  const k = a * depth;
  const sx = Math.sin((timeSec / SWAY_X_SEC) * Math.PI * 2);
  const sy = Math.sin((timeSec / SWAY_Y_SEC) * Math.PI * 2 + 1.3);
  const dx = sx * W * TRAVEL * k;
  const dy = sy * H * TRAVEL * 0.55 * k;
  // A slow push in, deeper layers closer to the lens grow more
  const push = 0.012 * k * (0.5 - 0.5 * Math.cos((timeSec / SWAY_Y_SEC) * Math.PI * 2));
  const cover = 1 + 2 * TRAVEL * k;
  return { dx, dy, scale: cover + push };
}

/** Moves ctx to a layer's parallax pose about the middle of the frame. */
export function applyParallax(ctx: Ctx2D, pose: ParallaxPose, W: number, H: number): void {
  if (pose.dx === 0 && pose.dy === 0 && pose.scale === 1) return;
  ctx.translate(W / 2 + pose.dx, H / 2 + pose.dy);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-W / 2, -H / 2);
}

export const AMBIENT_PARTICLES: readonly { id: AmbientParticleKind; label: string }[] = [
  { id: "none", label: "없음" },
  { id: "dust", label: "먼지" },
  { id: "bokeh", label: "빛망울" },
  { id: "petal", label: "꽃잎" },
  { id: "snow", label: "눈" },
  { id: "ember", label: "불씨" },
  { id: "star", label: "반짝이" },
  { id: "cyber", label: "사이버" },
  { id: "bubble", label: "거품" },
  { id: "heart", label: "하트" },
];

export const DEFAULT_AMBIENT: AmbientParticles = { kind: "none", amount: 0.5, color: "secondary" };

export function sanitizeAmbient(raw: unknown): AmbientParticles {
  const r = (raw ?? {}) as Partial<AmbientParticles>;
  const kind = AMBIENT_PARTICLES.some((p) => p.id === r.kind) ? (r.kind as AmbientParticleKind) : "none";
  const amount = Number.isFinite(r.amount)
    ? Math.min(1, Math.max(0, Number(r.amount)))
    : DEFAULT_AMBIENT.amount;
  const color = r.color === "accent" || r.color === "text" ? r.color : "secondary";
  return { kind, amount, color };
}

export const MOTION_CURVES: readonly { id: MotionCurveId; label: string; hint: string }[] = [
  { id: "style", label: "스타일 기본", hint: "모션 스타일마다 정해 둔 곡선" },
  { id: "smooth", label: "부드럽게", hint: "천천히 들어와 길게 멈춤, 서정적인 곡에" },
  { id: "snappy", label: "쫀득하게", hint: "확 들어와 탁 멈춤, 빠른 곡에" },
  { id: "bouncy", label: "튕기게", hint: "자리를 살짝 지나쳤다 돌아옴" },
  { id: "elastic", label: "탄성", hint: "고무줄처럼 여러 번 출렁이며 자리 잡음" },
  { id: "linear", label: "일정하게", hint: "처음부터 끝까지 같은 속도" },
];

export function sanitizeMotionCurve(raw: unknown): MotionCurveId {
  return MOTION_CURVES.some((c) => c.id === raw) ? (raw as MotionCurveId) : "style";
}
