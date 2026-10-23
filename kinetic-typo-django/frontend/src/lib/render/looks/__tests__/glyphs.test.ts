import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { lineGlyphs, splitColumns, wrapGlyphRows } from "../glyphs";
import { revealRows, wrapWords } from "../words";
import type { Ctx2D } from "../../motifs";
import { getLookPreset, isLookPresetId, LOOK_PRESETS } from "../presets";

const line = (text: string) => parseLyrics(`[00:01.00] ${text}`, { duration: 10, introGateSec: 0 })[0];

describe("lineGlyphs", () => {
  it("keeps spaces only for spaced lines", () => {
    expect(
      lineGlyphs(line("君が いない 夜"), 0)
        .map((g) => g.ch)
        .join(""),
    ).toBe("君が いない 夜");
    expect(lineGlyphs(line("孤独だったけど"), 0).some((g) => g.ch === " ")).toBe(false);
  });

  it("carries each word's timing to its characters", () => {
    const l = line("君が いない");
    const glyphs = lineGlyphs(l, 5);
    expect(glyphs[0].wElapsed).toBe(5 - l.words[0].startOffset);
    expect(glyphs.at(-1)?.wElapsed).toBe(5 - l.words[1].startOffset);
  });
});

describe("splitColumns", () => {
  it("never splits a Latin run across columns", () => {
    const glyphs = lineGlyphs(line("耐えられた Tonight"), 0);
    const cols = splitColumns(glyphs, 10, 60);
    const joined = cols.map((c) => c.map((g) => g.ch).join(""));
    expect(joined.some((c) => c.includes("Tonight"))).toBe(true);
    expect(cols.every((c) => c[0].ch !== " ")).toBe(true);
  });
});

describe("look presets", () => {
  it("has unique ids and no longer offers classic", () => {
    const ids = LOOK_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(isLookPresetId("dark_glitch")).toBe(true);
    expect(isLookPresetId("nope")).toBe(false);
    expect(isLookPresetId("classic")).toBe(false);
    expect(ids[0]).toBe("album_jacket");
    expect(getLookPreset("pop_cutout").palette.bgColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("wrapGlyphRows", () => {
  const rowsOf = (text: string, maxW: number) => {
    const glyphs = lineGlyphs(line(text), 0);
    const rows = wrapGlyphRows(
      glyphs,
      glyphs.map(() => 10),
      maxW,
    );
    return rows.map((r) => r.map((i) => glyphs[i].ch).join(""));
  };

  it("breaks spaced lines between words", () => {
    expect(rowsOf("one two three", 80)).toEqual(["one two", "three"]);
  });

  it("breaks Japanese between characters, never before small kana", () => {
    const rows = rowsOf("孤独だったけど", 30);
    expect(rows.join("")).toBe("孤独だったけど");
    for (const r of rows) expect(r.length).toBeLessThanOrEqual(3);
    expect(rows.some((r) => r.startsWith("っ"))).toBe(false);
  });
});

describe("revealRows", () => {
  it("spreads typed characters across wrapped rows", () => {
    expect(revealRows(["one two", "three"], 10, true)).toEqual(["one two", "th"]);
    expect(revealRows(["孤独だ", "ったけど"], 4, false)).toEqual(["孤独だ", "っ"]);
  });
});

describe("phrases and manual breaks", () => {
  const glyphRows = (text: string, maxW: number) => {
    const glyphs = lineGlyphs(line(text), 0);
    return wrapGlyphRows(
      glyphs,
      glyphs.map(() => 10),
      maxW,
    ).map((r) => r.map((i) => glyphs[i].ch).join(""));
  };

  it("keeps a spaced Japanese phrase whole", () => {
    expect(glyphRows("変わらぬ人の 惨さに近い", 80)).toEqual(["変わらぬ人の", "惨さに近い"]);
  });

  it("starts a new row at /n", () => {
    expect(glyphRows("君が/nいない夜", 500)).toEqual(["君が", "いない夜"]);
  });

  it("starts a new vertical column at /n", () => {
    const cols = splitColumns(lineGlyphs(line("君が/nいない"), 0), 10, 500);
    expect(cols.map((c) => c.map((g) => g.ch).join(""))).toEqual(["君が", "いない"]);
  });

  it("wraps words at /n and keeps phrases whole", () => {
    const ctx = { measureText: (t: string) => ({ width: Array.from(t).length * 10 }) } as unknown as Ctx2D;
    const rowsOf = (text: string, maxW: number) =>
      wrapWords(ctx, line(text), 0, maxW).rows.map((r) => r.map((w) => w.text).join(" "));
    expect(rowsOf("変わらぬ人の 惨さに近い", 80)).toEqual(["変わらぬ人の", "惨さに近い"]);
    expect(rowsOf("君が/nいない", 500)).toHaveLength(2);
  });
});
