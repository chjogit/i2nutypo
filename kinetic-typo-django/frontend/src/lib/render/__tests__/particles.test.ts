import { describe, expect, it } from "vitest";
import { createParticles, placeParticles } from "../particles";

describe("particles", () => {
  it("are the same every time they are made", () => {
    expect(createParticles()).toEqual(createParticles());
  });

  it("sit where the time says, however many frames were drawn before", () => {
    const a = createParticles();
    const b = createParticles();
    // a: a 144 Hz preview stepping up to 10 s; b: jumping straight there, as an export of a later part does
    for (let i = 0; i <= 1440; i++) placeParticles(a, i / 144, 0);
    placeParticles(b, 10, 0);
    a.forEach((p, i) => {
      expect(p.x).toBeCloseTo(b[i].x, 9);
      expect(p.y).toBeCloseTo(b[i].y, 9);
    });
  });

  it("stay inside the frame and drift up, a beat pushing them further", () => {
    const calm = createParticles();
    const beat = createParticles();
    placeParticles(calm, 0.5, 0);
    placeParticles(beat, 0.5, 1);
    for (const p of [...calm, ...beat]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(1);
    }
    const lifted = calm.filter((p, i) => Math.abs(p.y - beat[i].y) > 1e-6).length;
    expect(lifted).toBe(calm.length);
  });
});
