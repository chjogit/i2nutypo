import type { LineStyle, LookPresetId, LyricLine, LyricOrientation, StyleSettings } from "@/types/project";
import type { LookFrame, LookRenderer } from "./frame";
import { drawVerticalLyrics, drawWordLyrics } from "./kit";

// Lyrics set across (horizontal) or in columns (vertical, tategaki) as the
// user picks, over the whole video or for one line. "auto" keeps the theme's
// own layout. A theme asked for the other direction draws its lyrics with the
// shared word block or column layout in its own colors.

/** Themes whose lyrics are set in columns. */
const VERTICAL_THEMES: ReadonlySet<LookPresetId> = new Set(["cinematic_fantasy", "crimson_ink"]);

export const themeIsVertical = (preset: LookPresetId): boolean => VERTICAL_THEMES.has(preset);

/** LineStyle.orient values: 1 across, 2 in columns; missing follows the whole video. */
export const ORIENT_HORIZONTAL = 1;
export const ORIENT_VERTICAL = 2;

export function lineOrientation(lineStyle: LineStyle | undefined): LyricOrientation {
  const o = lineStyle?.orient;
  return o === ORIENT_HORIZONTAL ? "horizontal" : o === ORIENT_VERTICAL ? "vertical" : "auto";
}

/** The direction this line is set in: its own choice, else the video's, else the theme's. */
export function effectiveOrientation(
  preset: LookPresetId,
  style: Pick<StyleSettings, "lyricOrientation">,
  line: Pick<LyricLine, "lineStyle"> | null,
): "horizontal" | "vertical" {
  const own = lineOrientation(line?.lineStyle);
  const pick = own !== "auto" ? own : (style.lyricOrientation ?? "auto");
  if (pick !== "auto") return pick;
  return themeIsVertical(preset) ? "vertical" : "horizontal";
}

/**
 * The theme's lyrics, or the shared layout in the direction the user picked
 * when the theme would set them the other way.
 */
export function orientedLyrics(r: LookRenderer, f: LookFrame): (g: LookFrame) => void {
  const own = lineOrientation(f.line?.lineStyle);
  const pick = own !== "auto" ? own : (f.style.lyricOrientation ?? "auto");
  if (pick === "auto" || (pick === "vertical") === themeIsVertical(f.preset)) return r.lyrics;
  if (pick === "vertical")
    return (g) =>
      drawVerticalLyrics(g, {
        size: 0.06,
        weight: 800,
        color: g.style.textColor,
        accentColor: g.style.accentColor,
      });
  return (g) =>
    drawWordLyrics(g, {
      cells: [9, 10, 5, 6, 13, 14, 1, 2],
      size: [0.065, 0.09],
      weight: 800,
      font: "main",
      motion: "rise",
      motionAmount: 0.6,
      color: g.style.textColor,
      accentColor: g.style.accentColor,
    });
}
