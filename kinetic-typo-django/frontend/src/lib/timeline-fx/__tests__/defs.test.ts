import { describe, expect, it } from "vitest";
import {
  adjustStrength,
  makeAdjust,
  makeTransition,
  sanitizeAdjustClips,
  sanitizeElementMotion,
  sanitizeTransitions,
  transitionPhase,
  transitionsAtCuts,
  TRANSITIONS,
} from "../defs";
import { MOTION_PACKS } from "../packs";

describe("timeline effects", () => {
  it("centers a transition on its cut and keeps it inside the song", () => {
    const c = makeTransition("whip", 10, 60);
    expect((c.start + c.end) / 2).toBeCloseTo(10, 1);
    const late = makeTransition("ink", 59.9, 60);
    expect(late.end).toBeLessThanOrEqual(60);
  });

  it("puts transitions on cuts without overlapping, cycling the kinds", () => {
    const first = makeTransition("flash", 5, 60);
    const out = transitionsAtCuts([first], [0, 5, 5.1, 10, 20, 59.99], ["zoom", "glitch"], 60);
    expect(out.map((c) => c.kind)).toEqual(["flash", "zoom", "glitch"]);
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end);
  });

  it("covers fully at the cut and not at the ends", () => {
    const c = { id: "a", start: 1, end: 2, kind: "dip" as const, color: "bg" as const };
    expect(transitionPhase(c, 1.5)?.cover).toBeCloseTo(1);
    expect(transitionPhase(c, 1)?.cover).toBeCloseTo(0);
    expect(transitionPhase(c, 2)).toBeNull();
  });

  it("fades an adjustment layer in and out", () => {
    const a = { ...makeAdjust("mono", 0, 4), amount: 1, fade: 1 };
    expect(adjustStrength(a, 0.5)).toBeCloseTo(0.5, 1);
    expect(adjustStrength(a, 2)).toBeCloseTo(1);
    expect(adjustStrength(a, 5)).toBe(0);
  });

  it("drops broken saved clips and clamps the rest", () => {
    expect(
      sanitizeTransitions([
        { kind: "nope", start: 0, end: 1 },
        { kind: "whip", start: 2, end: 1 },
        { kind: "whip", start: 1, end: 2, color: "x" },
      ]),
    ).toMatchObject([{ kind: "whip", color: "accent" }]);
    expect(sanitizeAdjustClips([{ kind: "shake", start: 0, end: 1, amount: 9 }])[0].amount).toBe(1);
    expect(sanitizeElementMotion({ mode: "nope", amount: -1 })).toMatchObject({ mode: "organic", amount: 0 });
  });

  it("builds packs only from known transitions", () => {
    const ids = new Set(TRANSITIONS.map((t) => t.id));
    for (const p of MOTION_PACKS) for (const k of p.transitions) expect(ids.has(k)).toBe(true);
  });
});
