import { describe, expect, it } from "vitest";
import { planVoicedWindows, WINDOW_SEC } from "../windows";

const SR = 1000; // a low rate keeps the test fast; the planner only looks at levels

/** Vocals present in the given [start, end) stretches, silence elsewhere. */
function vocals(duration: number, sung: [number, number][], breaths: number[] = []): Float32Array {
  const out = new Float32Array(duration * SR);
  for (const [a, b] of sung) for (let i = a * SR; i < b * SR; i++) out[i] = 0.3 * Math.sin(i * 0.7);
  // Short dips between phrases
  for (const t of breaths) out.fill(0, t * SR, (t + 0.4) * SR);
  return out;
}

describe("planVoicedWindows", () => {
  it("skips the intro and an instrumental break", () => {
    const w = planVoicedWindows(
      vocals(120, [
        [12, 40],
        [70, 95],
      ]),
      SR,
    );
    // The 30 s gap is not listened to
    expect(w.some((x) => x.start > 41 && x.end < 69)).toBe(false);
    expect(w[0].start).toBeGreaterThan(10);
    expect(w.every((x) => x.end - x.start <= WINDOW_SEC + 0.01)).toBe(true);
  });

  it("ends a long sung stretch at a breath, not mid-word", () => {
    const w = planVoicedWindows(vocals(100, [[0, 100]], [24.3, 52.1, 75]), SR);
    expect(w[0].keepTo).toBeGreaterThanOrEqual(24.3);
    expect(w[0].keepTo).toBeLessThanOrEqual(24.7);
    // Kept spans tile the song with no gap or overlap
    for (let i = 1; i < w.length; i++) expect(w[i].keepFrom).toBeCloseTo(w[i - 1].keepTo, 5);
  });

  it("returns nothing for silence", () => {
    expect(planVoicedWindows(new Float32Array(10 * SR), SR)).toEqual([]);
  });
});
