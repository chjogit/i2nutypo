import type { LyricLine, StyleSettings } from "@/types/project";
import { mulberry32, pickSome } from "@/lib/random";
import type { Ctx2D } from "../motifs";
import { clamp01, hash01, hashSigned } from "./noise";
import { lyricLookOf, type ThemedPresetId } from "./presets";

// Whole-line lyric motions ("techniques") drawn around a theme's own lyrics:
// how the line comes in, and how it moves while it is sung. Each theme offers
// eight that suit it, and a song uses five of them (see pickMotions).

export interface MotionFrame {
  ctx: Ctx2D;
  W: number;
  H: number;
  /** Seconds since the line started, and its length. */
  elapsed: number;
  dur: number;
  energy: number;
  /** Where the lyrics sit (the frame's middle plus the lyric shift). */
  cx: number;
  cy: number;
  seed: number;
}

interface MotionDef {
  id: string;
  label: string;
  /** Draws the lyrics (`draw`) with this motion applied. */
  apply: (m: MotionFrame, draw: () => void) => void;
}

const IN = 0.42;
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeOutBack = (x: number) => {
  const t = clamp01(x) - 1;
  return 1 + 2.7 * t * t * t + 1.7 * t * t;
};
const bounceOut = (x: number) => {
  const t = clamp01(x);
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t - 1.5 / 2.75) ** 2 + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t - 2.25 / 2.75) ** 2 + 0.9375;
  return 7.5625 * (t - 2.625 / 2.75) ** 2 + 0.984375;
};
const inP = (m: MotionFrame, len = IN) => clamp01(m.elapsed / len);
const minSide = (m: MotionFrame) => Math.min(m.W, m.H);

/** Runs `draw` scaled/rotated about the lyric centre. */
function about(m: MotionFrame, sx: number, sy: number, rot: number, draw: () => void): void {
  const { ctx } = m;
  ctx.save();
  ctx.translate(m.cx, m.cy);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.translate(-m.cx, -m.cy);
  draw();
  ctx.restore();
}

function moved(m: MotionFrame, dx: number, dy: number, alpha: number, draw: () => void): void {
  const { ctx } = m;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  ctx.translate(dx, dy);
  draw();
  ctx.restore();
}

function clipped(m: MotionFrame, path: (ctx: Ctx2D) => void, draw: () => void): void {
  const { ctx } = m;
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  draw();
  ctx.restore();
}

export const MOTIONS: readonly MotionDef[] = [
  {
    id: "slide_side",
    label: "옆에서 밀려오기",
    apply: (m, d) => {
      const p = easeOut(inP(m));
      const dir = m.seed % 2 === 0 ? -1 : 1;
      moved(m, dir * (1 - p) * m.W * 0.25, 0, p * 1.4, d);
    },
  },
  {
    id: "slide_up",
    label: "아래에서 떠오르기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.55));
      moved(m, 0, (1 - p) * m.H * 0.14, p * 1.3, d);
    },
  },
  {
    id: "drop",
    label: "위에서 떨어져 튕기기",
    apply: (m, d) => moved(m, 0, -(1 - bounceOut(inP(m, 0.6))) * m.H * 0.35, inP(m, 0.12), d),
  },
  {
    id: "zoom_punch",
    label: "크게 들이치기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.3));
      const s = 1.7 - 0.7 * p;
      m.ctx.save();
      m.ctx.globalAlpha *= clamp01(p * 2);
      about(m, s, s, 0, d);
      m.ctx.restore();
    },
  },
  {
    id: "zoom_out",
    label: "작게 시작해 펼치기",
    apply: (m, d) => {
      const p = easeOutBack(inP(m, 0.5));
      const s = 0.35 + 0.65 * p;
      m.ctx.save();
      m.ctx.globalAlpha *= clamp01(inP(m, 0.25));
      about(m, s, s, 0, d);
      m.ctx.restore();
    },
  },
  {
    id: "spin_in",
    label: "돌며 나타나기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.55));
      const s = 0.6 + 0.4 * p;
      m.ctx.save();
      m.ctx.globalAlpha *= p;
      about(m, s, s, (1 - p) * (m.seed % 2 === 0 ? -0.9 : 0.9), d);
      m.ctx.restore();
    },
  },
  {
    id: "tilt_swing",
    label: "기울며 흔들리기",
    apply: (m, d) => {
      const swing =
        Math.sin(m.elapsed * 7) * Math.exp(-m.elapsed * 2.2) * 0.16 + Math.sin(m.elapsed * 1.6) * 0.012;
      about(m, 1, 1, swing, d);
    },
  },
  {
    id: "wipe_side",
    label: "옆으로 닦아내며 드러내기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.5));
      clipped(m, (c) => c.rect(-m.W, -m.H, m.W + p * m.W * 2, m.H * 3), d);
    },
  },
  {
    id: "wipe_down",
    label: "위에서 아래로 드러내기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.55));
      clipped(m, (c) => c.rect(-m.W, -m.H, m.W * 3, m.H + p * m.H * 2), d);
    },
  },
  {
    id: "iris",
    label: "원형으로 열리기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.6));
      clipped(m, (c) => c.arc(m.cx, m.cy, Math.max(1, p * Math.hypot(m.W, m.H) * 0.6), 0, Math.PI * 2), d);
    },
  },
  {
    id: "shutter",
    label: "블라인드처럼 열리기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.5));
      const bands = 9;
      const bh = m.H / bands;
      clipped(
        m,
        (c) => {
          for (let i = 0; i < bands; i++) c.rect(-m.W, i * bh + (bh * (1 - p)) / 2, m.W * 3, bh * p);
        },
        d,
      );
    },
  },
  {
    id: "split_slide",
    label: "위아래 반쪽이 엇갈려 모이기",
    apply: (m, d) => {
      const off = (1 - easeOut(inP(m, 0.45))) * m.W * 0.3;
      clipped(
        m,
        (c) => c.rect(-m.W, -m.H, m.W * 3, m.cy + m.H),
        () => moved(m, -off, 0, 1, d),
      );
      clipped(
        m,
        (c) => c.rect(-m.W, m.cy, m.W * 3, m.H * 2),
        () => moved(m, off, 0, 1, d),
      );
    },
  },
  {
    id: "glitch_slices",
    label: "가로 조각 어긋나기",
    apply: (m, d) => {
      const settle = 1 - inP(m, 0.4);
      const beat = m.energy > 0.55 ? 0.35 : 0;
      const amt = Math.max(settle, beat);
      if (amt <= 0.01) return d();
      const frame = Math.floor((m.elapsed + m.seed) * 24);
      const slices = 7;
      const sh = (m.H * 0.5) / slices;
      const top = m.cy - m.H * 0.25;
      clipped(m, (c) => c.rect(-m.W, -m.H, m.W * 3, top + m.H), d);
      clipped(m, (c) => c.rect(-m.W, top + slices * sh, m.W * 3, m.H * 2), d);
      for (let i = 0; i < slices; i++) {
        const dx = hashSigned(frame, i) * m.W * 0.06 * amt;
        clipped(
          m,
          (c) => c.rect(-m.W, top + i * sh, m.W * 3, sh + 0.5),
          () => moved(m, dx, 0, 1, d),
        );
      }
    },
  },
  {
    id: "stamp",
    label: "쾅 찍히기",
    apply: (m, d) => {
      const p = inP(m, 0.18);
      const s = p < 1 ? 2.4 - 1.4 * easeOut(p) : 1 + Math.exp(-(m.elapsed - 0.18) * 18) * 0.06;
      const jolt = p >= 1 ? Math.exp(-(m.elapsed - 0.18) * 14) * minSide(m) * 0.02 : 0;
      m.ctx.save();
      m.ctx.globalAlpha *= clamp01(p * 3);
      m.ctx.translate(
        hashSigned(Math.floor(m.elapsed * 40), 3) * jolt,
        hashSigned(Math.floor(m.elapsed * 40), 4) * jolt,
      );
      about(m, s, s, (m.seed % 2 === 0 ? -1 : 1) * 0.03, d);
      m.ctx.restore();
    },
  },
  {
    id: "flip",
    label: "카드처럼 뒤집히기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.5));
      about(m, Math.max(0.02, Math.cos(((1 - p) * Math.PI) / 2)), 1, 0, d);
    },
  },
  {
    id: "skew_rush",
    label: "기울어진 채 달려오기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.4));
      const dir = m.seed % 2 === 0 ? 1 : -1;
      const { ctx } = m;
      ctx.save();
      ctx.globalAlpha *= clamp01(p * 1.5);
      ctx.translate(dir * (1 - p) * m.W * 0.35, 0);
      ctx.translate(m.cx, m.cy);
      ctx.transform(1, 0, -dir * 0.45 * (1 - p), 1, 0, 0);
      ctx.translate(-m.cx, -m.cy);
      d();
      ctx.restore();
    },
  },
  {
    id: "elastic",
    label: "고무줄처럼 늘었다 돌아오기",
    apply: (m, d) => {
      const w = Math.sin(m.elapsed * 16) * Math.exp(-m.elapsed * 5) * 0.35;
      about(m, 1 + w, 1 - w * 0.6, 0, d);
    },
  },
  {
    id: "blur_in",
    label: "흐릿하다 선명해지기",
    apply: (m, d) => {
      const p = inP(m, 0.6);
      const { ctx } = m;
      ctx.save();
      if (p < 1) ctx.filter = `blur(${((1 - easeOut(p)) * minSide(m) * 0.02).toFixed(1)}px)`;
      ctx.globalAlpha *= clamp01(p * 1.6);
      d();
      ctx.restore();
    },
  },
  {
    id: "breathe",
    label: "비트에 맞춰 숨쉬기",
    apply: (m, d) => {
      const s = 1 + m.energy * 0.07 + Math.sin(m.elapsed * 2.4) * 0.012;
      about(m, s, s, 0, d);
    },
  },
  {
    id: "drift",
    label: "천천히 흘러가기",
    apply: (m, d) => {
      const dir = m.seed % 2 === 0 ? 1 : -1;
      const p = clamp01(m.elapsed / Math.max(0.5, m.dur));
      moved(m, dir * (p - 0.5) * m.W * 0.05, -(p - 0.5) * m.H * 0.025, inP(m, 0.4), d);
    },
  },
  {
    id: "push_in",
    label: "천천히 다가오기",
    apply: (m, d) => {
      const p = clamp01(m.elapsed / Math.max(0.5, m.dur));
      const s = 0.96 + 0.1 * p;
      m.ctx.save();
      m.ctx.globalAlpha *= inP(m, 0.35);
      about(m, s, s, 0, d);
      m.ctx.restore();
    },
  },
  {
    id: "strobe",
    label: "깜빡이며 켜지기",
    apply: (m, d) => {
      if (m.elapsed < 0.36 && Math.floor(m.elapsed * 22) % 2 === 1) return;
      d();
    },
  },
  {
    id: "echo",
    label: "잔상 남기기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.7));
      const gap = (1 - p) * minSide(m) * 0.05 + minSide(m) * 0.004;
      for (let k = 3; k >= 1; k--) moved(m, -gap * k, gap * k * 0.4, 0.16 * (1 - p * 0.6), d);
      d();
    },
  },
  {
    id: "shake_hit",
    label: "부딪히며 떨리기",
    apply: (m, d) => {
      const amp = Math.exp(-m.elapsed * 6) * minSide(m) * 0.03 + m.energy * minSide(m) * 0.004;
      const f = Math.floor(m.elapsed * 30);
      moved(m, hashSigned(f, 21) * amp, hashSigned(f, 22) * amp, 1, d);
    },
  },
  {
    id: "double",
    label: "두 겹이 하나로 모이기",
    apply: (m, d) => {
      const off = (1 - easeOut(inP(m, 0.5))) * minSide(m) * 0.06;
      moved(m, off, 0, 0.5, d);
      moved(m, -off, 0, off > 0.5 ? 0.6 : 1, d);
    },
  },
  {
    id: "scroll",
    label: "세로로 흘러 지나가기",
    apply: (m, d) => {
      const p = clamp01(m.elapsed / Math.max(0.5, m.dur));
      moved(m, 0, (0.5 - p) * m.H * 0.12, inP(m, 0.3), d);
    },
  },
  {
    id: "pop_bounce",
    label: "통통 튀며 등장",
    apply: (m, d) => {
      const s = m.elapsed < 0.6 ? 1 - Math.cos(m.elapsed * 22) * Math.exp(-m.elapsed * 7) * 0.4 : 1;
      m.ctx.save();
      m.ctx.globalAlpha *= inP(m, 0.08);
      about(m, s, s, 0, d);
      m.ctx.restore();
    },
  },
  // Added later: numbers stay stable because lines store a motion by its place in this list
  {
    id: "type_steps",
    label: "타자 치듯 끊어 드러내기",
    apply: (m, d) => {
      const steps = 9;
      const p = Math.floor(inP(m, 0.7) * steps) / steps;
      if (p >= 1) return d();
      clipped(m, (c) => c.rect(-m.W, -m.H, m.W + p * m.W * 2 + m.W * 0.02, m.H * 3), d);
    },
  },
  {
    id: "swing_in",
    label: "그네처럼 매달려 흔들리기",
    apply: (m, d) => {
      const a = Math.sin(m.elapsed * 9) * Math.exp(-m.elapsed * 3.2) * 0.5;
      const { ctx } = m;
      ctx.save();
      ctx.globalAlpha *= inP(m, 0.15);
      ctx.translate(m.cx, m.cy - m.H * 0.25);
      ctx.rotate(a);
      ctx.translate(-m.cx, -(m.cy - m.H * 0.25));
      d();
      ctx.restore();
    },
  },
  {
    id: "slam_down",
    label: "내리꽂혀 찌그러지기",
    apply: (m, d) => {
      const fall = inP(m, 0.22);
      const y = -(1 - fall * fall) * m.H * 0.4;
      const t = m.elapsed - 0.22;
      const squash = t > 0 ? Math.exp(-t * 9) * Math.cos(t * 30) * 0.28 : 0;
      const { ctx } = m;
      ctx.save();
      ctx.translate(0, y);
      ctx.translate(m.cx, m.cy);
      ctx.scale(1 + squash, 1 - squash);
      ctx.translate(-m.cx, -m.cy);
      d();
      ctx.restore();
    },
  },
  {
    id: "zoom_through",
    label: "카메라가 뚫고 들어오기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.45));
      const s = 4 - 3 * p;
      const { ctx } = m;
      ctx.save();
      ctx.globalAlpha *= clamp01(p * 1.5);
      if (p < 1) ctx.filter = `blur(${((1 - p) * minSide(m) * 0.03).toFixed(1)}px)`;
      about(m, s, s, 0, d);
      ctx.restore();
    },
  },
  {
    id: "wave",
    label: "물결치며 출렁이기",
    apply: (m, d) => {
      const amp = (Math.exp(-m.elapsed * 2.5) * 0.9 + 0.1) * minSide(m) * 0.02;
      const slices = 10;
      const top = m.cy - m.H * 0.3;
      const sh = (m.H * 0.6) / slices;
      clipped(m, (c) => c.rect(-m.W, -m.H, m.W * 3, top + m.H), d);
      clipped(m, (c) => c.rect(-m.W, top + slices * sh, m.W * 3, m.H * 2), d);
      for (let i = 0; i < slices; i++) {
        const dx = Math.sin(m.elapsed * 6 + i * 0.7) * amp;
        clipped(
          m,
          (c) => c.rect(-m.W, top + i * sh, m.W * 3, sh + 0.5),
          () => moved(m, dx, 0, 1, d),
        );
      }
    },
  },
  {
    id: "jitter_hold",
    label: "코마 떨림",
    apply: (m, d) => {
      const f = Math.floor((m.elapsed + m.seed) * 12);
      const amp = minSide(m) * 0.004;
      m.ctx.save();
      m.ctx.globalAlpha *= inP(m, 0.1);
      about(m, 1, 1, hashSigned(f, 61) * 0.012, () =>
        moved(m, hashSigned(f, 62) * amp, hashSigned(f, 63) * amp, 1, d),
      );
      m.ctx.restore();
    },
  },
  {
    id: "spiral_in",
    label: "소용돌이치며 모이기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.7));
      const s = 0.2 + 0.8 * p;
      m.ctx.save();
      m.ctx.globalAlpha *= clamp01(p * 1.4);
      about(m, s, s, (1 - p) * Math.PI * 2 * (m.seed % 2 ? 1 : -1), d);
      m.ctx.restore();
    },
  },
  {
    id: "split_vertical",
    label: "좌우 반쪽이 위아래에서 모이기",
    apply: (m, d) => {
      const off = (1 - easeOut(inP(m, 0.5))) * m.H * 0.3;
      clipped(
        m,
        (c) => c.rect(-m.W, -m.H, m.cx + m.W, m.H * 3),
        () => moved(m, 0, -off, 1, d),
      );
      clipped(
        m,
        (c) => c.rect(m.cx, -m.H, m.W * 2, m.H * 3),
        () => moved(m, 0, off, 1, d),
      );
    },
  },
  {
    id: "diagonal_wipe",
    label: "사선으로 쓸어 드러내기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.5));
      const x = -m.H + p * (m.W + m.H * 2);
      clipped(
        m,
        (c) => {
          c.moveTo(-m.W, -m.H);
          c.lineTo(x + m.H, -m.H);
          c.lineTo(x - m.H, m.H * 2);
          c.lineTo(-m.W, m.H * 2);
          c.closePath();
        },
        d,
      );
    },
  },
  {
    id: "blinds_vertical",
    label: "세로 블라인드로 열리기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.5));
      const bands = 12;
      const bw = m.W / bands;
      clipped(
        m,
        (c) => {
          for (let i = 0; i < bands; i++) c.rect(i * bw + (bw * (1 - p)) / 2, -m.H, bw * p, m.H * 3);
        },
        d,
      );
    },
  },
  {
    id: "ink_reveal",
    label: "잉크가 번지듯 드러내기",
    apply: (m, d) => {
      const p = easeOut(inP(m, 0.7));
      if (p >= 1) return d();
      clipped(
        m,
        (c) => {
          for (let i = 0; i < 6; i++) {
            const x = m.cx + hashSigned(m.seed, i * 2) * m.W * 0.3;
            const y = m.cy + hashSigned(m.seed, i * 2 + 1) * m.H * 0.15;
            c.moveTo(x, y);
            c.arc(x, y, Math.max(0.5, p * minSide(m) * (0.3 + 0.2 * hash01(m.seed, i))), 0, Math.PI * 2);
          }
        },
        d,
      );
    },
  },
  {
    id: "glow_flash",
    label: "빛나며 켜지기",
    apply: (m, d) => {
      const glow = Math.exp(-m.elapsed * 5);
      const { ctx } = m;
      ctx.save();
      ctx.globalAlpha *= inP(m, 0.1);
      d();
      if (glow > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha *= glow * 0.8;
        ctx.filter = `blur(${(minSide(m) * 0.012).toFixed(1)}px)`;
        d();
      }
      ctx.restore();
    },
  },
  {
    id: "squash_stretch",
    label: "젤리처럼 출렁이기",
    apply: (m, d) => {
      const w = Math.sin(m.elapsed * 13) * Math.exp(-m.elapsed * 4) * 0.25 + m.energy * 0.03;
      about(m, 1 - w * 0.6, 1 + w, 0, d);
    },
  },
  {
    id: "camera_pan",
    label: "카메라가 크게 훑고 지나가기",
    apply: (m, d) => {
      const dir = m.seed % 2 === 0 ? 1 : -1;
      const p = clamp01(m.elapsed / Math.max(0.5, m.dur));
      const s = 1.12 - 0.08 * p;
      m.ctx.save();
      m.ctx.globalAlpha *= inP(m, 0.25);
      about(m, s, s, 0, () => moved(m, dir * (0.5 - p) * m.W * 0.12, 0, 1, d));
      m.ctx.restore();
    },
  },
  {
    id: "beat_jump",
    label: "비트마다 껑충",
    apply: (m, d) => {
      const jump = -m.energy * m.energy * minSide(m) * 0.05;
      m.ctx.save();
      m.ctx.globalAlpha *= inP(m, 0.12);
      moved(m, 0, jump, 1, d);
      m.ctx.restore();
    },
  },
  {
    id: "stretch_wide",
    label: "옆으로 길게 늘었다 모이기",
    apply: (m, d) => {
      const p = easeOutBack(inP(m, 0.45));
      m.ctx.save();
      m.ctx.globalAlpha *= clamp01(inP(m, 0.2) * 1.5);
      about(m, 1 + (1 - p) * 2.2, Math.max(0.05, 0.3 + 0.7 * p), 0, d);
      m.ctx.restore();
    },
  },
  {
    id: "slice_fall",
    label: "세로 조각이 차례로 떨어지기",
    apply: (m, d) => {
      const cols = 8;
      const cw = m.W / cols;
      for (let i = 0; i < cols; i++) {
        const p = bounceOut(clamp01((m.elapsed - i * 0.035) / 0.45));
        if (p <= 0) continue;
        clipped(
          m,
          (c) => c.rect(i * cw, -m.H, cw + 0.5, m.H * 3),
          () => moved(m, 0, -(1 - p) * m.H * 0.3, clamp01(p * 3), d),
        );
      }
    },
  },
  {
    id: "orbit",
    label: "작게 맴돌기",
    apply: (m, d) => {
      const r = minSide(m) * 0.012;
      const a = m.elapsed * 2.2 + m.seed;
      m.ctx.save();
      m.ctx.globalAlpha *= inP(m, 0.3);
      moved(m, Math.cos(a) * r, Math.sin(a) * r * 0.6, 1, d);
      m.ctx.restore();
    },
  },
];

export const MOTION_BY_ID = new Map(MOTIONS.map((x) => [x.id, x]));

// How a line leaves (style.exitMotion): over its last moments, matched to how it came in

export const EXIT_SEC = 0.22;

type ExitFn = (m: MotionFrame, draw: () => void, p: number) => void;

const EXITS: Record<string, ExitFn> = {
  fade: (m, d, p) => {
    const s = 1 - 0.08 * p;
    m.ctx.save();
    m.ctx.globalAlpha *= 1 - p;
    about(m, s, s, 0, d);
    m.ctx.restore();
  },
  rise: (m, d, p) => moved(m, 0, -p * p * m.H * 0.08, 1 - p, d),
  fall: (m, d, p) => moved(m, 0, p * p * m.H * 0.25, 1 - p * 0.6, d),
  slideOut: (m, d, p) => moved(m, (m.seed % 2 === 0 ? 1 : -1) * p * p * m.W * 0.3, 0, 1 - p, d),
  zoomIn: (m, d, p) => {
    const s = 1 + p * p * 0.8;
    m.ctx.save();
    m.ctx.globalAlpha *= 1 - p;
    about(m, s, s, 0, d);
    m.ctx.restore();
  },
  shrink: (m, d, p) => {
    const s = Math.max(0.02, 1 - p * p);
    about(m, s, s, 0, d);
  },
  wipeOut: (m, d, p) => clipped(m, (c) => c.rect(-m.W + p * m.W * 3, -m.H, m.W * 3, m.H * 3), d),
  irisOut: (m, d, p) =>
    clipped(
      m,
      (c) => c.arc(m.cx, m.cy, Math.max(0.5, (1 - p) * Math.hypot(m.W, m.H) * 0.6), 0, Math.PI * 2),
      d,
    ),
  glitchOut: (m, d, p) => {
    if (Math.floor(p * 9) % 2 === 1) return;
    moved(m, hashSigned(Math.floor(p * 20), m.seed) * m.W * 0.03 * p, 0, 1 - p * 0.5, d);
  },
  blurOut: (m, d, p) => {
    m.ctx.save();
    m.ctx.filter = `blur(${(p * minSide(m) * 0.02).toFixed(1)}px)`;
    m.ctx.globalAlpha *= 1 - p;
    d();
    m.ctx.restore();
  },
  spinOut: (m, d, p) => {
    const s = 1 - p * 0.5;
    m.ctx.save();
    m.ctx.globalAlpha *= 1 - p;
    about(m, s, s, p * (m.seed % 2 === 0 ? 0.9 : -0.9), d);
    m.ctx.restore();
  },
  flatten: (m, d, p) => about(m, 1, Math.max(0.02, 1 - p), 0, d),
};

const EXIT_OF: Record<string, keyof typeof EXITS> = {
  slide_side: "slideOut",
  slide_up: "rise",
  drop: "fall",
  zoom_punch: "zoomIn",
  zoom_out: "shrink",
  spin_in: "spinOut",
  wipe_side: "wipeOut",
  wipe_down: "wipeOut",
  iris: "irisOut",
  shutter: "flatten",
  split_slide: "slideOut",
  glitch_slices: "glitchOut",
  stamp: "zoomIn",
  flip: "flatten",
  skew_rush: "slideOut",
  blur_in: "blurOut",
  push_in: "zoomIn",
  strobe: "glitchOut",
  shake_hit: "glitchOut",
  pop_bounce: "shrink",
  type_steps: "wipeOut",
  slam_down: "fall",
  zoom_through: "zoomIn",
  spiral_in: "spinOut",
  split_vertical: "flatten",
  diagonal_wipe: "wipeOut",
  blinds_vertical: "flatten",
  ink_reveal: "irisOut",
  glow_flash: "blurOut",
  stretch_wide: "flatten",
  slice_fall: "fall",
  camera_pan: "slideOut",
};

/** The exit that goes with a motion. */
export function exitFor(id: string | undefined): ExitFn {
  return EXITS[(id && EXIT_OF[id]) || "fade"];
}

/** Runs the line's motion and, in its last EXIT_SEC with exits on, its exit. */
export function applyMotion(
  motion: { id: string; apply: (m: MotionFrame, draw: () => void) => void } | null,
  m: MotionFrame,
  draw: () => void,
  exits: boolean,
): void {
  const left = m.dur - m.elapsed;
  const exiting = exits && m.dur > EXIT_SEC * 2.5 && left < EXIT_SEC;
  const inner = exiting ? () => exitFor(motion?.id)(m, draw, 1 - Math.max(0, left) / EXIT_SEC) : draw;
  if (motion) motion.apply(m, inner);
  else inner();
}
export const motionLabel = (id: string): string => MOTION_BY_ID.get(id)?.label ?? id;

/** The twelve motions that suit each theme, best first. */
export const THEME_MOTIONS: Record<ThemedPresetId, readonly string[]> = {
  album_jacket: [
    "slide_side",
    "slide_up",
    "zoom_out",
    "wipe_side",
    "push_in",
    "drift",
    "flip",
    "echo",
    "camera_pan",
    "type_steps",
    "orbit",
    "diagonal_wipe",
  ],
  pop_cutout: [
    "stamp",
    "pop_bounce",
    "drop",
    "elastic",
    "spin_in",
    "skew_rush",
    "tilt_swing",
    "zoom_punch",
    "slam_down",
    "squash_stretch",
    "beat_jump",
    "stretch_wide",
  ],
  tint_panels: [
    "wipe_side",
    "wipe_down",
    "shutter",
    "split_slide",
    "slide_side",
    "flip",
    "stamp",
    "skew_rush",
    "diagonal_wipe",
    "blinds_vertical",
    "split_vertical",
    "type_steps",
  ],
  ballad_hud: [
    "blur_in",
    "drift",
    "push_in",
    "slide_up",
    "iris",
    "breathe",
    "echo",
    "zoom_out",
    "glow_flash",
    "camera_pan",
    "orbit",
    "ink_reveal",
  ],
  cinematic_fantasy: [
    "blur_in",
    "iris",
    "push_in",
    "zoom_out",
    "drift",
    "spin_in",
    "echo",
    "wipe_down",
    "zoom_through",
    "glow_flash",
    "spiral_in",
    "camera_pan",
  ],
  digital_crt: [
    "glitch_slices",
    "strobe",
    "shutter",
    "double",
    "wipe_side",
    "shake_hit",
    "skew_rush",
    "scroll",
    "type_steps",
    "jitter_hold",
    "wave",
    "blinds_vertical",
  ],
  dark_glitch: [
    "glitch_slices",
    "shake_hit",
    "strobe",
    "double",
    "split_slide",
    "zoom_punch",
    "stamp",
    "skew_rush",
    "jitter_hold",
    "zoom_through",
    "slice_fall",
    "wave",
  ],
  summer_film: [
    "slide_side",
    "drift",
    "flip",
    "wipe_side",
    "pop_bounce",
    "push_in",
    "tilt_swing",
    "slide_up",
    "swing_in",
    "orbit",
    "camera_pan",
    "type_steps",
  ],
  flat_type: [
    "stamp",
    "skew_rush",
    "split_slide",
    "shutter",
    "slide_side",
    "drop",
    "flip",
    "zoom_punch",
    "slam_down",
    "slice_fall",
    "diagonal_wipe",
    "stretch_wide",
  ],
  eclipse_nebula: [
    "iris",
    "spin_in",
    "blur_in",
    "zoom_out",
    "breathe",
    "echo",
    "drift",
    "push_in",
    "spiral_in",
    "glow_flash",
    "zoom_through",
    "orbit",
  ],
  mono_accent: [
    "wipe_side",
    "shutter",
    "split_slide",
    "slide_up",
    "stamp",
    "skew_rush",
    "flip",
    "zoom_punch",
    "diagonal_wipe",
    "blinds_vertical",
    "type_steps",
    "slice_fall",
  ],
  vintage_paper: [
    "blur_in",
    "wipe_down",
    "drift",
    "tilt_swing",
    "slide_up",
    "push_in",
    "iris",
    "echo",
    "ink_reveal",
    "jitter_hold",
    "swing_in",
    "type_steps",
  ],
  pastel_dream: [
    "pop_bounce",
    "elastic",
    "breathe",
    "drift",
    "zoom_out",
    "tilt_swing",
    "blur_in",
    "spin_in",
    "squash_stretch",
    "swing_in",
    "beat_jump",
    "orbit",
  ],
  crimson_ink: [
    "wipe_side",
    "stamp",
    "blur_in",
    "shake_hit",
    "wipe_down",
    "zoom_punch",
    "split_slide",
    "iris",
    "ink_reveal",
    "slam_down",
    "diagonal_wipe",
    "jitter_hold",
  ],
  sakura_breeze: [
    "drift",
    "slide_side",
    "tilt_swing",
    "blur_in",
    "push_in",
    "breathe",
    "spin_in",
    "wipe_side",
    "swing_in",
    "orbit",
    "wave",
    "camera_pan",
  ],
  snow_night: [
    "blur_in",
    "drift",
    "drop",
    "push_in",
    "breathe",
    "iris",
    "echo",
    "zoom_out",
    "glow_flash",
    "orbit",
    "ink_reveal",
    "swing_in",
  ],
  rain_window: [
    "wipe_down",
    "blur_in",
    "scroll",
    "drift",
    "double",
    "echo",
    "shutter",
    "push_in",
    "wave",
    "ink_reveal",
    "blinds_vertical",
    "camera_pan",
  ],
  manga_panel: [
    "stamp",
    "zoom_punch",
    "shake_hit",
    "skew_rush",
    "split_slide",
    "drop",
    "elastic",
    "flip",
    "slam_down",
    "slice_fall",
    "jitter_hold",
    "stretch_wide",
  ],
  deep_sea: [
    "drift",
    "blur_in",
    "breathe",
    "scroll",
    "iris",
    "echo",
    "zoom_out",
    "tilt_swing",
    "wave",
    "orbit",
    "glow_flash",
    "ink_reveal",
  ],
  neon_sign: [
    "strobe",
    "glitch_slices",
    "double",
    "zoom_punch",
    "breathe",
    "shake_hit",
    "flip",
    "iris",
    "glow_flash",
    "jitter_hold",
    "beat_jump",
    "zoom_through",
  ],
};

/** How many of a theme's twelve motions a song uses. */
export const MOTIONS_PER_SONG = 6;

/** Six of each theme's twelve motions, picked from the song's seed. */
export function pickMotions(seed: number): Record<ThemedPresetId, string[]> {
  const rand = mulberry32(seed);
  const out = {} as Record<ThemedPresetId, string[]>;
  for (const id of Object.keys(THEME_MOTIONS) as ThemedPresetId[]) {
    const picked = new Set(pickSome(THEME_MOTIONS[id], MOTIONS_PER_SONG, rand));
    // Keep the theme's order so the chips read the same way every time
    out[id] = THEME_MOTIONS[id].filter((m) => picked.has(m));
  }
  return out;
}

/** The motions a theme uses now: the user's picks, or its first five. */
export function activeMotions(style: Pick<StyleSettings, "motionPicks">, theme: ThemedPresetId): string[] {
  const own = THEME_MOTIONS[theme];
  const picks = style.motionPicks?.[theme];
  if (!picks) return own.slice(0, MOTIONS_PER_SONG);
  return picks.filter((m) => own.includes(m));
}

/** Keeps only known theme ids and each theme's own motions. */
export function sanitizeMotionPicks(raw: unknown): Partial<Record<ThemedPresetId, string[]>> {
  const out: Partial<Record<ThemedPresetId, string[]>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!(id in THEME_MOTIONS) || !Array.isArray(list)) continue;
    const own = THEME_MOTIONS[id as ThemedPresetId];
    out[id as ThemedPresetId] = own.filter((m) => list.includes(m));
  }
  return out;
}

/** 1-based number of a motion as a line stores it (lineStyle.motion), 0 for none. */
export const motionNumber = (id: string): number => MOTIONS.findIndex((x) => x.id === id) + 1;

/**
 * The motion a line uses: its own (set by "다시 뽑기" on the line), or one of
 * the theme's active motions chosen from the line's number, never the same as
 * the line before it.
 */
export function motionForLine(style: StyleSettings, line: LyricLine): MotionDef | null {
  const own = Math.round(line.lineStyle.motion ?? 0);
  if (own > 0 && own <= MOTIONS.length) return MOTIONS[own - 1];
  const theme = lyricLookOf(style);
  if (theme === "classic") return null;
  const list = activeMotions(style, theme);
  if (list.length === 0) return null;
  const at = (i: number) => Math.floor(hash01(i, 77) * list.length);
  let k = at(line.index);
  if (list.length > 1 && k === at(line.index - 1)) k = (k + 1) % list.length;
  return MOTION_BY_ID.get(list[k]) ?? null;
}
