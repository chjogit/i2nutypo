import { describe, expect, it } from "vitest";
import {
  autoDistributeLyrics,
  parseLyrics,
  hasTimestamps,
  serializeTimedLyrics,
  toEditableLyrics,
} from "../parse";
import { detectLyricsLanguage, detectWordSemanticEffect, tokenizeMultilingualLine } from "../tokenize";
import { SAMPLE_LYRICS } from "../samples";

const opts = { duration: 32, introGateSec: 6 };

describe("parseLyrics", () => {
  it("reads LRC times and chains end times to the next line", () => {
    const lines = parseLyrics(SAMPLE_LYRICS["ko-KR"], opts);
    expect(lines).toHaveLength(7);
    expect(lines[0].startTime).toBe(6);
    expect(lines[0].endTime).toBe(9.2);
    expect(lines.at(-1)?.endTime).toBe(32);
    expect(lines[0].words.map((w) => w.text)).toEqual(["네가", "없는", "밤", "Without", "You"]);
  });

  it("never starts a line before the intro gate", () => {
    const lines = parseLyrics("[00:01.00] a\n[00:03.00] b", opts);
    expect(lines.map((l) => l.startTime)).toEqual([6, 8]);
  });

  it("spreads untimed lines after the gate", () => {
    const lines = parseLyrics("하나\n둘", opts);
    expect(lines[0].startTime).toBe(6);
    expect(lines[1].startTime).toBe(19);
  });

  it("spaces words over 82% of the line", () => {
    const [line] = parseLyrics("[00:06.00] 가 나\n[00:10.00] 다", opts);
    expect(line.words[1].endOffset).toBeCloseTo(4 * 0.82);
  });

  it("marks starred and semantic words", () => {
    expect(detectWordSemanticEffect("*네가*")).toEqual({ effect: "impact", isAccent: true });
    expect(detectWordSemanticEffect("멀리서")).toEqual({ effect: "stretch", isAccent: true });
    expect(detectWordSemanticEffect("그래")).toEqual({ effect: "normal", isAccent: false });
  });
});

describe("tokenizeMultilingualLine", () => {
  it("chunks Japanese without spaces", () => {
    expect(tokenizeMultilingualLine("君がいない夜").length).toBeGreaterThan(1);
  });
});

describe("autoDistributeLyrics", () => {
  it("re-times plain lines from the gate", () => {
    expect(autoDistributeLyrics("a\n[00:01.00] b", 32, 6)).toBe("[00:06.00] a\n[00:10.20] b");
  });
});

describe("timed lyrics editing", () => {
  const opts = { duration: 40, introGateSec: 2 };

  it("reads an explicit end time and writes it back only when there is a gap", () => {
    const lines = parseLyrics("[00:03.00~00:05.50] 첫 줄\n[00:08.00] 둘째 줄", opts);
    expect(lines[0].endTime).toBe(5.5);
    expect(lines[1].endTime).toBe(40);
    expect(serializeTimedLyrics(lines, 40)).toBe("[00:03.00~00:05.50] 첫 줄\n[00:08.00] 둘째 줄");
  });

  it("keeps a line's own position and style through a round trip", () => {
    const text = "[00:03.00~00:05.50;x=0.10;y=-0.25;glitch=0.80;size=1.50] 첫 줄\n[00:08.00] 둘째 줄";
    const lines = parseLyrics(text, opts);
    expect([lines[0].offsetX, lines[0].offsetY]).toEqual([0.1, -0.25]);
    expect(lines[0].lineStyle).toEqual({ glitch: 0.8, size: 1.5 });
    expect(lines[1].lineStyle).toEqual({});
    expect(serializeTimedLyrics(lines, 40)).toBe(text);
    // Out-of-range values are clamped and unknown keys ignored
    const odd = parseLyrics("[00:03.00;x=0.9;shake=3;color=red] 멀리", opts)[0];
    expect([odd.offsetX, odd.lineStyle]).toEqual([0.45, { shake: 1 }]);
  });

  it("does not let an end time run past the next line", () => {
    const lines = parseLyrics("[00:03.00~00:09.00] 첫 줄\n[00:08.00] 둘째 줄", opts);
    expect(lines[0].endTime).toBe(8);
  });

  it("shows lyrics without times, stacking Japanese blocks so they merge again", () => {
    const lines = parseLyrics(
      "[00:03.00] 君がいない夜 | 키미가 이나이 요루 | 네가 없는 밤\n[00:06.00] Hello",
      opts,
    );
    const text = toEditableLyrics(lines);
    expect(text).toBe("君がいない夜\n키미가 이나이 요루\n네가 없는 밤\nHello");
    const again = parseLyrics(text, opts);
    expect(again.map((l) => l.pronText)).toEqual(["키미가 이나이 요루", ""]);
    expect(hasTimestamps(text)).toBe(false);
  });
});

describe("detectLyricsLanguage", () => {
  it("counts kanji as Japanese and keeps mostly-Japanese lines with Korean words Japanese", () => {
    expect(detectLyricsLanguage("君の声 사랑해 사랑")).toBe("ja-JP");
    expect(detectLyricsLanguage("孤独\n코도쿠")).toBe("ja-JP");
    expect(detectLyricsLanguage("그래 나 외로웠지만")).toBe("ko-KR");
    expect(detectLyricsLanguage("Without You")).toBe("en-US");
  });
});

describe("manual line breaks", () => {
  it("keeps /n in the text, turns it into a newline for drawing and marks the word after it", () => {
    const [line] = parseLyrics("[00:07.00] 変わらぬ人の/n惨さに近い | 카와라누 히토노 무고사니 치카이", opts);
    expect(line.rawText).toBe("変わらぬ人の/n惨さに近い");
    expect(line.cleanText).toBe("変わらぬ人の\n惨さに近い");
    const first = line.words.findIndex((w) => w.breakBefore);
    expect(
      line.words
        .slice(0, first)
        .map((w) => w.text)
        .join(""),
    ).toBe("変わらぬ人の");
    expect(
      line.words
        .slice(first)
        .map((w) => w.text)
        .join(""),
    ).toBe("惨さに近い");
    expect(line.words.filter((w) => w.breakBefore)).toHaveLength(1);
  });
});
