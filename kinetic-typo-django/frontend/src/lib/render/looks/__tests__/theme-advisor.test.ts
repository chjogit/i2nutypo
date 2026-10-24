import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { SAMPLE_LYRICS } from "@/lib/lyrics/samples";
import { BEGINNER_THEMES } from "@/lib/mode/mode";
import { recommendThemes } from "../theme-advisor";

const opts = { duration: 40, introGateSec: 6 };

describe("theme-advisor (recommendThemes)", () => {
  it("recommends snow_night for winter and snow lyrics", () => {
    const lines = parseLyrics("하얀 눈이 내리는 차가운 겨울밤\n얼어붙은 거리 위에서", opts);
    const recs = recommendThemes({ lines, bpm: 84, language: "ko-KR" });
    expect(recs[0].lookPreset).toBe("snow_night");
    expect(recs[0].confidence).toBeGreaterThan(0.8);
    expect(recs[0].tags).toContain("겨울·눈");
  });

  it("recommends rain_window for rainy window and umbrella lyrics", () => {
    const lines = parseLyrics("비 내리는 창가에 기대어\n우산도 없이 젖어가는 빗소리", opts);
    const recs = recommendThemes({ lines, bpm: 86, language: "ko-KR" });
    expect(recs[0].lookPreset).toBe("rain_window");
    expect(recs[0].mixLooks.length).toBeGreaterThan(0);
  });

  it("recommends sakura_breeze for spring cherry blossom lyrics", () => {
    const lines = parseLyrics("桜の花びらが春風に舞う\n사쿠라노 하나비라가 하루카제니 마우", opts);
    const recs = recommendThemes({ lines, bpm: 108, language: "ja-JP" });
    expect(recs[0].lookPreset).toBe("sakura_breeze");
  });

  it("recommends summer_film for summer ocean and polaroid lyrics", () => {
    const lines = parseLyrics("푸른 바다와 파도 소리\n여름 햇살 아래 폴라로이드 사진", opts);
    const recs = recommendThemes({ lines, bpm: 128, language: "ko-KR" });
    expect(recs[0].lookPreset).toBe("summer_film");
  });

  it("recommends dark_glitch or digital_crt for high-BPM glitch/cyber lyrics", () => {
    const lines = parseLyrics("*에러* 난 시스템 속 *깨진* 화면\n어둠 속 사슬이 조여와 *파괴*해", opts);
    const recs = recommendThemes({ lines, bpm: 145, language: "ko-KR" });
    expect(["dark_glitch", "digital_crt"]).toContain(recs[0].lookPreset);
  });

  it("picks only among the given themes for the beginner page", () => {
    const lines = parseLyrics("하얀 눈이 내리는 차가운 겨울밤\n얼어붙은 거리 위에서", opts);
    const recs = recommendThemes({ lines, bpm: 84, language: "ko-KR" }, 3, BEGINNER_THEMES);
    expect(recs).toHaveLength(3);
    for (const r of recs) expect(BEGINNER_THEMES).toContain(r.lookPreset);
  });

  it("ranks the sample lyrics among the beginner themes", () => {
    const lines = parseLyrics(SAMPLE_LYRICS["ja-JP"], opts);
    const [top] = recommendThemes({ lines, bpm: 98, language: "ja-JP" }, 1, BEGINNER_THEMES);
    expect(BEGINNER_THEMES).toContain(top.lookPreset);
    expect(top.tags.length).toBeGreaterThan(0);
  });
});
