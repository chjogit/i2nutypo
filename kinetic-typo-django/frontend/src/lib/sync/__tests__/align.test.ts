import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { SAMPLE_LYRICS } from "@/lib/lyrics/samples";
import { alignLinesToTranscript, linesToLrc, resolveLineTimes, type TranscriptChunk } from "../align";
import { pronunciationSimilarity, toPronunciationKey } from "../pronunciation";

const opts = { duration: 40, introGateSec: 6 };

describe("pronunciation", () => {
  it("treats recognizer spellings as the same sound", () => {
    const sim = (a: string, b: string) =>
      pronunciationSimilarity(toPronunciationKey(a), toPronunciationKey(b));
    expect(sim("네가 업는 밤", "내가 없는 밤")).toBeGreaterThan(0.9);
    expect(sim("きみがいない", "キミガイナイ")).toBe(1);
    expect(sim("전혀 다른 말", "내가 없는 밤")).toBeLessThan(0.5);
  });
});

describe("alignLinesToTranscript", () => {
  const lines = parseLyrics(
    "가나다라 마바사\n그래 나 외로웠지만 덕분에\n차가운 목걸이가 조여\n꽤 멀리서 바라만 봐도",
    opts,
  );

  it("finds each line's opening in order, tolerating misspellings", () => {
    const chunks: TranscriptChunk[] = [
      { text: "음악", start: 0, end: 4 },
      { text: "가나다라 마바사", start: 7.1, end: 9 },
      { text: "그래 나 외로웟지만 덕분에", start: 10.4, end: 13 },
      { text: "아무 상관 없는 잡담", start: 13.5, end: 15 },
      { text: "차가운 목거리가 조여", start: 16.2, end: 18 },
      { text: "께 멀리서 바라만 바도", start: 20.0, end: 22 },
    ];
    const result = alignLinesToTranscript(lines, chunks, 0.7);
    expect(result.map((r) => r.time)).toEqual([7.1, 10.4, 16.2, 20.0]);
    expect(result.every((r) => r.similarity >= 0.7)).toBe(true);
  });

  it("leaves a line unmatched without losing the following ones", () => {
    const chunks: TranscriptChunk[] = [
      { text: "가나다라 마바사", start: 7, end: 9 },
      { text: "전혀 들리지 않음", start: 10, end: 12 },
      { text: "차가운 목걸이가 조여", start: 16, end: 18 },
      { text: "꽤 멀리서 바라만 봐도", start: 20, end: 22 },
    ];
    const result = alignLinesToTranscript(lines, chunks, 0.7);
    expect(result.map((r) => r.time)).toEqual([7, null, 16, 20]);
    const times = resolveLineTimes(lines, result, 40, 6);
    expect(times[0]).toBe(7);
    expect(times[1]).toBeGreaterThan(7);
    expect(times[1]).toBeLessThan(16);
    expect(times[2]).toBe(16);
  });

  it("matches Japanese blocks on the Japanese line and keeps subtitles when written back", () => {
    const ja = parseLyrics(SAMPLE_LYRICS["ja-JP"], opts);
    const chunks: TranscriptChunk[] = [
      { text: "君がいない夜 Without You", start: 5.2, end: 8.5 },
      { text: "孤独だったけど君のおかげで耐えられた", start: 9.6, end: 12.8 },
    ];
    const result = alignLinesToTranscript(ja, chunks, 0.7);
    expect(result[0].time).toBe(5.2);
    expect(result[1].time).toBe(9.6);
    const times = resolveLineTimes(ja, result, 40, 6);
    const lrc = linesToLrc(ja, times).split("\n");
    expect(lrc[0]).toBe(
      "[00:05.20] *君が* いない *夜* Without You | 키미가 이나이 요루 Without You | 네가 없는 밤 Without You",
    );
    // Round trip keeps the block intact
    const reparsed = parseLyrics(lrc.join("\n"), { duration: 40, introGateSec: 5.2 });
    expect(reparsed[0].startTime).toBe(5.2);
    expect(reparsed[0].pronText).toBe("키미가 이나이 요루 Without You");
  });
});
