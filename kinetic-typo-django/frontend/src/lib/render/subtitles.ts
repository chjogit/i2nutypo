import type { LyricLine, SubtitleSettings } from "@/types/project";
import type { Ctx2D } from "./motifs";
import { recordTextBounds, type TextBounds } from "./text-bounds";
import { widthAround, wrapText } from "./wrap";

const SUBTITLE_FADE_IN_SEC = 0.18;
/** Between the main line's text and an overlapping line's in the same row. */
const OVERLAP_SEPARATOR = " / ";
/** Subtitle sizes are given at this canvas height and scaled from it. */
const REFERENCE_HEIGHT = 720;

type SubtitleLine = Pick<LyricLine, "cleanText" | "pronText" | "transText">;

export interface BottomSubtitleContext {
  ctx: Ctx2D;
  line: SubtitleLine;
  lineElapsed: number;
  /** Overlapping ("&") lines on screen with `line`; their text joins each row after a "/". */
  overlaps?: readonly SubtitleLine[];
  W: number;
  H: number;
  settings: SubtitleSettings;
  letterbox: boolean;
  /** "top" moves the box to the upper edge, e.g. when a character stands at the bottom. Default "bottom". */
  placement?: "bottom" | "top";
  /** Horizontal shift the caller applies with translate; only used to keep wrapped rows inside the frame. */
  shiftX?: number;
  isFlashFrame: boolean;
  transparentBg: boolean;
  /** Font of the lyric row in the bottom-only display (the video's lyric font). */
  mainFont: string;
  /** In the bottom-only display the subtitles are the lyrics, so their area is recorded here for the preview's text box. */
  bounds?: TextBounds;
}

/** Whether the frame shows the line's lyrics in the middle (false: only in the subtitles). */
export const showsKineticLyrics = (s: SubtitleSettings): boolean => !s.enabled || s.display === "kinetic";

/** Whether the subtitles have anything to show for a line. */
export function hasSubtitleText(
  s: SubtitleSettings,
  line: Pick<LyricLine, "cleanText" | "pronText" | "transText">,
): boolean {
  if (!s.enabled) return false;
  return (
    line.pronText !== "" || line.transText !== "" || (s.display === "bottomOnly" && line.cleanText !== "")
  );
}

/**
 * Fixed bottom subtitles: pronunciation on the first row, meaning on the
 * second, with the lyric line itself on top in the bottom-only display.
 * Overlapping lines join the same rows: "pronunciation / its pronunciation".
 * Drawn in screen space, outside the kinetic camera transform.
 */
export function drawBottomSubtitles(c: BottomSubtitleContext): void {
  if (c.bounds && c.settings.display === "bottomOnly") {
    c.bounds.lyrics = recordTextBounds(c.ctx, () => drawSubtitleBox(c));
  } else {
    drawSubtitleBox(c);
  }
}

function drawSubtitleBox({
  ctx,
  line,
  lineElapsed,
  overlaps = [],
  W,
  H,
  settings,
  letterbox,
  isFlashFrame,
  transparentBg,
  placement = "bottom",
  shiftX = 0,
  mainFont,
}: BottomSubtitleContext): void {
  const all = [line, ...overlaps];
  const joined = (key: keyof SubtitleLine) =>
    all
      .map((l) => l[key])
      .filter(Boolean)
      .join(OVERLAP_SEPARATOR);
  const shown: SubtitleLine = {
    cleanText: joined("cleanText"),
    pronText: joined("pronText"),
    transText: joined("transText"),
  };
  if (!hasSubtitleText(settings, shown)) return;

  const scale = H / REFERENCE_HEIGHT;
  const pronPx = Math.max(12, Math.round(settings.pronFontSize * scale));
  const transPx = Math.max(14, Math.round(settings.transFontSize * scale));
  const lineGap = Math.round(10 * scale);
  const padX = Math.round(24 * scale);
  const padY = Math.round(12 * scale);
  const mainPx = Math.max(14, Math.round(settings.mainFontSize * scale));
  const mainFontSpec = `800 ${mainPx}px ${mainFont}`;
  const pronFont = `600 ${pronPx}px ${settings.font}`;
  const transFont = `700 ${transPx}px ${settings.font}`;

  ctx.save();
  ctx.globalAlpha = transparentBg ? 1 : Math.min(1, Math.max(0, lineElapsed / SUBTITLE_FADE_IN_SEC));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Rows wider than the frame wrap onto more lines instead of being squeezed
  const edge = Math.round(W * 0.04);
  const maxTextW = Math.max(pronPx * 4, widthAround(W / 2 + shiftX, W, edge) - padX * 2);
  const wrapRow = (text: string, font: string) => {
    ctx.font = font;
    const rows = wrapText(text, maxTextW, (t) => ctx.measureText(t).width);
    return { rows, width: Math.max(0, ...rows.map((r) => ctx.measureText(r).width)) };
  };
  const none = { rows: [] as string[], width: 0 };
  const main =
    settings.display === "bottomOnly" && shown.cleanText ? wrapRow(shown.cleanText, mainFontSpec) : none;
  const pron = shown.pronText ? wrapRow(shown.pronText, pronFont) : none;
  const trans = shown.transText ? wrapRow(shown.transText, transFont) : none;
  const rowCount = main.rows.length + pron.rows.length + trans.rows.length;

  const contentH =
    main.rows.length * mainPx +
    pron.rows.length * pronPx +
    trans.rows.length * transPx +
    Math.max(0, rowCount - 1) * lineGap;
  const boxW = Math.max(main.width, pron.width, trans.width) + padX * 2;
  const boxH = contentH + padY * 2;
  const letterboxOffset = letterbox ? Math.round(H * 0.085) : 0;
  const edgeGap = Math.round(settings.bottomOffset * scale) + letterboxOffset;
  const boxTopY = placement === "top" ? edgeGap : H - edgeGap - boxH;

  if (settings.bgBox && !transparentBg) {
    ctx.fillStyle = isFlashFrame ? "rgba(255, 255, 255, 0.82)" : "rgba(7, 10, 18, 0.72)";
    ctx.beginPath();
    ctx.roundRect((W - boxW) / 2, boxTopY, boxW, boxH, Math.round(14 * scale));
    ctx.fill();
  }

  let cursorY = boxTopY + padY;
  const drawRow = (text: string, font: string, px: number, color: string, strokeAlpha: number) => {
    const yCenter = cursorY + px / 2;
    ctx.font = font;
    ctx.lineWidth = Math.max(3, Math.round(px * 0.16));
    ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(0,0,0,${strokeAlpha})`;
    ctx.strokeText(text, W / 2, yCenter);
    ctx.fillStyle = isFlashFrame ? "#0f172a" : color;
    ctx.fillText(text, W / 2, yCenter);
    cursorY += px + lineGap;
  };

  for (const row of main.rows) drawRow(row, mainFontSpec, mainPx, settings.mainColor, 0.9);
  for (const row of pron.rows) drawRow(row, pronFont, pronPx, settings.pronColor, 0.85);
  for (const row of trans.rows) drawRow(row, transFont, transPx, settings.transColor, 0.88);

  ctx.restore();
}
