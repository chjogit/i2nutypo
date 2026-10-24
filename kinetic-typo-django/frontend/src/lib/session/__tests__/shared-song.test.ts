import { describe, expect, it } from "vitest";
import { parseSongMeta } from "../shared-song";

describe("parseSongMeta", () => {
  it("reads a saved song record", () => {
    const m = parseSongMeta(
      JSON.stringify({
        id: "a",
        stored: true,
        fileName: "x.mp3",
        duration: 12,
        lyricsText: "가사",
        sync: { offset: 1 },
      }),
    );
    expect(m?.fileName).toBe("x.mp3");
    expect(m?.stored).toBe(true);
    expect(m?.lyricsText).toBe("가사");
    expect(m?.lyricsCollapsed).toBe(false);
  });
  it("drops missing or broken records", () => {
    expect(parseSongMeta(null)).toBeNull();
    expect(parseSongMeta("{")).toBeNull();
    expect(parseSongMeta(JSON.stringify({ id: "a", fileName: "x", duration: 0 }))).toBeNull();
  });
});
