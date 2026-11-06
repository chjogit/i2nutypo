import type { StyleSettings } from "@/types/project";
import { ensureLyricFont } from "@/lib/fonts/catalog";

// Type for the kinetic engine. Every family here is served from static/fonts
// (frontend/scripts/vendor-fonts.mjs), so no system font (Malgun Gothic,
// Gulim, ...) is ever drawn: the stack ends in bundled Noto for kana and hangul.

/** Pretendard first (Hangul and Latin), Inter for Latin, Noto for whatever is left. */
export const KINETIC_FONT_STACK = "'Pretendard', 'Inter', 'Noto Sans KR', 'Noto Sans JP', sans-serif";

/** The families the stack needs loaded before the canvas may draw with it. */
const STACK_FAMILIES = ["Pretendard", "Inter", "Noto Sans KR", "Noto Sans JP"] as const;

/** The lyric font picked by the user (effectiveStyle puts it in mainFont), else the kinetic stack. */
export function kineticFontStack(style: Pick<StyleSettings, "lyricFont" | "mainFont">): string {
  return style.lyricFont ? style.mainFont : KINETIC_FONT_STACK;
}

let ready = false;
let pending: Promise<void> | null = null;
let sampled = "";

/** True once the kinetic fonts are loaded (or failed to load, offline), so the canvas may draw. */
export const kineticFontsReady = (): boolean => ready;

/**
 * Loads every family of the stack (and the user's lyric font) for the glyphs
 * in `sample`, then waits for document.fonts.ready. Resolves anyway when a
 * font cannot be fetched, so drawing is never held forever.
 */
export function ensureKineticFonts(sample = "가あA", lyricFont = ""): Promise<void> {
  if (typeof document === "undefined") {
    ready = true;
    return Promise.resolve();
  }
  const key = `${lyricFont}|${sample}`;
  if (pending && sampled === key) return pending;
  sampled = key;
  const text = sample.slice(0, 4000) || "가あA";
  pending = Promise.all([
    ...STACK_FAMILIES.map((fam) => ensureLyricFont(fam, text, true)),
    lyricFont ? ensureLyricFont(lyricFont, text) : Promise.resolve(),
  ])
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      ready = true;
    });
  return pending;
}
