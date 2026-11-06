import { describe, expect, it } from "vitest";
import { cloudAt, dotsOf, shardsOf } from "../pieces";
import { applyMotion, MOTION_BY_ID, motionNumber, MOTIONS } from "../motions";
import type { MotionFrame } from "../motions";

const area = (s: { a: number[]; b: number[]; c: number[] }) =>
  Math.abs((s.b[0] - s.a[0]) * (s.c[1] - s.a[1]) - (s.c[0] - s.a[0]) * (s.b[1] - s.a[1])) / 2;

describe("letters in pieces", () => {
  const box = { x0: 100, y0: 200, x1: 900, y1: 300 };

  it("cuts the text box into triangles that cover it exactly, the same way every time", () => {
    const shards = shardsOf(box, 7);
    expect(shards.length).toBeGreaterThan(20);
    expect(shards.length).toBeLessThanOrEqual(200);
    const total = shards.reduce((sum, s) => sum + area(s), 0);
    expect(total).toBeCloseTo(800 * 100, 0);
    expect(shardsOf(box, 7)).toEqual(shards);
    expect(shardsOf(box, 8)).not.toEqual(shards);
  });

  it("keeps the dot count bounded on a long line by making the dots bigger", () => {
    const small = dotsOf(box, 1, 6);
    expect(small.dots.length).toBeLessThanOrEqual(1000);
    const huge = dotsOf({ x0: 0, y0: 0, x1: 3840, y1: 1000 }, 1, 6);
    expect(huge.dots.length).toBeLessThanOrEqual(1000);
    expect(huge.size).toBeGreaterThan(6);
  });

  it("returns nothing for an empty box", () => {
    expect(shardsOf({ x0: 5, y0: 5, x1: 5, y1: 9 }, 1)).toEqual([]);
    expect(dotsOf({ x0: 5, y0: 5, x1: 5, y1: 9 }, 1, 6).dots).toEqual([]);
  });

  it("waits in the same cloud for any line, inside the frame", () => {
    for (const r of [0, 0.2, 0.5, 0.99]) {
      const [x, y] = cloudAt(r, 1920, 1080, 0);
      expect(cloudAt(r, 1920, 1080, 0)).toEqual([x, y]);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1920);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1080);
    }
  });

  it("adds the shatter and dust motions at the end, so saved motion numbers keep their meaning", () => {
    expect(motionNumber("shatter_gather")).toBe(MOTIONS.length - 1);
    expect(motionNumber("dust_gather")).toBe(MOTIONS.length);
  });

  it("falls back to drawing the line whole when there is no canvas to cut up", () => {
    let drawn = 0;
    const ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      scale() {},
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    } as unknown as MotionFrame["ctx"];
    for (const id of ["shatter_gather", "dust_gather"]) {
      const m: MotionFrame = {
        ctx,
        W: 1280,
        H: 720,
        elapsed: 0.2,
        dur: 3,
        energy: 0,
        cx: 640,
        cy: 360,
        seed: 1,
        capture: () => {},
      };
      applyMotion(MOTION_BY_ID.get(id) ?? null, m, () => drawn++, true);
      applyMotion(MOTION_BY_ID.get(id) ?? null, { ...m, elapsed: 2.9 }, () => drawn++, true);
    }
    expect(drawn).toBe(4);
  });
});
