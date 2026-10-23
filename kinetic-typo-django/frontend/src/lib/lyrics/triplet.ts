/**
 * [mm:ss.xx], optionally with an end time (~mm:ss.xx) and per-line options
 * (;key=value, see line-options.ts), then the text. Groups: 1-2 start,
 * 3-4 end, 5 options, 6 text.
 */
export const LRC_LINE =
  /^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)(?:~(\d{1,2}):(\d{2}(?:\.\d{1,3})?))?(;[^\]]*)?\]\s*(.*)$/;
export const LRC_PREFIX = /^\[\d{1,2}:\d{2}(?:\.\d{1,3})?(?:~\d{1,2}:\d{2}(?:\.\d{1,3})?)?(?:;[^\]]*)?\]\s*/;

export const hasJapanese = (s: string) => /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(s);
export const isKoreanOnly = (s: string) => /[\uAC00-\uD7AF]/.test(s) && !hasJapanese(s) && !LRC_LINE.test(s);

/**
 * Merges stacked blocks (Japanese line, Korean pronunciation line, Korean
 * meaning line) into "Japanese | pronunciation | meaning". A Japanese line
 * followed by one Korean line becomes "Japanese | pronunciation". Text that
 * already uses "|" is left as typed.
 */
export function normalizeMultilineJapaneseBlocks(text: string): string[] {
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.some((l) => l.includes("|"))) return rawLines;

  const merged: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const cur = rawLines[i];
    const next1 = rawLines[i + 1] ?? "";
    const next2 = rawLines[i + 2] ?? "";
    if (hasJapanese(cur) && isKoreanOnly(next1) && isKoreanOnly(next2)) {
      merged.push(`${cur} | ${next1} | ${next2}`);
      i += 3;
    } else if (hasJapanese(cur) && isKoreanOnly(next1)) {
      merged.push(`${cur} | ${next1}`);
      i += 2;
    } else {
      merged.push(cur);
      i += 1;
    }
  }
  return merged;
}

export interface LyricTriplet {
  /** Shown in the center as kinetic typography. */
  mainRaw: string;
  /** Bottom subtitle row 1. */
  pronText: string;
  /** Bottom subtitle row 2. */
  transText: string;
}

export function splitLyricTriplet(content: string): LyricTriplet {
  const parts = content.split(/\s*\|\s*/);
  return {
    mainRaw: (parts[0] ?? "").trim(),
    pronText: (parts[1] ?? "").trim(),
    transText: (parts[2] ?? "").trim(),
  };
}
