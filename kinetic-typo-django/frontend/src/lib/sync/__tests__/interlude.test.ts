import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { alignLinesToTranscript, resolveLineTimes, type TranscriptChunk } from "../align";
import { cleanTranscript } from "../clean-transcript";
import { OVERLAP_SEC, placeWindowChunks, planWindows, WINDOW_SEC } from "../windows";

const VERSE1 = [
  "창문 너머 불빛들이 하나둘 꺼져가",
  "아무 말 없이 걷던 그 길 위에서",
  "너의 이름을 다시 불러 보네",
  "네가 없는 밤 Without You",
  "다시 한 번만 내게 돌아와 줘",
];
const VERSE2 = [
  "차가운 목걸이가 조여 숨이 안 쉬어졌잖아",
  "흩어진 기억들을 모아서",
  "사실 그대로 돌아가고파",
  "네가 없는 밤 Without You",
  "다시 한 번만 내게 돌아와 줘",
];
const INTERLUDE_SEC = 24;

/**
 * Word-level recognizer output for two verses split by an instrumental
 * interlude, with what Whisper does there: a stock subtitle phrase, a loop
 * of a chorus phrase, and the first word after the break stretched back to
 * where the break began.
 */
function songWithInterlude() {
  const truth: number[] = [];
  const words: TranscriptChunk[] = [];
  let t = 10;
  [...VERSE1, ...VERSE2].forEach((line, i) => {
    if (i === VERSE1.length) {
      const gap = t;
      t += INTERLUDE_SEC;
      ["시청해", "주셔서", "감사합니다"].forEach((w, k) =>
        words.push({ text: w, start: gap + 3 + k, end: gap + 4 + k }),
      );
      for (let r = 0; r < 5; r++) {
        ["다시", "한", "번만"].forEach((w, k) =>
          words.push({ text: w, start: gap + 9 + r * 2 + k * 0.5, end: gap + 9.5 + r * 2 + k * 0.5 }),
        );
      }
    }
    truth.push(t);
    const ws = line.split(" ");
    const per = 3.2 / ws.length;
    ws.forEach((w, k) => {
      const end = t + (k + 1) * per;
      // The first word after the break "starts" at the break
      const start = i === VERSE1.length && k === 0 ? t - INTERLUDE_SEC + 1 : t + k * per;
      words.push({ text: w, start, end });
    });
    t += 4;
  });
  return { truth, words };
}

describe("windowed transcription", () => {
  it("covers the song once, splitting each overlap between neighbours", () => {
    const ws = planWindows(100);
    expect(ws[0].start).toBe(0);
    expect(ws.at(-1)?.end).toBe(100);
    ws.forEach((w, i) => {
      expect(w.end - w.start).toBeLessThanOrEqual(WINDOW_SEC);
      if (i > 0) expect(w.keepFrom).toBe(ws[i - 1].keepTo);
    });
    expect(ws[1].start).toBe(WINDOW_SEC - OVERLAP_SEC);
  });

  it("puts each window's words back at song time, each word once", () => {
    const { words } = songWithInterlude();
    const duration = 120;
    const placed = planWindows(duration).flatMap((w) => {
      // What the window's own transcription returns: its words, in window time
      const relative = words
        .filter((c) => c.start >= w.start && c.end <= w.end)
        .map((c) => ({ text: c.text, start: c.start - w.start, end: c.end - w.start }));
      return placeWindowChunks(relative, w);
    });
    const contained = words.filter((c) =>
      planWindows(duration).some((w) => c.start >= w.start && c.end <= w.end),
    );
    expect(placed).toEqual(contained);
  });
});

describe("cleanTranscript", () => {
  it("drops stock phrases spread over words and decoding loops, and trims stretched words", () => {
    const { words } = songWithInterlude();
    const { chunks, dropped } = cleanTranscript(words, "word");
    const text = chunks.map((c) => c.text).join(" ");
    expect(text).not.toContain("시청해");
    // One copy of the looped phrase is kept
    expect(dropped).toBe(3 + 4 * 3);
    const first2 = chunks.find((c) => c.text === "차가운");
    expect(first2 && first2.end - first2.start).toBeLessThan(3);
  });

  it("keeps a single word sung over and over", () => {
    const baby = Array.from({ length: 6 }, (_, i) => ({ text: "baby", start: i, end: i + 0.5 }));
    expect(cleanTranscript(baby, "word").dropped).toBe(0);
  });
});

it("keeps the second verse in place after an instrumental interlude", () => {
  const { truth, words } = songWithInterlude();
  const lines = parseLyrics([...VERSE1, ...VERSE2].join("\n"), { duration: 120, introGateSec: 6 });
  const { chunks } = cleanTranscript(words, "word");
  const times = resolveLineTimes(lines, alignLinesToTranscript(lines, chunks, 0.9), 120, 6);
  times.forEach((time, i) => expect(Math.abs(time - truth[i])).toBeLessThan(0.5));
});
