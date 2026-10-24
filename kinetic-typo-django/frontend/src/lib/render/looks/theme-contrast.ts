import type { AutoContrast, LookPresetId, StyleSettings, ThemeContrast } from "@/types/project";
import { isThemedPresetId } from "./presets";

// Auto contrast kept per theme: each theme starts from a default that suits
// how it draws its lyrics, and the user's choice for a theme stays with that
// theme, so a theme clip on the timeline brings its own setting along.

const COLOR: ThemeContrast = { mode: "color", amount: 0.5 };
const OUTLINE: ThemeContrast = { mode: "outline", amount: 0.5 };
const OFF: ThemeContrast = { mode: "off", amount: 0.5 };

/**
 * Each theme's starting point. Glowing and neon lyrics keep their color and
 * get an edge; flat poster themes pick their own contrasting colors, so they
 * are left alone; lyrics over pictures, film and video get their color shifted.
 */
export const THEME_CONTRAST_DEFAULTS: Record<Exclude<LookPresetId, "classic">, ThemeContrast> = {
  album_jacket: COLOR,
  pop_cutout: OFF,
  tint_panels: COLOR,
  ballad_hud: COLOR,
  cinematic_fantasy: OUTLINE,
  digital_crt: OUTLINE,
  dark_glitch: OUTLINE,
  summer_film: COLOR,
  flat_type: OFF,
  eclipse_nebula: OUTLINE,
  mono_accent: OFF,
  vintage_paper: COLOR,
  pastel_dream: COLOR,
  crimson_ink: OUTLINE,
  sakura_breeze: COLOR,
  snow_night: COLOR,
  rain_window: COLOR,
  manga_panel: OFF,
  deep_sea: OUTLINE,
  neon_sign: OUTLINE,
};

/** The auto contrast a theme's lyrics use: the user's choice for that theme, else the theme's default. */
export function contrastFor(
  style: Pick<StyleSettings, "themeContrast">,
  preset: LookPresetId,
): ThemeContrast {
  const own = style.themeContrast?.[preset];
  if (own) return own;
  return isThemedPresetId(preset) ? THEME_CONTRAST_DEFAULTS[preset] : COLOR;
}

const MODES: readonly AutoContrast[] = ["off", "color", "outline"];

/** Saved per-theme choices, keeping only known themes and values in range. */
export function sanitizeThemeContrast(saved: unknown): Partial<Record<LookPresetId, ThemeContrast>> {
  const out: Partial<Record<LookPresetId, ThemeContrast>> = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (!isThemedPresetId(k) || !v || typeof v !== "object") continue;
    const { mode, amount } = v as Record<string, unknown>;
    if (!MODES.includes(mode as AutoContrast)) continue;
    const a = typeof amount === "number" && Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0.5;
    out[k] = { mode: mode as AutoContrast, amount: a };
  }
  return out;
}
