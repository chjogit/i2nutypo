import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { defaultFxToggles } from "@/lib/fx/toggles";
import { DEFAULT_STYLE, DEFAULT_SUBTITLES, useProjectStore } from "@/store/project-store";
import type { Ctx2D } from "../../motifs";
import { renderFrame } from "../../render-frame";
import {
  elementInEffect,
  LOOK_ELEMENTS,
  LOOK_PRESETS,
  lookElementKey,
  classicToAlbumElements,
  lyricLookOf,
  sanitizeMixLooks,
  type ThemedPresetId,
} from "../presets";

/** Canvas stand-in that counts drawing calls. */
function fakeCtx(): { ctx: Ctx2D; draws: () => number; images: unknown[] } {
  let draws = 0;
  const images: unknown[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      if (/^(fill|stroke|draw|clear)/.test(key)) {
        return (...args: unknown[]) => {
          draws++;
          if (key === "drawImage") images.push(args[0]);
        };
      }
      return () => {};
    },
    set(t, key: string, value) {
      t[key] = value;
      return true;
    },
  }) as unknown as Ctx2D;
  return { ctx, draws: () => draws, images };
}

/** Total looks offered (album jacket took the retired classic look's place). */
const EXPECTED_LOOKS = 20;

const lines = parseLyrics("[00:01.00] 君が いない 夜\n[00:03.00] 光の 中で", {
  duration: 10,
  introGateSec: 0,
});

function draw(style: typeof DEFAULT_STYLE): number {
  const { ctx, draws } = fakeCtx();
  renderFrame({
    ctx,
    W: 1280,
    H: 720,
    timeSec: 1.6,
    lines,
    style,
    fx: defaultFxToggles(),
    subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
    introGateSec: 0,
    particles: [],
    energy: 0.5,
    animateParticles: false,
  });
  return draws();
}

const THEMED = LOOK_PRESETS.map((p) => p.id).filter((id): id is ThemedPresetId => id !== "classic");
const off = (preset: ThemedPresetId) =>
  Object.fromEntries(
    LOOK_ELEMENTS[preset].map((d) => [lookElementKey(preset, d.id), { on: false, amount: 0.5 }]),
  );

describe("look presets", () => {
  it("has twenty looks, all named, and no reference data", () => {
    expect(LOOK_PRESETS).toHaveLength(EXPECTED_LOOKS);
    for (const p of LOOK_PRESETS) {
      expect(p.label).not.toMatch(/레퍼런스|MV/);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("gives every themed look elements with a role", () => {
    for (const id of THEMED) {
      expect(LOOK_ELEMENTS[id].length).toBeGreaterThan(0);
      const roles = new Set(LOOK_ELEMENTS[id].map((d) => d.role));
      expect(roles.has("decor") || roles.has("overlay")).toBe(true);
    }
  });

  it("renders every look without throwing", () => {
    for (const id of THEMED) expect(draw({ ...DEFAULT_STYLE, lookPreset: id })).toBeGreaterThan(0);
  });
});

describe("theme mixing", () => {
  it("keeps known themed ids only, without repeats, at most two", () => {
    expect(
      sanitizeMixLooks(["flat_type", "classic", "flat_type", "nope", "summer_film", "dark_glitch"]),
    ).toEqual(["flat_type", "summer_film"]);
    expect(sanitizeMixLooks("flat_type")).toEqual([]);
  });

  it("applies scene elements to the background theme and lyric elements to the lyric theme", () => {
    const style = { lookPreset: "pop_cutout" as const, mixLooks: ["flat_type" as const], lyricLook: null };
    const def = (p: ThemedPresetId, id: string) => LOOK_ELEMENTS[p].find((d) => d.id === id)!;
    expect(elementInEffect(style, "pop_cutout", def("pop_cutout", "wash"))).toBe(true);
    expect(elementInEffect(style, "flat_type", def("flat_type", "flip"))).toBe(false);
    expect(elementInEffect(style, "flat_type", def("flat_type", "stripes"))).toBe(true);
    expect(elementInEffect(style, "flat_type", def("flat_type", "slam"))).toBe(false);
    const lyr = { ...style, lyricLook: "flat_type" as const };
    expect(lyricLookOf(lyr)).toBe("flat_type");
    expect(elementInEffect(lyr, "flat_type", def("flat_type", "slam"))).toBe(true);
    expect(elementInEffect(lyr, "pop_cutout", def("pop_cutout", "pop"))).toBe(false);
    // A lyric theme that is no longer picked falls back to the background theme
    expect(lyricLookOf({ ...lyr, mixLooks: [] })).toBe("pop_cutout");
  });

  it("draws a mixed theme's elements, and nothing when they are all off", () => {
    const base = { ...DEFAULT_STYLE, lookPreset: "pop_cutout" as const };
    const plain = draw(base);
    const mixes: ThemedPresetId[] = ["eclipse_nebula", "summer_film"];
    const allOff = { ...off("eclipse_nebula"), ...off("summer_film") };
    expect(draw({ ...base, mixLooks: mixes, lookElements: allOff })).toBe(plain);
    expect(draw({ ...base, mixLooks: mixes })).toBeGreaterThan(plain);
  });

  it("can draw the lyrics with another picked theme", () => {
    const base = { ...DEFAULT_STYLE, lookPreset: "summer_film" as const, mixLooks: ["dark_glitch" as const] };
    expect(draw({ ...base, lyricLook: "dark_glitch" })).not.toBe(draw(base));
  });

  it("can mix any theme with two others", () => {
    for (const a of THEMED) {
      const others = THEMED.filter((b) => b !== a).slice(0, 2);
      for (const lyricLook of [null, ...others]) {
        expect(() => draw({ ...DEFAULT_STYLE, lookPreset: a, mixLooks: others, lyricLook })).not.toThrow();
      }
    }
  });

  it("moves a classic save's effects onto the album jacket elements", () => {
    const fx = { ...defaultFxToggles(), ghostWords: false, introGuide: false };
    const kept = { [lookElementKey("album_jacket", "next")]: { on: true, amount: 0.3 } };
    const out = classicToAlbumElements({ nextPreview: false, flashInvert: true, letterbox: true }, fx, kept);
    expect(out[lookElementKey("album_jacket", "ghost")].on).toBe(false);
    expect(out[lookElementKey("album_jacket", "intro")].on).toBe(false);
    expect(out[lookElementKey("album_jacket", "flash")].on).toBe(true);
    expect(out[lookElementKey("album_jacket", "letterbox")].on).toBe(true);
    // What the save already set for the new theme wins
    expect(out[lookElementKey("album_jacket", "next")]).toEqual({ on: true, amount: 0.3 });
    expect(draw({ ...DEFAULT_STYLE, lookElements: out })).toBeGreaterThan(0);
  });

  it("draws the album jacket title only when one is typed", () => {
    const plain = draw(DEFAULT_STYLE);
    expect(draw({ ...DEFAULT_STYLE, coverTitle: "Song", coverCredit: "Vocal A" })).toBeGreaterThan(plain);
  });

  it("goes back to the default theme when every theme is unpicked", () => {
    const store = useProjectStore.getState();
    store.applyLookPreset("pop_cutout");
    store.toggleTheme("deep_sea");
    store.setLookElement("vinyl", { on: false }, "album_jacket");
    useProjectStore.getState().toggleTheme("pop_cutout");
    useProjectStore.getState().toggleTheme("deep_sea");
    const st = useProjectStore.getState().style;
    expect(st.lookPreset).toBe(DEFAULT_STYLE.lookPreset);
    expect(st.mixLooks).toEqual([]);
    expect(st.bgColor).toBe(DEFAULT_STYLE.bgColor);
    expect(st.lookElements[lookElementKey("album_jacket", "vinyl")]).toBeUndefined();
  });

  it("puts a separately picked album cover on the sleeve, else the background", () => {
    const pic = (name: string) => ({ source: { name } as unknown as CanvasImageSource, width: 400, height: 300 });
    const background = pic("bg");
    const cover = pic("cover");
    const style = {
      ...DEFAULT_STYLE,
      lookElements: { [lookElementKey("album_jacket", "jacket")]: { on: true, amount: 0.8 } },
    };
    const sources = (images: { background: typeof background | null; cover: typeof cover | null }) => {
      const { ctx, images: drawn } = fakeCtx();
      renderFrame({
        ctx,
        W: 1280,
        H: 720,
        timeSec: 1.6,
        lines,
        style,
        fx: defaultFxToggles(),
        subtitles: DEFAULT_SUBTITLES,
        introGateSec: 0,
        particles: [],
        energy: 0.5,
        animateParticles: false,
        images: { character: null, ...images },
      });
      return drawn;
    };
    expect(sources({ background, cover: null })).not.toContain(cover.source);
    const both = sources({ background, cover });
    expect(both).toContain(background.source);
    expect(both).toContain(cover.source);
    // Cover alone also fills the blurred background
    expect(sources({ background: null, cover }).filter((s) => s === cover.source).length).toBeGreaterThan(1);
  });
});
