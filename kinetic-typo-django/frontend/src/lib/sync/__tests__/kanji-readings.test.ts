import { describe, expect, it } from "vitest";
import { pronunciationSimilarity, toPronunciationKey } from "../pronunciation";
import { learnKanjiReadings, readKanjiRuns } from "../kanji-readings";

describe("kanji readings from the pronunciation row", () => {
  it("reads each kanji run off the Hangul pronunciation", () => {
    expect(Object.fromEntries(readKanjiRuns("愛してる", "아이시테루") ?? [])).toEqual({ 愛: "ai" });
    expect(Object.fromEntries(readKanjiRuns("君の名前を呼ぶ", "키미노 나마에오 요부") ?? [])).toEqual({
      君: "kimi",
      名前: "namae",
      呼: "yo",
    });
  });

  it("refuses a pronunciation row that does not belong to the line", () => {
    expect(readKanjiRuns("愛してる", "전혀 다른 말입니다")).toBeNull();
  });

  it("lets kanji lyrics match a kana transcript", () => {
    const kanji = learnKanjiReadings([
      { cleanText: "君の名前を呼ぶ", pronText: "키미노 나마에오 요부" },
      { cleanText: "夜空に光る星", pronText: "요조라니 히카루 호시" },
    ]);
    const lyric = toPronunciationKey("夜空に光る星", kanji);
    expect(lyric).toBe(toPronunciationKey("よぞらにひかるほし"));
    const before = pronunciationSimilarity(
      toPronunciationKey("夜空に光る星"),
      toPronunciationKey("よぞらにひかるほし"),
    );
    expect(before).toBeLessThan(0.5);
    expect(pronunciationSimilarity(lyric, toPronunciationKey("夜空にひかる星", kanji))).toBe(1);
  });
});
