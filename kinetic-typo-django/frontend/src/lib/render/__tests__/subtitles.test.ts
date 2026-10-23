import { describe, expect, it } from "vitest";
import { DEFAULT_SUBTITLES } from "@/store/project-store";
import { hasSubtitleText, showsKineticLyrics } from "../subtitles";

const line = { cleanText: "変わらぬ人の 惨さに近い", pronText: "", transText: "" };

describe("subtitle display", () => {
  it("shows only bottom subtitles, lyrics included, by default", () => {
    expect(DEFAULT_SUBTITLES.display).toBe("bottomOnly");
    expect(showsKineticLyrics(DEFAULT_SUBTITLES)).toBe(false);
    expect(hasSubtitleText(DEFAULT_SUBTITLES, line)).toBe(true);
  });

  it("keeps kinetic lyrics when chosen, or when subtitles are off", () => {
    const kinetic = { ...DEFAULT_SUBTITLES, display: "kinetic" as const };
    expect(showsKineticLyrics(kinetic)).toBe(true);
    expect(hasSubtitleText(kinetic, line)).toBe(false);
    expect(showsKineticLyrics({ ...DEFAULT_SUBTITLES, enabled: false })).toBe(true);
  });
});
