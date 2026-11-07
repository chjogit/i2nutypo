import { describe, expect, it } from "vitest";
import { edgeGain, pickHighlight } from "../highlight";

const sections = [
  { kind: "verse" as const, startTime: 10, endTime: 40 },
  { kind: "chorus" as const, startTime: 42, endTime: 70 },
  { kind: "chorus" as const, startTime: 120, endTime: 150 },
];

describe("short highlight", () => {
  it("starts just before the first chorus, on a close beat", () => {
    const h = pickHighlight({ lineStarts: [10, 42], sections, duration: 200, beats: [41.2, 41.5, 42] }, 30);
    expect(h.reason).toBe("chorus");
    expect(h.start).toBe(41.5);
    expect(h.end).toBe(71.5);
  });

  it("takes the busiest stretch when there is no chorus", () => {
    const lineStarts = [5, 30, 31, 32, 33, 34, 60];
    const h = pickHighlight({ lineStarts, sections: [], duration: 100 }, 15);
    expect(h.reason).toBe("dense");
    expect(h.start).toBeCloseTo(29.4);
  });

  it("stays inside the song", () => {
    const h = pickHighlight(
      { lineStarts: [], sections: [{ kind: "chorus", startTime: 95, endTime: 100 }], duration: 100 },
      30,
    );
    expect(h.end).toBe(100);
    expect(h.start).toBe(70);
    expect(pickHighlight({ lineStarts: [], sections: [], duration: 10 }, 30)).toEqual({
      start: 0,
      end: 10,
      reason: "start",
    });
  });

  it("fades the song in and out at the cut", () => {
    expect(edgeGain(0, 30, 0.4, 1.2)).toBe(0);
    expect(edgeGain(15, 30, 0.4, 1.2)).toBe(1);
    expect(edgeGain(30, 30, 0.4, 1.2)).toBeCloseTo(0);
    expect(edgeGain(0.2, 30, 0.4, 1.2)).toBeGreaterThan(0.5);
  });
});
