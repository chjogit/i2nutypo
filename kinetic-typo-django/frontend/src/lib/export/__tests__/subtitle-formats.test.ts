import { describe, expect, it } from "vitest";
import type { LyricLine } from "@/types/project";
import { DEFAULT_SUBTITLES } from "@/store/project-store";
import { buildSubtitleFile, countSubtitleCues, type SubtitleFileOptions } from "../subtitle-formats";

const line = (i: number, start: number, end: number, clean: string, pron: string, trans: string) =>
  ({
    index: i,
    startTime: start,
    endTime: end,
    cleanText: clean,
    pronText: pron,
    transText: trans,
  }) as LyricLine;

const lines = [
  line(1, 75.5, 78.25, "君の名前を\n呼んだ", "키미노 나마에오 욘다", "너의 이름을 불렀어"),
  line(0, 3.2, 6, "夜に駆ける", "요루니 카케루", "밤을 달리다"),
  line(2, 78.25, 80, "{響く}", "", ""),
];

const opts = (over: Partial<SubtitleFileOptions>): SubtitleFileOptions => ({
  format: "srt",
  rows: { main: true, pron: true, trans: true },
  introGateSec: 0,
  subtitles: DEFAULT_SUBTITLES,
  mainFont: "'Noto Sans JP', sans-serif",
  aspectRatio: "16:9",
  title: "테스트",
  ...over,
});

describe("subtitle files", () => {
  it("writes SRT cues in time order with the chosen rows", () => {
    const srt = buildSubtitleFile(lines, opts({}));
    expect(srt.startsWith("1\n00:00:03,200 --> 00:00:06,000\n夜に駆ける\n요루니 카케루\n밤을 달리다\n")).toBe(
      true,
    );
    expect(srt).toContain("2\n00:01:15,500 --> 00:01:18,250\n君の名前を 呼んだ\n");
    const pronOnly = buildSubtitleFile(lines, opts({ rows: { main: false, pron: true, trans: false } }));
    // The third line has no pronunciation and drops out
    expect(pronOnly.trim().split("\n\n")).toHaveLength(2);
  });

  it("writes VTT with a header and dot milliseconds", () => {
    const vtt = buildSubtitleFile(lines, opts({ format: "vtt" }));
    expect(vtt.startsWith("WEBVTT\n\n00:00:03.200 --> 00:00:06.000\n")).toBe(true);
  });

  it("writes ASS with one style per row and override tags kept out of the text", () => {
    const ass = buildSubtitleFile(lines, opts({ format: "ass" }));
    expect(ass).toContain("PlayResX: 1280");
    expect(ass).toContain("Style: Pron,Noto Sans KR,22,&H0047E0FD");
    expect(ass).toContain("Style: Main,Noto Sans JP,34,");
    expect(ass).toContain(
      "Dialogue: 0,0:00:03.20,0:00:06.00,Main,,0,0,0,,{\\rMain}夜に駆ける\\N{\\rPron}요루니 카케루\\N{\\rTrans}밤을 달리다",
    );
    expect(ass).toContain("{\\rMain}響く");
  });

  it("writes LRC with a tag per row and a blank tag before gaps", () => {
    const lrc = buildSubtitleFile(
      lines,
      opts({ format: "lrc", rows: { main: true, pron: false, trans: true } }),
    );
    expect(lrc).toContain("[ti:테스트]");
    expect(lrc).toContain(
      "[00:03.20]夜に駆ける\n[00:03.20]밤을 달리다\n[00:06.00]\n[01:15.50]君の名前を 呼んだ",
    );
    // No gap between the last two lines, so no blank tag between them
    expect(lrc).toContain("[01:15.50]너의 이름을 불렀어\n[01:18.25]{響く}\n[01:20.00]\n");
  });

  it("leaves out lines inside the intro gate", () => {
    expect(countSubtitleCues(lines, { main: true, pron: true, trans: true }, 10)).toBe(2);
  });
});
