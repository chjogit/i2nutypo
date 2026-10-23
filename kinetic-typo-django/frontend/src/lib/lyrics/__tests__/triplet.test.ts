import { describe, expect, it } from "vitest";
import { normalizeMultilineJapaneseBlocks, splitLyricTriplet } from "../triplet";
import { parseLyrics, autoDistributeLyrics } from "../parse";
import { SAMPLE_LYRICS } from "../samples";

describe("normalizeMultilineJapaneseBlocks", () => {
  it("merges Japanese + pronunciation + meaning", () => {
    expect(
      normalizeMultilineJapaneseBlocks("[00:06.00] 君がいない夜\n키미가 이나이 요루\n네가 없는 밤"),
    ).toEqual(["[00:06.00] 君がいない夜 | 키미가 이나이 요루 | 네가 없는 밤"]);
  });

  it("merges a Japanese line with one Korean line", () => {
    expect(normalizeMultilineJapaneseBlocks("夜\n요루\n[00:09.00] 朝")).toEqual([
      "夜 | 요루",
      "[00:09.00] 朝",
    ]);
  });

  it("does not swallow a timestamped Korean line", () => {
    expect(normalizeMultilineJapaneseBlocks("夜\n[00:09.00] 밤")).toEqual(["夜", "[00:09.00] 밤"]);
  });

  it("leaves Korean-only lyrics and pre-split text alone", () => {
    expect(normalizeMultilineJapaneseBlocks("하나\n둘\n셋")).toEqual(["하나", "둘", "셋"]);
    expect(normalizeMultilineJapaneseBlocks("夜 | 요루\n朝\n아사")).toEqual(["夜 | 요루", "朝", "아사"]);
  });
});

describe("splitLyricTriplet", () => {
  it("splits on | and trims", () => {
    expect(splitLyricTriplet("君 |키미| 너")).toEqual({ mainRaw: "君", pronText: "키미", transText: "너", overlap: false });
    expect(splitLyricTriplet("君")).toEqual({ mainRaw: "君", pronText: "", transText: "", overlap: false });
  });
});

describe("parseLyrics with subtitles", () => {
  const lines = parseLyrics(SAMPLE_LYRICS["ja-JP"], { duration: 32, introGateSec: 6 });

  it("animates only the Japanese text", () => {
    expect(lines).toHaveLength(7);
    expect(lines[0].cleanText).toBe("君が いない 夜 Without You");
    expect(lines[0].words.map((w) => w.text)).toEqual(["君が", "いない", "夜", "Without", "You"]);
    expect(lines[0].pronText).toBe("키미가 이나이 요루 Without You");
    expect(lines[0].transText).toBe("네가 없는 밤 Without You");
    expect(lines[1].startTime).toBe(9.2);
  });

  it("keeps blocks together when auto-distributing", () => {
    const out = autoDistributeLyrics("夜\n요루\n밤\n朝\n아사\n아침", 32, 6).split("\n");
    expect(out).toEqual(["[00:06.00] 夜 | 요루 | 밤", "[00:10.20] 朝 | 아사 | 아침"]);
  });
});
