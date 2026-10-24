import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "@/store/project-store";
import type { TimedLyric } from "@/lib/lyrics/parse";
import { pickedLooks } from "@/lib/render/looks/presets";
import { composeLines, composeStyle, rerollMotion } from "../auto-compose";
import { mulberry32 } from "@/lib/random";

const line = (startTime: number, lock = false): TimedLyric => ({
  startTime,
  endTime: startTime + 2,
  rawText: "a",
  pronText: "",
  transText: "",
  offsetX: 0,
  offsetY: 0,
  lineStyle: lock ? { lock: 1, motion: 3 } : {},
  overlap: false,
});

describe("auto composition", () => {
  it("gives the same look for the same seed, with one to three themes", () => {
    const a = composeStyle(DEFAULT_STYLE, 1234);
    expect(composeStyle(DEFAULT_STYLE, 1234)).toEqual(a);
    const picked = pickedLooks({ ...DEFAULT_STYLE, ...a });
    expect(picked.length).toBeGreaterThanOrEqual(1);
    expect(picked.length).toBeLessThanOrEqual(3);
  });

  it("rolls only unlocked lines, never the same motion twice in a row", () => {
    const style = { ...DEFAULT_STYLE, ...composeStyle(DEFAULT_STYLE, 7) };
    const out = composeLines([line(0), line(2), line(4, true), line(6)], style, 7);
    expect(out[2].lineStyle).toEqual({ lock: 1, motion: 3 });
    expect(out[0].lineStyle.motion).toBeGreaterThan(0);
    expect(out[1].lineStyle.motion).not.toBe(out[0].lineStyle.motion);
  });

  it("rerolls to a different motion", () => {
    const l = { ...line(0), lineStyle: { motion: 1 } };
    for (let i = 0; i < 10; i++) expect(rerollMotion(l, DEFAULT_STYLE, mulberry32(i))).not.toBe(1);
  });
});
