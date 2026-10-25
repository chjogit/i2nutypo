import { describe, expect, it } from "vitest";
import { parseLyrics } from "@/lib/lyrics/parse";
import { defaultFxToggles } from "@/lib/fx/toggles";
import { DEFAULT_STYLE, DEFAULT_SUBTITLES } from "@/store/project-store";
import type { Ctx2D } from "../../motifs";
import { renderFrame } from "../../render-frame";
import { LOOK_ELEMENTS, getLookPreset, lookElementKey, type ThemedPresetId } from "../presets";
import { THEME_EXTRAS } from "../theme-extras";
import { BG_PATTERNS, sanitizeBgPattern } from "../generative-bg";

const identity = { transformPoint: (p: { x: number; y: number }) => p };

/** Canvas stand-in that counts drawing calls. */
function fakeCtx(): { ctx: Ctx2D; draws: () => number } {
  let draws = 0;
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({
      width: t.length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: t.length * 10,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
    getTransform: () => ({ transformPoint: (p: { x: number; y: number }) => p, inverse: () => identity }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      if (/^(fill|stroke|draw|clear)/.test(key)) return () => void draws++;
      return () => {};
    },
    set(t, key: string, value) {
      t[key] = value;
      return true;
    },
  }) as unknown as Ctx2D;
  return { ctx, draws: () => draws };
}

const lines = parseLyrics("[00:01.00] 君が いない 夜を\n[00:03.00] 光の **中で** !\n[00:05.00] 우리의 여름", {
  duration: 12,
  introGateSec: 0,
});
// Spread so that line starts, quiet stretches and the rarer events (meteors, lightning) are all hit
const TIMES = Array.from({ length: 40 }, (_, i) => 0.05 + i * 0.29);

function totalDraws(preset: ThemedPresetId, only: string | null): number {
  const lookElements = Object.fromEntries(
    LOOK_ELEMENTS[preset].map((d) => [lookElementKey(preset, d.id), { on: d.id === only, amount: 1 }]),
  );
  const style = { ...DEFAULT_STYLE, lookPreset: preset, ...getLookPreset(preset).palette, lookElements };
  let n = 0;
  for (const timeSec of TIMES) {
    const { ctx, draws } = fakeCtx();
    renderFrame({
      ctx,
      W: 1280,
      H: 720,
      timeSec,
      lines,
      style,
      fx: defaultFxToggles(),
      subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
      introGateSec: 0,
      particles: [],
      energy: 0.5,
      animateParticles: false,
    });
    n += draws();
  }
  return n;
}

/** Extras that change how things look without adding drawing calls, or need a real canvas. */
const NO_EXTRA_CALLS = new Set(["shadow", "reflect"]);

const EXTRA_IDS: Record<string, string[]> = {
  album_jacket: ["rays", "giant", "shine", "marquee", "echo"],
  pop_cutout: ["shapes", "confetti", "bursts"],
  tint_panels: ["giant", "motes", "shine", "echo"],
  ballad_hud: ["rays", "motes", "shine", "echo"],
  cinematic_fantasy: ["rays", "fog", "fireflies", "stars"],
  digital_crt: ["stars", "rings", "marquee", "echo"],
  dark_glitch: ["giant", "streaks", "rings", "echo"],
  summer_film: ["puffs", "birds", "glints", "shine"],
  flat_type: ["giant", "shapes", "marquee"],
  eclipse_nebula: ["aurora", "rings", "meteors", "echo"],
  mono_accent: ["giant", "streaks", "marquee"],
  vintage_paper: ["rays", "motes", "flicker"],
  pastel_dream: ["puffs", "glints", "fireflies", "echo"],
  crimson_ink: ["moon", "fog", "splatter"],
  sakura_breeze: ["rays", "branch", "wind"],
  snow_night: ["stars", "aurora", "glints", "meteors"],
  rain_window: ["ripples", "trails", "lightning"],
  manga_panel: ["streaks", "bursts", "sfx"],
  deep_sea: ["marine", "fish", "jelly"],
  neon_sign: ["signs", "rain", "sparks"],
};

describe("theme extras", () => {
  it("gives every theme extra elements", () => {
    for (const id of Object.keys(LOOK_ELEMENTS) as ThemedPresetId[]) {
      expect(THEME_EXTRAS[id]).toBeDefined();
      for (const el of EXTRA_IDS[id]) expect(LOOK_ELEMENTS[id].some((d) => d.id === el)).toBe(true);
    }
  });

  for (const [preset, ids] of Object.entries(EXTRA_IDS) as [ThemedPresetId, string[]][]) {
    it(`draws each of ${preset}'s extras only when switched on`, () => {
      const none = totalDraws(preset, null);
      for (const id of [...ids, "climax", "accent", "beat", "pattern"]) {
        if (NO_EXTRA_CALLS.has(id)) continue;
        expect(totalDraws(preset, id), id).toBeGreaterThan(none);
      }
    });
  }

  it("keeps the extras' element ids unique within each theme", () => {
    for (const defs of Object.values(LOOK_ELEMENTS)) {
      const ids = defs.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("generated background patterns", () => {
  it("draws every kind and reads back only known ones", () => {
    for (const kind of BG_PATTERNS) {
      const preset: ThemedPresetId = "flat_type";
      const lookElements = { [lookElementKey(preset, "pattern")]: { on: true, amount: 1 } };
      const style = { ...DEFAULT_STYLE, lookPreset: preset, bgPattern: kind, lookElements };
      const off = { ...style, lookElements: {} };
      const count = (st: typeof style) => {
        const { ctx, draws } = fakeCtx();
        renderFrame({
          ctx,
          W: 1280,
          H: 720,
          timeSec: 2,
          lines,
          style: st,
          fx: defaultFxToggles(),
          subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
          introGateSec: 0,
          particles: [],
          energy: 0,
          animateParticles: false,
        });
        return draws();
      };
      expect(count(style), kind).toBeGreaterThan(count(off));
    }
    expect(sanitizeBgPattern("waves")).toBe("waves");
    expect(sanitizeBgPattern("nope")).toBe("auto");
  });
});

describe("interludes", () => {
  const gappy = parseLyrics("[00:01.00~00:03.00] 君が いない\n[00:12.00] 光の 中で", {
    duration: 15,
    introGateSec: 0,
  });
  const drawAt = (timeSec: number, on: boolean): number => {
    const preset: ThemedPresetId = "flat_type";
    const lookElements = { [lookElementKey(preset, "interlude")]: { on, amount: 1 } };
    const style = { ...DEFAULT_STYLE, lookPreset: preset, ...getLookPreset(preset).palette, lookElements };
    const { ctx, draws } = fakeCtx();
    renderFrame({
      ctx,
      W: 1280,
      H: 720,
      timeSec,
      lines: gappy,
      style,
      fx: defaultFxToggles(),
      subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
      introGateSec: 0,
      particles: [],
      energy: 0,
      animateParticles: false,
    });
    return draws();
  };

  it("marks a long break between lines and counts down to the next one", () => {
    const end = gappy[0].endTime;
    expect(drawAt(end + 2, true)).toBeGreaterThan(drawAt(end + 2, false));
    expect(drawAt(10.5, true)).toBeGreaterThan(drawAt(10.5, false));
  });

  it("leaves the lines themselves alone", () => {
    expect(drawAt(1.5, true)).toBe(drawAt(1.5, false));
  });
});

describe("title cards", () => {
  const late = parseLyrics("[00:03.00] 君が いない\n[00:05.00] 光の 中で", { duration: 7, introGateSec: 0 });
  const drawAt = (
    preset: ThemedPresetId,
    timeSec: number,
    coverTitle: string,
    layer: "full" | "back" | "front" = "full",
  ): number => {
    const { ctx, draws } = fakeCtx();
    renderFrame({
      ctx,
      W: 1280,
      H: 720,
      timeSec,
      lines: late,
      style: { ...DEFAULT_STYLE, lookPreset: preset, coverTitle, coverCredit: coverTitle ? "Vocal A" : "" },
      fx: defaultFxToggles(),
      subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
      introGateSec: 0,
      particles: [],
      energy: 0.5,
      animateParticles: false,
      layer,
    });
    return draws();
  };

  it("puts the card on the lyric layer when the layers are split", () => {
    expect(drawAt("neon_sign", 1.5, "Song", "front")).toBeGreaterThan(drawAt("neon_sign", 1.5, "", "front"));
    expect(drawAt("neon_sign", 1.5, "Song", "back")).toBe(drawAt("neon_sign", 1.5, "", "back"));
  });

  it("shows the typed title before the first line and after the last, in every theme", () => {
    for (const preset of Object.keys(LOOK_ELEMENTS) as ThemedPresetId[]) {
      if (preset === "album_jacket") continue;
      expect(drawAt(preset, 1.5, "Song"), preset).toBeGreaterThan(drawAt(preset, 1.5, ""));
      expect(drawAt(preset, 9, "Song"), preset).toBeGreaterThan(drawAt(preset, 9, ""));
    }
  });

  it("keeps the card off while lyrics are on screen", () => {
    expect(drawAt("flat_type", 4, "Song")).toBe(drawAt("flat_type", 4, ""));
  });
});

describe("built-in scenery", () => {
  it("paints a landscape when no picture is loaded, and can be switched off", async () => {
    const { SCENERY_THEMES } = await import("../scenery");
    expect(SCENERY_THEMES.length).toBeGreaterThan(8);
    for (const preset of SCENERY_THEMES) {
      expect(
        LOOK_ELEMENTS[preset].some((d) => d.id === "scenery"),
        preset,
      ).toBe(true);
      const on = totalDraws(preset, "scenery");
      const off = totalDraws(preset, null);
      expect(on, preset).toBeGreaterThan(off);
    }
  });
});

describe("keyword scenes", () => {
  it("finds pictures in Korean, Japanese and English words", async () => {
    const { keywordKinds } = await import("../keyword-scenes");
    expect(keywordKinds("밤하늘의 별")).toEqual(["star", "sky"]);
    expect(keywordKinds("雨の中で")).toEqual(["rain"]);
    expect(keywordKinds("I love the sea")).toEqual(["heart", "sea"]);
    expect(keywordKinds("달려가자")).toEqual([]);
  });

  it("draws them only on lines that name something", () => {
    const named = parseLyrics("[00:01.00] 별이 빛나는 밤\n[00:03.00] 그냥 걸어가", {
      duration: 6,
      introGateSec: 0,
    });
    const draw = (timeSec: number, on: boolean) => {
      const { ctx, draws } = fakeCtx();
      renderFrame({
        ctx,
        W: 1280,
        H: 720,
        timeSec,
        lines: named,
        style: {
          ...DEFAULT_STYLE,
          lookPreset: "flat_type",
          lookElements: { [lookElementKey("flat_type", "keywords")]: { on, amount: 0.6 } },
        },
        fx: defaultFxToggles(),
        subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
        introGateSec: 0,
        particles: [],
        energy: 0.5,
        animateParticles: false,
      });
      return draws();
    };
    expect(draw(2, true)).toBeGreaterThan(draw(2, false));
    expect(draw(4, true)).toBe(draw(4, false));
  });
});

describe("line-change wipes", () => {
  it("covers the change to the next line, briefly, in each theme that has one", async () => {
    const { WIPE_THEMES } = await import("../line-wipes");
    const two = parseLyrics("[00:01.00] 君が いない\n[00:04.00] 光の 中で", { duration: 7, introGateSec: 0 });
    for (const preset of WIPE_THEMES) {
      const draw = (timeSec: number, on: boolean) => {
        const { ctx, draws } = fakeCtx();
        renderFrame({
          ctx,
          W: 1280,
          H: 720,
          timeSec,
          lines: two,
          style: {
            ...DEFAULT_STYLE,
            lookPreset: preset,
            lookElements: { [lookElementKey(preset, "wipe")]: { on, amount: 0.6 } },
          },
          fx: defaultFxToggles(),
          subtitles: { ...DEFAULT_SUBTITLES, display: "kinetic" },
          introGateSec: 0,
          particles: [],
          energy: 0.5,
          animateParticles: false,
        });
        return draws();
      };
      expect(draw(4.1, true), preset).toBeGreaterThan(draw(4.1, false));
      expect(draw(5.5, true), preset).toBe(draw(5.5, false));
    }
  });
});
