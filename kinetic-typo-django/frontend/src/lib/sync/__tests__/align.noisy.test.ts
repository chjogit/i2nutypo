import { expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { alignLinesToTranscript, resolveLineTimes, type TranscriptChunk } from "../align";

// Korean pop lyrics (original lines written for this test) with English phrases
const KO = [
  "네가 없는 밤 Without You",
  "그래 나 외로웠지만 덕분에 버텼던 Tonight",
  "그 말은 하기 싫어 Goodbye 차라리 대신에 GoodNight",
  "꽤 멀리서 바라만 봐도 서로가 웃고 있어",
  "차가운 목걸이가 조여 숨이 안 쉬어졌잖아",
  "사실 그대로 돌아가고파 I Want You Back",
  "잠에 들지를 못하잖아 네가 없는 밤",
  "창문 너머 불빛들이 하나둘 꺼져가",
  "아무 말 없이 걷던 그 길 위에서",
  "너의 이름을 다시 불러 보네",
  "Baby don't go 아직 난 여기 있어",
  "흩어진 기억들을 모아서",
  "다시 한 번만 내게 돌아와 줘",
  "네가 없는 밤 Without You",
];
// What a recognizer plausibly writes for each line: misspellings, English in Hangul, dropped openings, missing lines
const HEARD = [
  "네가 업는 밤 위다웃 유",
  "그래 나 외로웟지만 덕분에 버텻던 투나잇",
  "그 마른 하기 시러 굿바이 차라리 대시네 굿나잇",
  "멀리서 바라만 바도 서로가 웃꼬 이써",
  "차가운 목거리가 조여 수미 안 쉬어졋자나",
  "사실 그대로 도라가고파 아이 원트 유 백",
  null, // missed entirely
  "창문 너머 불빛드리 하나둘 꺼져가",
  "아무 마 업시 걷던 그 기 위에서",
  "너에 이르믈 다시 불러 보내",
  "베이비 돈 고 아직 난 여기 이써",
  "허트진 기억드를 모아서",
  "다시 한번만 내게 도라와 줘",
  "네가 엄는 밤 위드아웃 유",
];

let seed = 1;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function corrupt(word: string, rate: number): string {
  return Array.from(word)
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (c < 0xac00 || c > 0xd7a3 || rand() > rate) return ch;
      return String.fromCharCode(0xac00 + Math.floor(rand() * 11172));
    })
    .join("");
}
let HARSH = 0;

function simulate(segmentLevel: boolean) {
  const truth: number[] = [];
  const chunks: TranscriptChunk[] = [{ text: "자막 제공 및 광고", start: 0, end: 5 }];
  let t = 8;
  const words: TranscriptChunk[] = [];
  KO.forEach((line, i) => {
    truth.push(t);
    const dur = 3 + (line.length % 4) * 0.5;
    const heard = HEARD[i];
    if (heard) {
      let ws = heard.split(" ").map((w) => corrupt(w, HARSH));
      if (HARSH) ws = ws.filter(() => rand() > 0.15).concat(rand() < 0.3 ? ["음"] : []);
      if (ws.length === 0) ws = ["음"];
      const per = dur / ws.length;
      // Recognizer timestamps jitter by up to ±0.3 s
      const jitter = ((i * 37) % 7) / 10 - 0.3;
      ws.forEach((w, k) =>
        words.push({ text: w, start: t + k * per + jitter, end: t + (k + 1) * per + jitter }),
      );
    }
    t += dur + 0.8;
  });
  if (!segmentLevel) return { truth, chunks: [...chunks, ...words] };
  // Segment level: two or three lines merged into one chunk, with only its start and end known
  let k = 0;
  while (k < words.length) {
    const take = words.slice(k, k + 9 + (k % 4));
    chunks.push({
      text: take.map((w) => w.text).join(" "),
      start: take[0].start,
      end: take[take.length - 1].end,
    });
    k += take.length;
  }
  return { truth, chunks };
}

function linesWithinHalfSecond(corruption: number, segmentLevel: boolean, threshold: number): number {
  HARSH = corruption;
  seed = 7;
  const { truth, chunks } = simulate(segmentLevel);
  const lines = parseLyrics(KO.join("\n"), { duration: 120, introGateSec: 6 });
  const alignments = alignLinesToTranscript(lines, chunks, threshold);
  const times = resolveLineTimes(lines, alignments, 120, 6);
  return times.filter((t, i) => Math.abs(t - truth[i]) <= 0.5).length;
}

// Simulated recognizer output for a 14-line song: misspellings, English
// written in Hangul, a line missed entirely, timestamp jitter, and (in the
// noisy runs) 25-40% of syllables replaced at random plus dropped words.
// In the same simulation the earlier opening-search matcher placed 0-2 lines
// within 0.5 s at 25% noise.
it("places most lines within 0.5 s from word timestamps, even with noisy recognition", () => {
  expect(linesWithinHalfSecond(0, false, 0.45)).toBeGreaterThanOrEqual(13);
  expect(linesWithinHalfSecond(0.25, false, 0.45)).toBeGreaterThanOrEqual(10);
  expect(linesWithinHalfSecond(0.4, false, 0.45)).toBeGreaterThanOrEqual(8);
});

it("still places lines from segment-level timestamps, less precisely", () => {
  expect(linesWithinHalfSecond(0, true, 0.45)).toBeGreaterThanOrEqual(8);
});

it("keeps estimated positions when the confirmation threshold is strict", () => {
  // The studio confirms lines at 90%; lines under it still use their aligned estimate
  expect(linesWithinHalfSecond(0, false, 0.9)).toBeGreaterThanOrEqual(13);
  expect(linesWithinHalfSecond(0.25, false, 0.9)).toBeGreaterThanOrEqual(10);
});
