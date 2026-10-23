import type { FxToggles, LyricLine, StyleSettings } from "@/types/project";
import { lyricFontStack } from "@/lib/fonts/catalog";

/**
 * The style a frame is drawn with: every user adjustment, with the lyric font
 * picked in the lyrics section and the active line's own overrides (size,
 * glitch, shake) on top. Presets and customizing are one mode now, so nothing
 * is set aside.
 */
export function effectiveStyle(base: StyleSettings, line: LyricLine | null): StyleSettings {
  const font = base.lyricFont ? lyricFontStack(base.lyricFont) : "";
  const style = font ? { ...base, mainFont: font } : base;
  const ls = line?.lineStyle;
  if (!ls) return style;
  return {
    ...style,
    fontScale: style.fontScale * (ls.size ?? 1),
    detail: {
      ...style.detail,
      glitch: ls.glitch ?? style.detail.glitch,
      shake: ls.shake ?? style.detail.shake,
    },
  };
}

/** The line whose own position offsets apply. */
export function lineForOffsets(_style: StyleSettings, line: LyricLine | null): LyricLine | null {
  return line;
}

/** The classic look's effect switches, as the user set them. */
export function effectiveFx(_style: StyleSettings, fx: FxToggles): FxToggles {
  return fx;
}
