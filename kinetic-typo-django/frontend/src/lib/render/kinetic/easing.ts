// Timing curves for the kinetic engine. Every curve is a pure function of
// time, so a frame looks the same in the preview and in the exported video.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * CSS cubic-bezier(x1, y1, x2, y2) as a function of 0..1 progress. Solves the
 * curve's x for t with Newton steps, and bisection where the slope is flat.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => {
    const p = clamp01(x);
    if (p === 0 || p === 1) return p;
    return sampleY(solve(p));
  };
}

/** Entrances: very fast at first, a long sticky slow-down at the end. */
export const EXPO_OUT = cubicBezier(0.16, 1, 0.3, 1);
/** Exits: holds, then leaves at once without lingering. */
export const SHARP_IN = cubicBezier(0.7, 0, 0.84, 0);
/** Slow camera moves: no start or stop jolt, still never a straight line. */
export const GLIDE = cubicBezier(0.45, 0.05, 0.25, 1);

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

/** The default entrance spring: lively, one small overshoot, settled in about half a second. */
export const DEFAULT_SPRING: SpringConfig = { stiffness: 300, damping: 22, mass: 1 };
/** A harder spring for pop-ins and camera punches. */
export const SNAPPY_SPRING: SpringConfig = { stiffness: 520, damping: 24, mass: 1 };

/**
 * Position 0 → 1 of a damped spring released at rest at t = 0 (seconds),
 * solved in closed form (no stepping), so any frame can be drawn on its own.
 * An under-damped spring overshoots 1 and settles back.
 */
export function springAt(t: number, cfg: SpringConfig = DEFAULT_SPRING): number {
  if (t <= 0) return 0;
  const { stiffness: k, damping: c, mass: m } = cfg;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const env = Math.exp(-zeta * w0 * t);
    return 1 - env * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
  const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
  const a = r2 / (r2 - r1);
  const b = -r1 / (r2 - r1);
  return 1 - a * Math.exp(r1 * t) - b * Math.exp(r2 * t);
}

/** Seconds until the spring stays within `eps` of rest. */
export function springSettle(cfg: SpringConfig = DEFAULT_SPRING, eps = 0.005): number {
  const w0 = Math.sqrt(cfg.stiffness / cfg.mass);
  const zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass));
  const rate = zeta < 1 ? zeta * w0 : w0 * (zeta - Math.sqrt(zeta * zeta - 1));
  return Math.log(1 / eps) / Math.max(1e-3, rate);
}

/** a → b by progress p (p may run past 1 for a spring's overshoot). */
export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
