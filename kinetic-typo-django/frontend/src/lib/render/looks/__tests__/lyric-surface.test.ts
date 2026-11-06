import { describe, expect, it } from "vitest";
import { paneAround, poseAt, project, projectedBox, surfaceOf } from "../lyric-surface";

describe("lyric glass and depth", () => {
  it("is off unless asked for, and keeps depth within 0..1", () => {
    expect(surfaceOf({})).toBeNull();
    expect(surfaceOf({ lyricGlass: "off", lyricDepth: 0 })).toBeNull();
    expect(surfaceOf({ lyricGlass: "frost" })).toEqual({ glass: "frost", depth: 0 });
    expect(surfaceOf({ lyricDepth: 4 })).toEqual({ glass: "off", depth: 1 });
    expect(surfaceOf({ lyricGlass: "nope" as never, lyricDepth: Number.NaN })).toBeNull();
  });

  it("puts the pane around the text with room on every side, rounded no more than half its height", () => {
    const box = { x0: 400, y0: 300, x1: 900, y1: 360 };
    const p = paneAround(box, 7.2);
    expect(p.x0).toBeLessThan(box.x0);
    expect(p.x1).toBeGreaterThan(box.x1);
    expect(p.y0).toBeLessThan(box.y0);
    expect(p.y1).toBeGreaterThan(box.y1);
    expect(p.r).toBeLessThanOrEqual((p.y1 - p.y0) / 2 + 1e-9);
    expect((p.x0 + p.x1) / 2).toBeCloseTo(650);
  });

  it("leaves a flat card where it is", () => {
    const flat = { tiltX: 0, tiltY: 0, z: 0 };
    expect(project(100, 50, 640, 360, 1400, flat)).toEqual({ x: 100, y: 50, w: 1 });
  });

  it("brings the line from far away and settles it, the same at the same moment", () => {
    const start = poseAt(1, 0, 0, 10, 3);
    const settled = poseAt(1, 2, 0.5, 10, 3);
    expect(start.z).toBeGreaterThan(settled.z);
    expect(start.tiltX).toBeGreaterThan(settled.tiltX);
    expect(poseAt(1, 2, 0.5, 10, 3)).toEqual(settled);
    expect(poseAt(0, 0, 0, 10, 3)).toEqual({ tiltX: 0, tiltY: 0, z: 0 });
  });

  it("draws a leaning card smaller at the top than at the bottom", () => {
    const b = projectedBox({ x0: 340, y0: 300, x1: 940, y1: 420 }, 640, 360, 1400, {
      tiltX: 0.4,
      tiltY: 0,
      z: 0,
    });
    const top = project(340, 300, 640, 360, 1400, { tiltX: 0.4, tiltY: 0, z: 0 });
    const bottom = project(340, 420, 640, 360, 1400, { tiltX: 0.4, tiltY: 0, z: 0 });
    expect(top.x).toBeGreaterThan(bottom.x);
    expect(b.y1 - b.y0).toBeLessThan(120);
  });
});
