import { describe, expect, it } from "vitest";
import { parseLyrics, serializeTimedLyrics, type TimedLyric } from "../parse";
import { currentTiming, moveMark, stampMark, timingLabels, timingUnit } from "../timing";
import { lineGlyphs } from "@/lib/render/looks/glyphs";
import { rowWidth, wrapWords } from "@/lib/render/looks/words";
import type { Ctx2D } from "@/lib/render/motifs";

const opts = { duration: 30, introGateSec: 0 };
const toTimed = (l: ReturnType<typeof parseLyrics>[number]): TimedLyric => ({ ...l });

describe("detail timing", () => {
  it("places words at the saved shares of the line", () => {
    const [line] = parseLyrics("[00:10.00~00:14.00;t=0,0.25,0.5] 하나 둘 셋", opts);
    expect(line.words.map((w) => w.startOffset)).toEqual([0, 1, 2]);
    expect(line.words[0].endOffset).toBe(1);
    expect(timingUnit(line)).toBe("word");
    expect(currentTiming(line, "word")).toEqual([0, 0.25, 0.5]);
  });

  it("times each character when there is one share per character", () => {
    const [line] = parseLyrics("[00:10.00~00:12.00;t=0,0.1,0.2,0.3] 君の 名前", opts);
    expect(timingUnit(line)).toBe("char");
    expect(timingLabels(line, "char")).toEqual(["君", "の", "名", "前"]);
    expect(line.words[0].chars).toEqual([0, 0.2]);
    expect(line.words[1].startOffset).toBe(0.4);
    const glyphs = lineGlyphs(line, 0.3);
    // 君 and の have appeared, 名 is still waiting
    expect(glyphs.filter((g) => g.ch !== " ").map((g) => g.wElapsed >= 0)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("ignores a timing that no longer matches the text", () => {
    const [line] = parseLyrics("[00:10.00~00:14.00;t=0,0.5] 하나 둘 셋", opts);
    expect(line.timing).toBeUndefined();
    expect(line.words[1].startOffset).toBeGreaterThan(0);
  });

  it("keeps the timing through writing the lyrics back", () => {
    const lines = parseLyrics("[00:10.00~00:14.00;t=0,0.3,0.55] 하나 둘 셋", opts);
    const text = serializeTimedLyrics(lines.map(toTimed), 30);
    expect(text).toContain("t=0,0.3,0.55");
    expect(parseLyrics(text, opts)[0].words[2].startOffset).toBeCloseTo(2.2);
  });

  it("keeps marks in order while dragging and tapping", () => {
    expect(moveMark([0, 0.3, 0.6], 1, 0.9)).toEqual([0, 0.6, 0.6]);
    expect(moveMark([0.2, 0.3, 0.6], 0, -1)).toEqual([0, 0.3, 0.6]);
    expect(stampMark([0, 0.1, 0.2], 1, 0.5)).toEqual([0, 0.5, 0.5]);
  });

  it("lays out a character-timed word as joined characters without word gaps", () => {
    const [line] = parseLyrics("[00:00.00~00:04.00;t=0,0.1,0.2,0.5,0.6] ab cde", opts);
    const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as Ctx2D;
    const { rows, gap } = wrapWords(ctx, line, 0.5, 1000);
    expect(rows[0].map((it) => it.text)).toEqual(["a", "b", "c", "d", "e"]);
    expect(rows[0].map((it) => it.joined ?? false)).toEqual([false, true, false, true, true]);
    expect(rowWidth(rows[0], gap)).toBe(50 + gap);
  });
});
