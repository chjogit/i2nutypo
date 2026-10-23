import { describe, expect, it } from "vitest";
import { findOnScreenLines } from "@/lib/render/render-frame";
import { syncLineTimes, type TranscriptChunk } from "@/lib/sync/align";
import { autoDistributeLyrics, parseLyrics, serializeTimedLyrics, toEditableLyrics } from "../parse";
import { normalizeMultilineJapaneseBlocks } from "../triplet";

const opts = { duration: 40, introGateSec: 6 };

describe("overlapping (&) lines", () => {
  it("keeps a stacked & block together after its main block", () => {
    const text = [
      "夢を見てた",
      "유메오 미테타",
      "꿈을 꾸고 있었어",
      "& 君がいた",
      "& 키미가 이타",
      "& 네가 있었어",
      "朝",
      "아사",
      "아침",
    ].join("\n");
    expect(normalizeMultilineJapaneseBlocks(text)).toEqual([
      "夢を見てた | 유메오 미테타 | 꿈을 꾸고 있었어",
      "& 君がいた | 키미가 이타 | 네가 있었어",
      "朝 | 아사 | 아침",
    ]);
    // "&" on the first row only means the same
    const firstOnly = text.replace("& 키미가", "키미가").replace("& 네가", "네가");
    expect(normalizeMultilineJapaneseBlocks(firstOnly)[1]).toBe("& 君がいた | 키미가 이타 | 네가 있었어");
  });

  it("starts and ends with the line it overlaps, without moving the next line", () => {
    const lines = parseLyrics(
      "[00:10.00] 夢を見てた | 유메 | 꿈\n& 君がいた | 키미 | 너\n[00:14.00] 朝 | 아사 | 아침",
      opts,
    );
    expect(lines.map((l) => [l.cleanText, l.startTime, l.endTime, l.overlap])).toEqual([
      ["夢を見てた", 10, 14, false],
      ["君がいた", 10, 14, true],
      ["朝", 14, 40, false],
    ]);
    expect(lines[1].pronText).toBe("키미");
  });

  it("can start later and run past the next line with its own times", () => {
    const lines = parseLyrics("[00:10.00] 하나\n[00:12.00~00:16.00] & 둘\n[00:14.00] 셋", opts);
    expect(lines.map((l) => [l.cleanText, l.startTime, l.endTime])).toEqual([
      ["하나", 10, 14],
      ["둘", 12, 16],
      ["셋", 14, 40],
    ]);
  });

  it("treats & on the very first line as an ordinary line", () => {
    expect(parseLyrics("& 하나\n둘", opts)[0].overlap).toBe(false);
  });

  it("spreads untimed lyrics over the ordinary lines only", () => {
    const lrc = autoDistributeLyrics("하나\n& 하나 코러스\n둘", 40, 6);
    const lines = parseLyrics(lrc, opts);
    expect(lines[1].overlap).toBe(true);
    expect(lines[1].startTime).toBe(lines[0].startTime);
    expect(lines[2].startTime).toBeGreaterThan(lines[0].startTime);
  });

  it("round-trips through the saved and editable text", () => {
    const text = "[00:10.00] 하나\n[00:10.00] & 코러스\n[00:12.00~00:16.00] & 둘\n[00:14.00] 셋";
    const lines = parseLyrics(text, opts);
    expect(serializeTimedLyrics(lines, 40)).toBe(text);
    expect(toEditableLyrics(lines)).toBe("하나\n& 코러스\n& 둘\n셋");
  });

  it("is drawn with the main line, and alone once the main line ends", () => {
    const lines = parseLyrics("[00:10.00] 하나\n[00:12.00~00:16.00] & 둘\n[00:14.00] 셋", opts);
    expect(findOnScreenLines(lines, 11)).toMatchObject({ line: { cleanText: "하나" }, overlaps: [] });
    const both = findOnScreenLines(lines, 13);
    expect(both?.line.cleanText).toBe("하나");
    expect(both?.next?.cleanText).toBe("셋");
    expect(both?.overlaps.map((l) => l.cleanText)).toEqual(["둘"]);
    expect(findOnScreenLines(lines, 15)?.overlaps.map((l) => l.cleanText)).toEqual(["둘"]);
  });

  it("is left out of the sync and moves with the line it overlaps", () => {
    const lines = parseLyrics(
      "[00:08.00] 가나다라 마바사\n[00:09.00] & 아아아\n[00:12.00] 차가운 목걸이가 조여",
      opts,
    );
    const chunks: TranscriptChunk[] = [
      { text: "가나다라 마바사", start: 10, end: 12 },
      { text: "차가운 목걸이가 조여", start: 15, end: 17 },
    ];
    const { alignments, startTimes } = syncLineTimes(lines, chunks, 0.7, 40, 6);
    expect(alignments.map((a) => a.lineIdx)).toEqual([0, 2]);
    expect(startTimes).toEqual([10, 11, 15]);
  });
});
