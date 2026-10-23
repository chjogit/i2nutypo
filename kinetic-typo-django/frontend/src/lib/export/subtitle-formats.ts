import type { AspectRatio, LyricLine, SubtitleSettings } from "@/types/project";
import { CANVAS_SIZE } from "@/lib/render/canvas-size";

export type SubtitleFormat = "srt" | "vtt" | "ass" | "lrc";

/** Which rows of each line go into the file: the lyric itself, its pronunciation and its meaning. */
export interface SubtitleRows {
  main: boolean;
  pron: boolean;
  trans: boolean;
}

export interface SubtitleFileOptions {
  format: SubtitleFormat;
  rows: SubtitleRows;
  /** Lines starting before this are left out, as the video hides them too. */
  introGateSec: number;
  /** ASS only: sizes, colors and fonts follow the video's subtitle settings. */
  subtitles: SubtitleSettings;
  mainFont: string;
  aspectRatio: AspectRatio;
  title: string;
}

export const SUBTITLE_FORMATS: Array<{ value: SubtitleFormat; label: string; hint: string }> = [
  { value: "srt", label: "SRT", hint: "유튜브·대부분의 플레이어와 편집기" },
  { value: "vtt", label: "VTT", hint: "웹 플레이어(HTML5 video)" },
  { value: "ass", label: "ASS", hint: "글꼴·색·크기까지 담는 고급 자막" },
  { value: "lrc", label: "LRC", hint: "음악 플레이어 가사 싱크" },
];

export const SUBTITLE_MIME: Record<SubtitleFormat, string> = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
  ass: "text/x-ssa",
  lrc: "text/plain",
};

interface Cue {
  start: number;
  end: number;
  main: string;
  pron: string;
  trans: string;
}

/** Manual breaks become spaces: each row stays one line so players keep the rows apart. */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

function toCues(lines: readonly LyricLine[], rows: SubtitleRows, introGateSec: number): Cue[] {
  return [...lines]
    .filter((l) => l.startTime >= introGateSec)
    .sort((a, b) => a.startTime - b.startTime)
    .map((l) => ({
      start: Math.max(0, l.startTime),
      end: Math.max(l.startTime + 0.01, l.endTime),
      main: rows.main ? oneLine(l.cleanText) : "",
      pron: rows.pron ? oneLine(l.pronText) : "",
      trans: rows.trans ? oneLine(l.transText) : "",
    }))
    .filter((c) => c.main || c.pron || c.trans);
}

const rowsOf = (c: Cue) => [c.main, c.pron, c.trans].filter(Boolean);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 00:01:02,345 (SRT) or 00:01:02.345 (VTT). */
function clock(sec: number, sep: "," | "."): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** 0:01:02.34 (ASS centiseconds). */
function assClock(sec: number): string {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

/** [01:02.34] */
function lrcClock(sec: number): string {
  const cs = Math.round(sec * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `[${pad(m)}:${pad(s)}.${pad(cs % 100)}]`;
}

function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${clock(c.start, ",")} --> ${clock(c.end, ",")}\n${rowsOf(c).join("\n")}\n`)
    .join("\n");
}

function toVtt(cues: Cue[]): string {
  // "-->" would end a cue's timing line early; a blank line would end the cue
  const safe = (s: string) => s.replace(/-->/g, "→");
  const body = cues
    .map((c) => `${clock(c.start, ".")} --> ${clock(c.end, ".")}\n${rowsOf(c).map(safe).join("\n")}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

/** #RRGGBB to ASS &H00BBGGRR; anything else falls back to white. */
function assColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "ffffff";
  return `&H00${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`.toUpperCase();
}

/** First family of a CSS font stack, without quotes. */
const firstFamily = (stack: string, fallback: string) =>
  stack
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "") || fallback;

function toAss(cues: Cue[], o: SubtitleFileOptions): string {
  const { width, height } = CANVAS_SIZE[o.aspectRatio];
  const sub = o.subtitles;
  const k = height / 720;
  const subFont = firstFamily(sub.font, "Noto Sans KR");
  const mainFont = firstFamily(o.mainFont, subFont);
  // Bottom center (2) or top center (8); the margin is the gap from that edge
  const align = sub.position === "top" ? 8 : 2;
  const marginV = Math.round(sub.bottomOffset * k);
  // BorderStyle 3 draws an opaque box behind the text, like the video's subtitle box
  const border = sub.bgBox ? "3,2,0" : "1,2,1";
  const back = sub.bgBox ? "&H80000000" : "&H00000000";
  const style = (name: string, font: string, size: number, color: string) =>
    `Style: ${name},${font},${Math.round(size * k)},${assColor(color)},&H000000FF,&H00000000,${back},0,0,0,0,100,100,0,0,${border},${align},40,40,${marginV},1`;
  // Braces start override tags in ASS, so lyric text keeps them out
  const plain = (s: string) => s.replace(/[{}]/g, "");
  const text = (c: Cue) => {
    const parts: string[] = [];
    if (c.main) parts.push(`{\\rMain}${plain(c.main)}`);
    if (c.pron) parts.push(`{\\rPron}${plain(c.pron)}`);
    if (c.trans) parts.push(`{\\rTrans}${plain(c.trans)}`);
    return parts.join("\\N");
  };
  return [
    "[Script Info]",
    `Title: ${o.title || "Kinetic Typo"}`,
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("Main", mainFont, sub.mainFontSize, sub.mainColor),
    style("Pron", subFont, sub.pronFontSize, sub.pronColor),
    style("Trans", subFont, sub.transFontSize, sub.transColor),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map((c) => `Dialogue: 0,${assClock(c.start)},${assClock(c.end)},Main,,0,0,0,,${text(c)}`),
    "",
  ].join("\n");
}

/** LRC has one row per time tag: each row repeats the line's tag, and a blank tag ends a line before a gap. */
function toLrc(cues: Cue[], title: string): string {
  const out: string[] = [];
  if (title) out.push(`[ti:${title}]`);
  out.push("[by:Kinetic Typo Studio]");
  cues.forEach((c, i) => {
    for (const row of rowsOf(c)) out.push(`${lrcClock(c.start)}${row}`);
    const next = cues[i + 1];
    if (!next || next.start - c.end > 0.05) out.push(lrcClock(c.end));
  });
  return `${out.join("\n")}\n`;
}

/** Builds a subtitle file from the synced lyric lines. */
export function buildSubtitleFile(lines: readonly LyricLine[], o: SubtitleFileOptions): string {
  const cues = toCues(lines, o.rows, o.introGateSec);
  switch (o.format) {
    case "srt":
      return toSrt(cues);
    case "vtt":
      return toVtt(cues);
    case "ass":
      return toAss(cues, o);
    case "lrc":
      return toLrc(cues, o.title);
  }
}

/** Number of lines that would land in the file, to tell the user before saving. */
export const countSubtitleCues = (lines: readonly LyricLine[], rows: SubtitleRows, introGateSec: number) =>
  toCues(lines, rows, introGateSec).length;
