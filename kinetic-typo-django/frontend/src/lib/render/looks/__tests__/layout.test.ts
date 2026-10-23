import { describe, expect, it } from "vitest";
import { DEFAULT_ILLUSTRATION, lookElementAmount, sanitizeLookElements } from "../presets";
import {
  blockedCells,
  characterRect,
  freeRowSpan,
  freeSpan,
  pickCell,
  pickColumn,
  sanitizeCells,
} from "../layout";

const W = 1280;
const H = 720;
const img = { source: {} as CanvasImageSource, width: 600, height: 900 };

describe("character cells", () => {
  it("marks the cells a bottom-left character covers", () => {
    const rect = characterRect(
      { ...DEFAULT_ILLUSTRATION, charX: 0.12, charY: 1, characterScale: 0.8 },
      img,
      W,
      H,
    );
    const blocked = blockedCells(rect, W, H);
    expect(blocked.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)).toEqual([0, 4, 8, 12]);
  });

  it("has no character rect when hidden or missing", () => {
    expect(characterRect({ ...DEFAULT_ILLUSTRATION, showCharacter: false }, img, W, H)).toBeNull();
    expect(characterRect(DEFAULT_ILLUSTRATION, null, W, H)).toBeNull();
    expect(blockedCells(null, W, H).every((b) => !b)).toBe(true);
  });
});

describe("lyric placement", () => {
  // Taken: cell 5 (row 1, col 1) and cell 14 (bottom row, col 2)
  const blocked = Array.from({ length: 16 }, (_, c) => c === 5 || c === 14);

  it("takes the first free preferred cell", () => {
    expect(pickCell(blocked, [5, 6, 1])).toBe(6);
    expect(pickCell(Array(16).fill(true), [5, 1])).toBe(5);
  });

  it("widens a cell over free neighbors in its row only", () => {
    expect(freeRowSpan(blocked, 1, W, H)).toEqual({ x: 0, y: 0, w: W, h: H / 4 });
    expect(freeRowSpan(blocked, 6, W, H)).toEqual({ x: W / 2, y: H / 4, w: W / 2, h: H / 4 });
  });

  it("grows a span one row toward the middle when that row is free", () => {
    expect(freeSpan(blocked, 6, W, H)).toEqual({ x: W / 2, y: H / 4, w: W / 2, h: H / 2 });
    // Row 0 across all columns cannot grow: cell 5 below is taken
    expect(freeSpan(blocked, 1, W, H)).toEqual({ x: 0, y: 0, w: W, h: H / 4 });
  });

  it("prefers the emptiest column", () => {
    expect(pickColumn(blocked, [1, 2, 3, 0])).toBe(3);
  });
});

describe("look elements", () => {
  it("uses defaults, honors off, and drops bad saved data", () => {
    expect(lookElementAmount({}, "pop_cutout", "halftone")).toBeGreaterThan(0);
    expect(
      lookElementAmount({ "pop_cutout.halftone": { on: false, amount: 1 } }, "pop_cutout", "halftone"),
    ).toBe(0);
    expect(sanitizeLookElements({ a: { on: true, amount: 3 }, b: { on: "x", amount: 1 }, c: null })).toEqual({
      a: { on: true, amount: 1 },
    });
  });
});

describe("sanitizeCells", () => {
  it("keeps sixteen user-marked cells and resets anything else", () => {
    const marked = Array.from({ length: 16 }, (_, c) => c === 3 || c === 13);
    expect(sanitizeCells(marked)).toEqual(marked);
    expect(sanitizeCells(undefined)).toEqual(Array(16).fill(false));
    expect(sanitizeCells([true, true])).toEqual(Array(16).fill(false));
  });

  it("carries cells saved on the old 3x3 grid over to 4x4", () => {
    // Old left column plus old bottom center
    const old = [true, false, false, true, false, false, true, true, false];
    const cells = sanitizeCells(old);
    expect(cells.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)).toEqual([0, 4, 8, 12, 13, 14]);
  });
});
