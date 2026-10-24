import { describe, expect, it } from "vitest";
import { autoDistributeLyrics, parseLyrics } from "../parse";
import { interludeSeconds, splitCuts, splitFlashMark } from "../triplet";

const opts = { duration: 40, introGateSec: 4 };

describe("lyric notation", () => {
  it("reads interlude, flash and cut marks", () => {
    expect(interludeSeconds("[간주 8]")).toBe(8);
    expect(interludeSeconds("[間奏]")).toBe(4);
    expect(interludeSeconds("[00:01.00] a")).toBeNull();
    expect(splitFlashMark("hello !")).toEqual({ flash: true, body: "hello" });
    expect(splitFlashMark("hello!")).toEqual({ flash: false, body: "hello!" });
    expect(splitCuts("one / two")).toEqual(["one", "two"]);
    expect(splitCuts("a/b")).toEqual(["a/b"]);
  });

  it("skips # notes", () => {
    const lines = parseLyrics("# note\nfirst\nsecond", opts);
    expect(lines.map((l) => l.cleanText)).toEqual(["first", "second"]);
  });

  it("leaves an interlude empty between untimed lines", () => {
    const lines = parseLyrics("one\n[간주 10]\ntwo", opts);
    expect(lines).toHaveLength(2);
    const slice = (40 - 4 - 10) / 2;
    expect(lines[0].endTime).toBeCloseTo(4 + slice, 1);
    expect(lines[1].startTime).toBeCloseTo(4 + slice + 10, 1);
  });

  it("flashes a line ending in ' !'", () => {
    const [line] = parseLyrics("[00:05.00] shout !", opts);
    expect(line.cleanText).toBe("shout");
    expect(line.lineStyle.flash).toBe(1);
  });

  it("cuts a line into screens that share its time", () => {
    const lines = parseLyrics("[00:05.00] aa / bb !\n[00:09.00] next", opts);
    expect(lines.map((l) => l.cleanText)).toEqual(["aa", "bb", "next"]);
    expect(lines[0].startTime).toBe(5);
    expect(lines[0].endTime).toBeCloseTo(7, 1);
    expect(lines[1].endTime).toBe(9);
    expect(lines[0].lineStyle.flash).toBe(1);
    expect(lines[1].lineStyle.flash).toBeUndefined();
  });

  it("keeps interlude gaps when spreading lines", () => {
    const out = autoDistributeLyrics("one\n[간주 8]\ntwo", 60, 4).split("\n");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^\[00:04\.00~00:08\.20\] one$/);
    expect(out[1]).toMatch(/^\[00:16\.20\] two$/);
  });
});
