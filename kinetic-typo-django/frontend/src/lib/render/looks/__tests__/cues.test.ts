import { describe, expect, it } from "vitest";
import type { CharacterCue } from "@/types/project";
import { characterAt, sanitizeCues } from "../cues";
import { DEFAULT_ILLUSTRATION, sanitizeLookElements } from "../presets";

const cue = (patch: Partial<CharacterCue>): CharacterCue => ({
  hideAt: 10,
  showAt: 20,
  effect: "fade",
  fade: 1,
  x: 0.8,
  y: 0.9,
  ...patch,
});

describe("characterAt", () => {
  const ill = { ...DEFAULT_ILLUSTRATION, charCues: [cue({}), cue({ hideAt: 30, showAt: 40, x: 0.3, y: 1 })] };

  it("stays at its own place with the user's cells before the first cue", () => {
    expect(characterAt(ill, 5)).toMatchObject({ x: 0.24, y: 1, reveal: 1, cells: "user" });
  });

  it("fades out and lets go of the cells halfway", () => {
    expect(characterAt(ill, 10.25)).toMatchObject({ reveal: 0.75, cells: "user" });
    expect(characterAt(ill, 10.75)).toMatchObject({ reveal: 0.25, cells: "off" });
    expect(characterAt(ill, 15)).toMatchObject({ reveal: 0, cells: "off" });
  });

  it("comes back at the new place, whose cells take over at once", () => {
    expect(characterAt(ill, 20.5)).toMatchObject({ x: 0.8, y: 0.9, reveal: 0.5, cells: "moved" });
    expect(characterAt(ill, 25)).toMatchObject({ x: 0.8, y: 0.9, reveal: 1, cells: "moved" });
  });

  it("leaves again from where it came back", () => {
    expect(characterAt(ill, 30.2)).toMatchObject({ x: 0.8, y: 0.9, cells: "moved" });
    expect(characterAt(ill, 35)).toMatchObject({ reveal: 0, cells: "off" });
    expect(characterAt(ill, 45)).toMatchObject({ x: 0.3, y: 1, reveal: 1, cells: "moved" });
  });

  it("works without cues (old saves)", () => {
    const old = { ...DEFAULT_ILLUSTRATION } as Partial<typeof DEFAULT_ILLUSTRATION>;
    delete old.charCues;
    expect(characterAt(old as typeof DEFAULT_ILLUSTRATION, 3)).toMatchObject({ reveal: 1, cells: "user" });
  });
});

describe("sanitizeCues", () => {
  it("drops broken entries, sorts, and keeps the return after the exit", () => {
    const out = sanitizeCues([
      cue({ hideAt: 30, showAt: 5, effect: "nope" as CharacterCue["effect"], fade: 99 }),
      { hideAt: "x" },
      null,
      cue({ hideAt: 2, x: 9 }),
    ]);
    expect(out.map((c) => c.hideAt)).toEqual([2, 30]);
    expect(out[0].x).toBe(1.2);
    expect(out[1]).toMatchObject({ showAt: 30, effect: "fade", fade: 3 });
    expect(sanitizeCues("bad")).toEqual([]);
  });
});

describe("sanitizeLookElements", () => {
  it("keeps an element's place and turn, within range", () => {
    const out = sanitizeLookElements({
      "album_jacket.vinyl": { on: true, amount: 0.4, x: 0.2, y: -2, rot: 400 },
      "album_jacket.jacket": { on: false, amount: 0.8 },
    });
    expect(out["album_jacket.vinyl"]).toEqual({ on: true, amount: 0.4, x: 0.2, y: -0.6, rot: 180 });
    expect(out["album_jacket.jacket"]).toEqual({ on: false, amount: 0.8 });
  });
});
