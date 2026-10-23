export interface Particle {
  /** Position in 0..1 canvas units. */
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  /** 0 = blue, 1 = yellow, 2 = white. */
  hueType: 0 | 1 | 2;
}

const PARTICLE_COUNT = 42;

export function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    // Includes larger dreamy bokeh circles for the intro.
    r: 2.0 + Math.random() * 14.0,
    vx: (Math.random() - 0.5) * 0.0005,
    vy: -0.0003 - Math.random() * 0.001,
    alpha: 0.08 + Math.random() * 0.35,
    hueType: (i % 3) as Particle["hueType"],
  }));
}

/** Moves particles one frame, wrapping at the edges. driftBoost speeds the upward drift. */
export function stepParticles(particles: Particle[], driftBoost: number): void {
  for (const pt of particles) {
    pt.x = (pt.x + pt.vx + 1) % 1;
    pt.y = (pt.y + pt.vy * (1 + driftBoost) + 1) % 1;
  }
}
