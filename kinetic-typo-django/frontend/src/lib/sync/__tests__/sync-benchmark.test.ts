import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { alignLinesToTranscript, type TranscriptChunk } from "../align";

// A measurable stand-in for "sync accuracy": the average share of each line's
// sounds found in the transcript (the % shown per line in the sync panel), and
// how far the placed start is from the truth. The transcripts below are what a
// recognizer writes when it hears the words right but spells them by sound
// (Korean) or in kana instead of the lyrics' kanji (Japanese), which used to
// count as misses. Lyrics are original lines written for this test.

const KO: [string, string][] = [
  ["웃고 있어도 눈물이 나", "웃꼬 이써도 눈무리 나"],
  ["없는 것 같이 굴어도", "엄는 걷 가치 구러도"],
  ["좋다고 말해 줘", "조타고 마래 줘"],
  ["읽지 못한 마음을 읽어", "익찌 모탄 마으믈 일거"],
  ["축하해 오늘 밤은 너의 것", "추카해 오늘 바믄 너에 걷"],
  ["값진 하루를 같이 걸어", "갑찐 하루를 가치 거러"],
  ["굳이 말하지 않아도 알아", "구지 마라지 아나도 아라"],
  ["꽃잎이 흩날리는 길 위에", "꼰니피 흔날리는 길 위에"],
];

const JA: [string, string, string][] = [
  ["君の名前を呼ぶ", "키미노 나마에오 요부", "きみのなまえをよぶ"],
  ["夜空に光る星", "요조라니 히카루 호시", "よぞらにひかるほし"],
  ["愛してると言えなくて", "아이시테루토 이에나쿠테", "あいしてるといえなくて"],
  ["明日の朝に会いに行く", "아시타노 아사니 아이니 이쿠", "あしたのあさにあいにいく"],
  ["君と見た夜空", "키미토 미타 요조라", "きみとみたよぞら"],
  ["光の中で笑う", "히카리노 나카데 와라우", "ひかりのなかでわらう"],
];

function run(lyricsText: string, heard: string[]) {
  const lines = parseLyrics(lyricsText, { duration: 200, introGateSec: 0 });
  const truth: number[] = [];
  const chunks: TranscriptChunk[] = [];
  let t = 5;
  heard.forEach((h) => {
    truth.push(t);
    const words = h.split(" ");
    words.forEach((w, k) => chunks.push({ text: w, start: t + k * 0.6, end: t + (k + 1) * 0.6 }));
    t += words.length * 0.6 + 2;
  });
  expect(lines.length).toBe(heard.length);
  const result = alignLinesToTranscript(lines, chunks, 0.9);
  const average = result.reduce((s, r) => s + r.similarity, 0) / result.length;
  const maxError = Math.max(...result.map((r, i) => Math.abs((r.estimate ?? -99) - truth[i])));
  return { average, maxError };
}

describe("sync accuracy benchmark", () => {
  it("Korean sung by sound scores as heard", () => {
    const { average, maxError } = run(
      KO.map(([l]) => l).join("\n"),
      KO.map(([, h]) => h),
    );
    expect(average).toBeGreaterThanOrEqual(0.9);
    expect(maxError).toBeLessThan(0.3);
  });

  it("Japanese kanji lyrics match a kana transcript through the pronunciation row", () => {
    const { average, maxError } = run(
      JA.map(([l, p]) => `${l} | ${p}`).join("\n"),
      JA.map(([, , h]) => h),
    );
    expect(average).toBeGreaterThanOrEqual(0.9);
    expect(maxError).toBeLessThan(0.3);
  });
});
