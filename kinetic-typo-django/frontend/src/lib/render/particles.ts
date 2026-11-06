import { hash01 } from "./looks/noise";

export interface Particle {
  /** Position in 0..1 canvas units, set for the frame being drawn. */
  x: number;
  y: number;
  /** Where the particle is at time 0. */
  x0: number;
  y0: number;
  r: number;
  /** Drift per 1/60 s, in 0..1 canvas units. */
  vx: number;
  vy: number;
  alpha: number;
  /** 0 = blue, 1 = yellow, 2 = white. */
  hueType: 0 | 1 | 2;
}

const PARTICLE_COUNT = 42;
/** The drift speeds are per frame at this rate. */
const STEP_HZ = 60;
/** How far a full beat pushes the particles up, in seconds of drift. */
const BEAT_KICK_SEC = 0.6;

/** The same particles every time, so the preview and every export match. */
export function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const x0 = hash01(i, 101);
    const y0 = hash01(i, 102);
    return {
      x: x0,
      y: y0,
      x0,
      y0,
      // Includes larger dreamy bokeh circles for the intro.
      r: 2.0 + hash01(i, 103) * 14.0,
      vx: (hash01(i, 104) - 0.5) * 0.0005,
      vy: -0.0003 - hash01(i, 105) * 0.001,
      alpha: 0.08 + hash01(i, 106) * 0.35,
      hueType: (i % 3) as Particle["hueType"],
    };
  });
}

const wrap01 = (v: number) => ((v % 1) + 1) % 1;

/**
 * Puts the particles where they are at timeSec, wrapping at the edges. The
 * position depends on the time only, never on how many frames were drawn, so
 * a 144 Hz preview, a 30 fps export and an export of a later part agree.
 * driftBoost (beat energy) pushes them a little further up.
 */
export function placeParticles(particles: Particle[], timeSec: number, driftBoost: number): void {
  const steps = timeSec * STEP_HZ;
  const kick = Math.max(0, driftBoost) * BEAT_KICK_SEC * STEP_HZ;
  for (const pt of particles) {
    pt.x = wrap01(pt.x0 + pt.vx * steps);
    pt.y = wrap01(pt.y0 + pt.vy * (steps + kick));
  }
}
