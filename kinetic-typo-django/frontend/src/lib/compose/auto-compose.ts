import type { LineStyle, LookElementState, StyleSettings } from "@/types/project";
import type { TimedLyric } from "@/lib/lyrics/parse";
import { mulberry32, pickSome } from "@/lib/random";
import { themeAt } from "@/lib/render/theme-clips";
import {
  getLookPreset,
  LOOK_ELEMENTS,
  LOOK_PRESET_IDS,
  lookElementKey,
  lyricLookOf,
  MAX_MIX_LOOKS,
  type ThemedPresetId,
} from "@/lib/render/looks/presets";
import {
  activeMotions,
  MOTIONS,
  MOTIONS_PER_SONG,
  motionNumber,
  THEME_MOTIONS,
} from "@/lib/render/looks/motions";

// One-click composition: themes, colors, elements, strengths and each line's
// motion, all from one seed so the same seed gives the same video again.

/** Themes that look right with strong glitches. */
const GLITCHY: readonly ThemedPresetId[] = ["digital_crt", "dark_glitch", "neon_sign"];

const between = (rand: () => number, lo: number, hi: number) => lo + (hi - lo) * rand();
const round2 = (n: number) => Number(n.toFixed(2));

const THEMED = LOOK_PRESET_IDS.filter((id): id is ThemedPresetId => id !== "classic");

/** The style picks for a seed: one to three themes, their colors, elements, strengths and motions. */
export function composeStyle(style: StyleSettings, seed: number): Partial<StyleSettings> {
  const rand = mulberry32(seed);
  const count = 1 + Math.floor(rand() * (MAX_MIX_LOOKS + 1));
  const themes = pickSome(THEMED, Math.min(count, MAX_MIX_LOOKS + 1), rand);
  const [base, ...mix] = themes;
  const lyricLook = mix.length > 0 && rand() < 0.5 ? mix[Math.floor(rand() * mix.length)] : null;

  const lookElements: Record<string, LookElementState> = { ...style.lookElements };
  for (const id of themes) {
    for (const def of LOOK_ELEMENTS[id]) {
      const key = lookElementKey(id, def.id);
      // Keep where the user moved an element; roll whether it shows and how strong
      const prev = style.lookElements[key];
      // Extras that are off by default come on more rarely, so three themes do not crowd the frame
      const on = def.on ? rand() < 0.85 : rand() < (def.extra ? 0.2 : 0.35);
      lookElements[key] = { ...prev, on, amount: round2(between(rand, 0.35, 1)) };
    }
  }

  const motionPicks = { ...style.motionPicks };
  for (const id of themes) motionPicks[id] = pickSome(THEME_MOTIONS[id], MOTIONS_PER_SONG, rand);

  const glitchy = themes.some((id) => GLITCHY.includes(id));
  return {
    ...getLookPreset(base).palette,
    lookPreset: base,
    mixLooks: mix,
    lyricLook,
    lookElements,
    motionPicks,
    detail: {
      ...style.detail,
      glitch: round2(glitchy ? between(rand, 0.45, 0.85) : between(rand, 0.2, 0.55)),
      shake: round2(between(rand, 0.2, glitchy ? 0.65 : 0.45)),
    },
  };
}

/** Picks a motion for every unlocked line from the lyric theme's active motions, never twice in a row. */
export function composeLines(lines: readonly TimedLyric[], style: StyleSettings, seed: number): TimedLyric[] {
  const rand = mulberry32(seed ^ 0x5bd1e995);
  let prev = 0;
  return lines.map((l) => {
    // A theme clip over the line decides which motions it draws from
    const at = themeAt(style, l.startTime);
    const theme = lyricLookOf(at);
    const list = theme === "classic" ? [] : activeMotions(at, theme);
    if (l.lineStyle.lock) {
      prev = l.lineStyle.motion ?? 0;
      return l;
    }
    if (list.length === 0) return { ...l, lineStyle: withoutMotion(l.lineStyle) };
    let n = motionNumber(list[Math.floor(rand() * list.length)]);
    if (n === prev && list.length > 1)
      n = motionNumber(list[(list.indexOf(MOTIONS[n - 1].id) + 1) % list.length]);
    prev = n;
    return { ...l, lineStyle: { ...l.lineStyle, motion: n } };
  });
}

function withoutMotion(ls: LineStyle): LineStyle {
  const rest = { ...ls };
  delete rest.motion;
  return rest;
}

/**
 * Another motion for one line: one of the lyric theme's active motions other
 * than the line's current one (any of the theme's eight when fewer are on).
 */
export function rerollMotion(
  line: Pick<TimedLyric, "lineStyle" | "startTime">,
  style: StyleSettings,
  rand: () => number,
): number {
  const at = themeAt(style, line.startTime);
  const theme = lyricLookOf(at);
  if (theme === "classic") return 0;
  const active = activeMotions(at, theme);
  const pool = (active.length > 1 ? active : THEME_MOTIONS[theme]).map(motionNumber);
  const others = pool.filter((n) => n !== line.lineStyle.motion);
  return others[Math.floor(rand() * others.length)] ?? pool[0];
}
