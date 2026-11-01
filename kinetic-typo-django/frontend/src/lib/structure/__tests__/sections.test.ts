import { describe, expect, it } from "vitest";
import { detectSections, type SectionLine } from "../sections";

const line = (text: string, startTime: number, overlap = false): SectionLine => ({
  text,
  startTime,
  endTime: startTime + 3,
  overlap,
});

// verse (4 lines), chorus (3), pause, verse 2 (4), chorus again, bridge, chorus, outro
const song = [
  line("첫 절 하나", 0),
  line("첫 절 둘", 4),
  line("첫 절 셋", 8),
  line("첫 절 넷", 12),
  line("후렴 하나", 20),
  line("후렴 둘", 24),
  line("후렴 셋", 28),
  line("둘째 절 하나", 38),
  line("둘째 절 둘", 42),
  line("둘째 절 셋", 46),
  line("둘째 절 넷", 50),
  line("후렴 하나", 58),
  line("*후렴* 둘!", 62),
  line("후렴 셋", 66),
  line("다리 하나", 76),
  line("다리 둘", 80),
  line("후렴 하나", 88),
  line("후렴 둘", 92),
  line("후렴 셋", 96),
  line("끝", 106),
];

describe("detectSections", () => {
  it("cuts at pauses and finds the lines that come back as the chorus", () => {
    const s = detectSections(song);
    expect(s.map((x) => x.kind)).toEqual(["verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]);
    expect(s.map((x) => x.label)).toEqual(["절 1", "후렴 1", "절 2", "후렴 2", "브리지", "후렴 3", "마무리"]);
  });

  it("keeps an overlapping line with the line before it", () => {
    const s = detectSections([line("가", 0), line("나", 4), line("나나", 4, true), line("다", 20)]);
    expect(s).toHaveLength(2);
    expect(s[0].to).toBe(3);
  });

  it("applies the user's correction", () => {
    const s = detectSections(song, { "0": "intro" });
    expect(s[0].kind).toBe("intro");
    expect(s[0].manual).toBe(true);
  });

  it("returns nothing without lines", () => {
    expect(detectSections([])).toEqual([]);
  });

  it("splits a song without pauses into groups", () => {
    const flat = Array.from({ length: 12 }, (_, i) => line(`줄 ${i}`, i * 4));
    expect(detectSections(flat).length).toBe(3);
  });
});
