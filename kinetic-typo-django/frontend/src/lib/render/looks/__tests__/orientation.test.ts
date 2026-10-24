import { describe, expect, it } from "vitest";
import { parseLyrics, serializeTimedLyrics } from "@/lib/lyrics/parse";
import { effectiveOrientation, ORIENT_VERTICAL } from "../orientation";

const opts = { duration: 20, introGateSec: 0 };

describe("lyric orientation", () => {
  it("follows the theme until the video or the line picks a direction", () => {
    const [line] = parseLyrics("[00:01.00] 하나 둘", opts);
    expect(effectiveOrientation("album_jacket", { lyricOrientation: "auto" }, line)).toBe("horizontal");
    expect(effectiveOrientation("crimson_ink", { lyricOrientation: "auto" }, line)).toBe("vertical");
    expect(effectiveOrientation("crimson_ink", { lyricOrientation: "horizontal" }, line)).toBe("horizontal");
    const own = { ...line, lineStyle: { orient: ORIENT_VERTICAL } };
    expect(effectiveOrientation("album_jacket", { lyricOrientation: "horizontal" }, own)).toBe("vertical");
  });

  it("keeps a line's own direction in the lyrics text", () => {
    const [line] = parseLyrics("[00:01.00;orient=2] 하나 둘", opts);
    expect(line.lineStyle.orient).toBe(2);
    expect(serializeTimedLyrics([{ ...line }], 20)).toContain("orient=2.00");
  });
});
