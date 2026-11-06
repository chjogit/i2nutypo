import type { StyleSettings } from "@/types/project";
import { contrastRatio, luminance } from "../looks/auto-contrast";

// Colors the kinetic engine draws with, all worked out from the four colors
// the user picked (background, text, point, secondary). Nothing here names a
// color of its own: every shade is the user's color moved in HSL, mixed with
// another of the user's colors, or made see-through.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Degrees 0..360. */
  h: number;
  /** 0..1. */
  s: number;
  l: number;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const clampByte = (x: number) => Math.round(clamp(x, 0, 255));

/**
 * Reads "#rgb", "#rrggbb", "#rrggbbaa", "rgb(...)" or "rgba(...)". Anything
 * else gives null, so the caller falls back to another of the user's colors.
 */
export function parseColor(input: string | undefined | null): Rgb | null {
  const s = String(input ?? "").trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const [r, g, b] = Array.from(m[1]).map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return { r: clampByte(Number(m[1])), g: clampByte(Number(m[2])), b: clampByte(Number(m[3])) };
  return null;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  if (ss === 0) {
    const v = clampByte(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: clampByte(ch(hh + 1 / 3) * 255),
    g: clampByte(ch(hh) * 255),
    b: clampByte(ch(hh - 1 / 3) * 255),
  };
}

/** CSS color string, see-through when alpha < 1. */
export function css(c: Rgb, alpha = 1): string {
  const a = clamp(alpha, 0, 1);
  return a >= 1 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${a.toFixed(3)})`;
}

/** The color moved in HSL: lightness and saturation added (−1..1), hue turned by degrees. */
export function shift(c: Rgb, d: { l?: number; s?: number; h?: number }): Rgb {
  const x = rgbToHsl(c);
  return hslToRgb({
    h: x.h + (d.h ?? 0),
    s: clamp(x.s + (d.s ?? 0), 0, 1),
    l: clamp(x.l + (d.l ?? 0), 0, 1),
  });
}

/** Straight mix of two colors, t = 0 gives a. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp(t, 0, 1);
  return {
    r: clampByte(a.r + (b.r - a.r) * k),
    g: clampByte(a.g + (b.g - a.g) * k),
    b: clampByte(a.b + (b.b - a.b) * k),
  };
}

export const lum = (c: Rgb): number => luminance(c.r, c.g, c.b);
export const contrastOf = (a: Rgb, b: Rgb): number => contrastRatio(lum(a), lum(b));

/**
 * A text color that reads on `fill`: the fill's own hue taken very dark on a
 * light fill and very light on a dark one, so the text stays in the family of
 * the user's color instead of plain black or white. If even that falls short
 * of `target` (WCAG ratio), the lightness goes all the way to 0 or 1.
 */
export function readableOn(fill: Rgb, target = 4.5): Rgb {
  const base = rgbToHsl(fill);
  // Which side gives more room: dark text on a fill brighter than mid grey
  const darkText = contrastRatio(lum(fill), 0) >= contrastRatio(lum(fill), 1);
  const steps = darkText ? [0.12, 0.08, 0.04, 0] : [0.97, 0.985, 1];
  for (const l of steps) {
    const c = hslToRgb({ h: base.h, s: Math.min(base.s, darkText ? 0.55 : 0.35), l });
    if (contrastOf(c, fill) >= target) return c;
  }
  return hslToRgb({ h: base.h, s: 0, l: darkText ? 0 : 1 });
}

/** Everything the kinetic renderer paints with, from the user's colors. */
export interface KineticPalette {
  bg: Rgb;
  /** The background lifted toward the light (the spotlight's center). */
  bgLift: Rgb;
  /** The background taken deeper (corners, shadows). */
  bgDeep: Rgb;
  /** Three soft colors for the aurora mesh, from the background, point and secondary colors. */
  aurora: [Rgb, Rgb, Rgb];
  text: Rgb;
  accent: Rgb;
  secondary: Rgb;
  /** Text drawn on a box filled with the point color. */
  onAccent: Rgb;
  /** Glow behind lyrics: the point color, see-through. */
  glow: string;
  /** Soft shadow under lyrics: the deep background, see-through. */
  shadow: string;
  /** True when the background is light, so shadows and glows go the other way. */
  lightBg: boolean;
}

type PaletteInput = Pick<StyleSettings, "bgColor" | "textColor" | "accentColor" | "secondaryColor">;

const cache = new Map<string, KineticPalette>();

/** The palette for the user's colors; cached by the four color strings. */
export function derivePalette(style: PaletteInput): KineticPalette {
  const key = `${style.bgColor}|${style.textColor}|${style.accentColor}|${style.secondaryColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const text = parseColor(style.textColor) ?? parseColor(style.accentColor) ?? { r: 255, g: 255, b: 255 };
  const bg = parseColor(style.bgColor) ?? shift(text, { l: -0.85 });
  const accent = parseColor(style.accentColor) ?? text;
  const secondary = parseColor(style.secondaryColor) ?? shift(accent, { h: 40 });
  const lightBg = lum(bg) > 0.4;
  const bgHsl = rgbToHsl(bg);
  // Nearly grey backgrounds take a breath of the point color, so the gradient is not flat grey
  const tinted = bgHsl.s < 0.08 ? mix(bg, accent, 0.12) : bg;
  const bgLift = shift(tinted, { l: lightBg ? 0.06 : 0.1, s: 0.06 });
  const bgDeep = shift(bg, { l: lightBg ? -0.1 : -0.07, s: 0.04 });
  const aurora: [Rgb, Rgb, Rgb] = [
    shift(mix(bg, accent, 0.45), { l: lightBg ? -0.02 : 0.04, s: 0.05 }),
    shift(mix(bg, secondary, 0.4), { l: lightBg ? -0.04 : 0.03, h: -12 }),
    shift(mix(bg, accent, 0.3), { h: 28, l: lightBg ? 0.02 : 0.06 }),
  ];
  const palette: KineticPalette = {
    bg,
    bgLift,
    bgDeep,
    aurora,
    text,
    accent,
    secondary,
    onAccent: readableOn(accent),
    glow: css(lightBg ? shift(accent, { l: -0.1 }) : accent, lightBg ? 0.28 : 0.5),
    shadow: css(shift(bg, { l: lightBg ? -0.45 : -0.2 }), lightBg ? 0.22 : 0.55),
    lightBg,
  };
  if (cache.size > 64) cache.clear();
  cache.set(key, palette);
  return palette;
}
