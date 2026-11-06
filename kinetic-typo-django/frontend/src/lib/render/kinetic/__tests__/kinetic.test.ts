import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseLyrics } from "@/lib/lyrics/parse";
import { defaultFxToggles } from "@/lib/fx/toggles";
import { DEFAULT_STYLE, DEFAULT_SUBTITLES } from "@/store/project-store";
import type { MotionStyleId, StyleSettings } from "@/types/project";
import type { Ctx2D } from "../../motifs";
import { renderFrame } from "../../render-frame";
import type { LookFrame } from "../../looks/frame";
import { contrastOf, derivePalette, hslToRgb, parseColor, readableOn, rgbToHsl } from "../color";
import { EXPO_OUT, SHARP_IN, cubicBezier, springAt, springSettle, DEFAULT_SPRING } from "../easing";
import { IDENTITY_CAMERA, cameraAt, punchTimes } from "../camera";
import { exitProgress, layoutKinetic, piecePose } from "../renderer";
import { MOTION_STYLES, motionStyleOf, sanitizeKineticBg, sanitizeMotionStyle } from "../styles";
import { wantsCinematicBase } from "../post";
import { KINETIC_FONT_STACK, kineticFontStack } from "../fonts";

/** Canvas stand-in that records text drawn and counts drawing calls. */
function fakeCtx(): {
  ctx: Ctx2D;
  draws: () => number;
  texts: string[];
  filters: string[];
  shadows: number[];
} {
  let draws = 0;
  const texts: string[] = [];
  const filters: string[] = [];
  const shadows: number[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: Array.from(t).length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, transformPoint: (p: unknown) => p }),
  };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      if (/^(fill|stroke|draw|clear)/.test(key)) {
        return (...args: unknown[]) => {
          draws++;
          if (key === "fillText") texts.push(String(args[0]));
        };
      }
      return () => {};
    },
    set(t, key: string, value) {
      t[key] = value;
      if (key === "filter") filters.push(String(value));
      if (key === "shadowBlur") shadows.push(Number(value));
      return true;
    },
  }) as unknown as Ctx2D;
  return { ctx, draws: () => draws, texts, filters, shadows };
}

const lines = parseLyrics(
  "[00:01.00] 너를 *사랑해* 오늘도\n[00:04.00] 빛나는 밤 !\n[00:07.00] the city lights",
  {
    duration: 10,
    introGateSec: 0,
  },
);

function draw(style: StyleSettings, timeSec: number) {
  const fake = fakeCtx();
  renderFrame({
    ctx: fake.ctx,
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
  return fake;
}

function frameFor(style: StyleSettings, lineIndex: number, elapsed: number): LookFrame {
  const line = lines[lineIndex];
  return {
    preset: "album_jacket",
    ctx: fakeCtx().ctx,
    W: 1280,
    H: 720,
    timeSec: line.startTime + elapsed,
    line,
    nextLine: null,
    lineElapsed: elapsed,
    lineProgress: elapsed / (line.endTime - line.startTime),
    songEnd: 10,
    style,
    subtitles: DEFAULT_SUBTITLES,
    energy: 0,
    images: {} as LookFrame["images"],
    subtitleVisible: false,
    subtitleTop: false,
    charRect: null,
    blocked: new Array(16).fill(false),
    glitch: 1,
    shake: 1,
    frameShake: { x: 0, y: 0 },
    lyricShift: { x: 0, y: 0 },
    subtitleShift: { x: 0, y: 0 },
  };
}

describe("color derivation", () => {
  it("reads hex and rgb and goes round through HSL", () => {
    expect(parseColor("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
    expect(parseColor("#123456")).toEqual({ r: 18, g: 52, b: 86 });
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("nope")).toBeNull();
    for (const hex of ["#123456", "#ff8800", "#00c2a8", "#7f7f7f"]) {
      const c = parseColor(hex)!;
      const back = hslToRgb(rgbToHsl(c));
      expect(Math.abs(back.r - c.r) + Math.abs(back.g - c.g) + Math.abs(back.b - c.b)).toBeLessThanOrEqual(3);
    }
  });

  it("always finds text that reads on the point color (4.5:1)", () => {
    for (let h = 0; h < 360; h += 30)
      for (const l of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        const fill = hslToRgb({ h, s: 0.8, l });
        expect(contrastOf(readableOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("flips the box text between dark and light with the point color's brightness", () => {
    const light = derivePalette({ ...DEFAULT_STYLE, accentColor: "#ffe14d" });
    const dark = derivePalette({ ...DEFAULT_STYLE, accentColor: "#1d2a8c" });
    expect(rgbToHsl(light.onAccent).l).toBeLessThan(0.2);
    expect(rgbToHsl(dark.onAccent).l).toBeGreaterThan(0.9);
  });

  it("derives every shade from the user's colors", () => {
    const a = derivePalette({ ...DEFAULT_STYLE, bgColor: "#101820", accentColor: "#ff5a36" });
    const b = derivePalette({ ...DEFAULT_STYLE, bgColor: "#f4efe6", accentColor: "#2b59ff" });
    expect(a.bgLift).not.toEqual(b.bgLift);
    expect(a.aurora[0]).not.toEqual(b.aurora[0]);
    expect(a.glow).toContain("255, 90, 54");
    expect(rgbToHsl(a.bgLift).l).toBeGreaterThan(rgbToHsl(a.bg).l);
    expect(rgbToHsl(a.bgDeep).l).toBeLessThan(rgbToHsl(a.bg).l);
  });

  it("names no colors of its own in the engine", () => {
    const dir = join(__dirname, "..");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src.match(/#[0-9a-f]{3,8}\b/gi) ?? [], file).toEqual([]);
    }
  });
});

describe("easing and springs", () => {
  it("solves cubic-bezier curves", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 2);
    // Expo out is most of the way there early; the sharp exit has hardly started at half time
    expect(EXPO_OUT(0.3)).toBeGreaterThan(0.75);
    expect(SHARP_IN(0.5)).toBeLessThan(0.2);
    let last = 0;
    for (let x = 0; x <= 1; x += 0.05) {
      expect(EXPO_OUT(x)).toBeGreaterThanOrEqual(last - 1e-9);
      last = EXPO_OUT(x);
    }
  });

  it("overshoots once and settles (stiffness 300, damping 22, mass 1)", () => {
    let peak = 0;
    for (let t = 0; t < 1; t += 0.005) peak = Math.max(peak, springAt(t));
    expect(peak).toBeGreaterThan(1.04);
    expect(peak).toBeLessThan(1.12);
    expect(springAt(0)).toBe(0);
    expect(Math.abs(springAt(1.2) - 1)).toBeLessThan(0.005);
    expect(springSettle(DEFAULT_SPRING)).toBeLessThan(0.7);
  });
});

describe("piece motion", () => {
  const def = MOTION_STYLES[0];

  it("starts moved down, smaller, turned and blurred, all at once, and ends at rest", () => {
    const start = piecePose(def, 1e-4, 0, 1);
    expect(start.dy).toBeCloseTo(40, 0);
    expect(start.scale).toBeCloseTo(0.85, 2);
    expect((start.rot * 180) / Math.PI).toBeCloseTo(3, 1);
    expect(start.blur).toBeCloseTo(8, 0);
    const rest = piecePose(def, 3, 0, 1);
    expect(rest).toMatchObject({ blur: 0, alpha: 1, moving: false });
    expect(rest.dy).toBeCloseTo(0, 6);
    expect(rest.rot).toBeCloseTo(0, 6);
    expect(rest.scale).toBeCloseTo(1, 3);
  });

  it("leaves on the sharp curve near the line's end", () => {
    expect(exitProgress(0.5, 3, 0, 10)).toBe(0);
    expect(exitProgress(3, 3, 0, 10)).toBe(1);
    const out = piecePose(def, 3, 0.9, 1);
    expect(out.alpha).toBeLessThan(0.7);
    expect(out.dy).toBeLessThan(0);
  });

  it("staggers each piece 0.025–0.04 s apart when the whole line comes in", () => {
    for (const d of MOTION_STYLES) {
      const style = { ...DEFAULT_STYLE, motionStyle: d.id, kineticReveal: "line" as const };
      const L = layoutKinetic(frameFor(style, 0, 0.1), d, lines[0]);
      // Boxed accents wait for their box; the rest follow the stagger in reading order
      const plain = L.pieces.filter((p) => !p.accent || d.accent === "color");
      const steps = plain.slice(1).map((p, i) => (p.appear - plain[i].appear) / (p.order - plain[i].order));
      expect(steps.length).toBeGreaterThan(0);
      for (const g of steps) {
        expect(g).toBeGreaterThanOrEqual(0.025 - 1e-9);
        expect(g).toBeLessThanOrEqual(0.04 + 1e-9);
      }
      if (d.unit === "char") expect(L.pieces.length).toBeGreaterThan(lines[0].words.length);
      else expect(L.pieces.length).toBe(lines[0].words.length);
    }
  });

  it("sets headline type tight", () => {
    for (const d of MOTION_STYLES) {
      expect(d.tracking).toBeGreaterThanOrEqual(-0.05);
      expect(d.tracking).toBeLessThanOrEqual(-0.03);
      expect(d.leading).toBeGreaterThanOrEqual(1.1);
      expect(d.leading).toBeLessThanOrEqual(1.2);
    }
  });

  it("puts a box only behind marked words, opening before their text", () => {
    const d = MOTION_STYLES.find((s) => s.id === "highlight_box")!;
    const L = layoutKinetic(frameFor({ ...DEFAULT_STYLE, motionStyle: d.id }, 0, 0.1), d, lines[0]);
    expect(L.boxes).toHaveLength(1);
    const text = L.pieces[L.boxes[0].first];
    expect(text.accent).toBe(true);
    expect(text.appear).toBeGreaterThan(L.boxes[0].at);
    expect(
      L.pieces
        .filter((p) => p.accent)
        .map((p) => p.text)
        .join(""),
    ).toBe("사랑해");
  });
});

describe("virtual camera", () => {
  const style = { ...DEFAULT_STYLE, motionStyle: "hype_pop" as MotionStyleId };

  it("punches on a marked word and on a ' !' line, and never shows the edges", () => {
    const accentAt = lines[0].startTime + lines[0].words[1].startOffset;
    const hit = cameraAt(style, [lines[0]], accentAt + 0.02, 1280, 720);
    const later = cameraAt(style, [lines[0]], accentAt + 0.85, 1280, 720);
    expect(hit.scale).toBeGreaterThan(later.scale);
    expect(hit.scale).toBeGreaterThan(1.05);
    expect(punchTimes(lines[1], false)).toContain(lines[1].startTime);
    for (let t = 0; t < 10; t += 0.05)
      expect(cameraAt(style, [lines[0]], t, 1280, 720).scale).toBeGreaterThanOrEqual(1);
  });

  it("stays still with every vibration off, with the camera off, or with the theme's own motion", () => {
    expect(cameraAt({ ...style, noVibration: true }, [lines[0]], 2, 1280, 720)).toBe(IDENTITY_CAMERA);
    expect(cameraAt({ ...style, kineticCamera: false }, [lines[0]], 2, 1280, 720)).toBe(IDENTITY_CAMERA);
    expect(cameraAt({ ...style, motionStyle: "theme" }, [lines[0]], 2, 1280, 720)).toBe(IDENTITY_CAMERA);
  });

  it("drifts slowly between 1 and 1 + drift", () => {
    const calm = { ...DEFAULT_STYLE, motionStyle: "editorial_blur" as MotionStyleId };
    const scales = Array.from({ length: 200 }, (_, i) => cameraAt(calm, [null], i * 0.15, 1280, 720).scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.0601);
    expect(Math.max(...scales)).toBeGreaterThan(1.05);
  });
});

describe("motion styles in the frame", () => {
  it("draws every style the same way each time (preview = export)", () => {
    for (const d of MOTION_STYLES) {
      const style = { ...DEFAULT_STYLE, motionStyle: d.id };
      const a = draw(style, 1.3);
      const b = draw(style, 1.3);
      expect(a.texts.length).toBeGreaterThan(0);
      expect(a.texts).toEqual(b.texts);
      expect(a.draws()).toBe(b.draws());
    }
  });

  it("splits the line into pieces while it comes in, and draws whole words once settled", () => {
    const style = {
      ...DEFAULT_STYLE,
      motionStyle: "smooth_reveal" as MotionStyleId,
      kineticReveal: "line" as const,
    };
    const coming = draw(style, 1.05).texts;
    expect(coming.some((t) => Array.from(t).length === 1)).toBe(true);
    const settled = draw(style, 2.8).texts;
    expect(settled).toEqual(expect.arrayContaining(["너를", "사랑해", "오늘도"]));
  });

  it("blurs pieces into focus in the editorial style", () => {
    const style = { ...DEFAULT_STYLE, motionStyle: "editorial_blur" as MotionStyleId };
    const out = draw(style, 1.1);
    expect(out.filters.some((f) => f.startsWith("blur(")) || out.shadows.some((b) => b > 0)).toBe(true);
  });

  it("leaves the theme's own lyrics alone in theme mode", () => {
    const theme = draw({ ...DEFAULT_STYLE, motionStyle: "theme" }, 2.5).texts;
    const kinetic = draw({ ...DEFAULT_STYLE, motionStyle: "smooth_reveal" }, 2.5).texts;
    expect(theme).not.toEqual(kinetic);
  });

  it("draws the user-color backgrounds", () => {
    for (const bg of ["solid", "spotlight", "aurora"] as const) {
      expect(draw({ ...DEFAULT_STYLE, kineticBg: bg }, 2).draws()).toBeGreaterThan(0);
    }
  });
});

describe("settings", () => {
  it("sanitizes saved values", () => {
    expect(sanitizeMotionStyle("hype_pop")).toBe("hype_pop");
    expect(sanitizeMotionStyle("theme")).toBe("theme");
    expect(sanitizeMotionStyle("whatever")).toBe("smooth_reveal");
    expect(sanitizeKineticBg("aurora")).toBe("aurora");
    expect(sanitizeKineticBg(3)).toBe("theme");
    expect(motionStyleOf({ motionStyle: "theme" })).toBeNull();
  });

  it("adds grain and vignette only where the finish tab does not", () => {
    const base = { ...DEFAULT_STYLE, motionStyle: "smooth_reveal" as MotionStyleId };
    expect(wantsCinematicBase(base)).toEqual({ grain: true, vignette: true });
    expect(wantsCinematicBase({ ...base, cinematicBase: false })).toEqual({ grain: false, vignette: false });
    const finish = {
      ...(base.finish ?? {}),
      filters: { grain: { on: true, amount: 0.4 } },
    } as StyleSettings["finish"];
    expect(wantsCinematicBase({ ...base, finish })).toEqual({ grain: false, vignette: true });
  });

  it("uses only bundled type", () => {
    expect(kineticFontStack({ lyricFont: "", mainFont: "x" })).toBe(KINETIC_FONT_STACK);
    expect(KINETIC_FONT_STACK).not.toMatch(/Malgun|Gulim|맑은|굴림|Apple SD/);
    const vendored = JSON.parse(
      readFileSync(join(__dirname, "../../../../../../static/fonts/fonts.json"), "utf8"),
    ) as {
      family: string;
    }[];
    for (const fam of ["Pretendard", "Inter", "Noto Sans KR", "Noto Sans JP"])
      expect(
        vendored.some((f) => f.family === fam),
        fam,
      ).toBe(true);
  });
});
