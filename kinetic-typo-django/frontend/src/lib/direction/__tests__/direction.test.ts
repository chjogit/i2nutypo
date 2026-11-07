import { describe, expect, it } from "vitest";
import { planDirection, recommendDirection } from "../direction";
import { complementOf, beatPumpScale } from "@/lib/timeline-fx/render-fx";
import { parallaxPose, sanitizeAmbient, sanitizeMotionCurve } from "@/lib/render/depth-fx";
import { motionStyleOf } from "@/lib/render/kinetic/styles";

const input = {
  duration: 200,
  choruses: [
    { start: 40, end: 70 },
    { start: 120, end: 150 },
  ],
  sectionStarts: [20, 40, 90, 120],
  bars: [0, 2, 4, 6, 8],
  lineStarts: [5, 10, 15],
};

describe("direction", () => {
  it("recommends by tempo", () => {
    expect(recommendDirection(92, true).id).toBe("calm");
    expect(recommendDirection(170, true).id).toBe("impact");
    expect(recommendDirection(135, true).id).toBe("hybrid");
    expect(recommendDirection(135, false).id).toBe("calm");
    expect(recommendDirection(null, false).id).toBe("hybrid");
  });

  it("puts impact on the choruses only when mixed", () => {
    const p = planDirection("hybrid", input);
    expect(p.impact).toEqual(input.choruses);
    expect(p.parallax).toBeGreaterThan(0.3);
    expect(planDirection("calm", input).impact).toEqual([]);
    expect(planDirection("impact", input).impact).toEqual([{ start: 0, end: 200 }]);
    expect(planDirection("impact", input).cuts).toEqual([0, 4, 8]);
  });

  it("names no person or title", () => {
    for (const id of ["calm", "impact", "hybrid"] as const)
      expect(JSON.stringify(planDirection(id, input))).not.toMatch(/TEMACA|Tranq/i);
  });
});

describe("beat pumping and graphics", () => {
  it("pumps 105 % at half strength and 110 % at full on a full kick", () => {
    expect(beatPumpScale(0.5, 1)).toBeCloseTo(1.05);
    expect(beatPumpScale(1, 1)).toBeCloseTo(1.1);
    expect(beatPumpScale(1, 0)).toBe(1);
  });

  it("finds the complementary color", () => {
    expect(complementOf("#ff0000")).toBe("#00ffff");
    expect(complementOf("nope")).toBe("#00e5ff");
  });
});

describe("depth, particles and curves", () => {
  it("moves near layers more than far ones and keeps the edges covered", () => {
    const t = 4;
    const far = parallaxPose(1, 0.3, t, 1920, 1080);
    const near = parallaxPose(1, 1, t, 1920, 1080);
    expect(Math.abs(near.dx)).toBeGreaterThan(Math.abs(far.dx));
    for (const p of [far, near]) expect((p.scale - 1) * 960).toBeGreaterThanOrEqual(Math.abs(p.dx) - 1e-6);
    expect(parallaxPose(0, 1, t, 1920, 1080)).toEqual({ dx: 0, dy: 0, scale: 1 });
  });

  it("cleans saved particle and curve choices", () => {
    expect(sanitizeAmbient({ kind: "laser", amount: 9 })).toEqual({
      kind: "none",
      amount: 1,
      color: "secondary",
    });
    expect(sanitizeMotionCurve("bouncy")).toBe("bouncy");
    expect(sanitizeMotionCurve("x")).toBe("style");
  });

  it("swaps the motion style's curve", () => {
    const base = motionStyleOf({ motionStyle: "smooth_reveal" });
    const bouncy = motionStyleOf({ motionStyle: "smooth_reveal", motionCurve: "bouncy" });
    expect(base?.ease).toBeUndefined();
    expect(bouncy?.ease).toBeDefined();
    expect(bouncy?.ease?.(0.6)).toBeGreaterThan(1);
    expect(motionStyleOf({ motionStyle: "smooth_reveal", motionCurve: "bouncy" })).toBe(bouncy);
  });
});
