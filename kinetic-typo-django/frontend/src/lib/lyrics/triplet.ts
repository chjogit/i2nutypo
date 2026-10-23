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

/** "&" at the start of a lyric: sung at the same time as the line before it (chorus, duet). */
const OVERLAP_MARK = /^&\s*/;

/** Splits the "&" mark off a lyric (after any time tag): whether it was there, and the rest. */
export function splitOverlapMark(text: string): { overlap: boolean; body: string } {
  const prefix = text.match(LRC_PREFIX)?.[0] ?? "";
  const rest = text.slice(prefix.length);
  if (!OVERLAP_MARK.test(rest)) return { overlap: false, body: text };
  return { overlap: true, body: prefix + rest.replace(OVERLAP_MARK, "") };
}

/**
 * Merges stacked blocks (Japanese line, Korean pronunciation line, Korean
 * meaning line) into "Japanese | pronunciation | meaning". A Japanese line
 * followed by one Korean line becomes "Japanese | pronunciation". Text that
 * already uses "|" is left as typed. A block whose first line starts with "&"
 * stays one overlapping block, whether or not its other lines repeat the "&".
 */
export function normalizeMultilineJapaneseBlocks(text: string): string[] {
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.some((l) => l.includes("|"))) return rawLines;

  const marked = rawLines.map(splitOverlapMark);
  const merged: string[] = [];
  let i = 0;
  while (i < marked.length) {
    const { overlap, body: cur } = marked[i];
    const mark = (s: string) => (overlap ? markOverlap(s) : s);
    // The next lines join only when their "&" matches the first line's (or they have none)
    const follower = (k: number) => {
      const m = marked[k];
      return m && (!m.overlap || overlap) && isKoreanOnly(m.body) ? m.body : null;
    };
    const next1 = follower(i + 1);
    const next2 = next1 !== null ? follower(i + 2) : null;
    if (hasJapanese(cur) && next1 !== null && next2 !== null) {
      merged.push(mark(`${cur} | ${next1} | ${next2}`));
      i += 3;
    } else if (hasJapanese(cur) && next1 !== null) {
      merged.push(mark(`${cur} | ${next1}`));
      i += 2;
    } else {
      merged.push(rawLines[i]);
      i += 1;
    }
  }
  return merged;
}

/** Puts the "&" mark back on a lyric, after its time tag if it has one. */
export function markOverlap(text: string): string {
  const prefix = text.match(LRC_PREFIX)?.[0] ?? "";
  return `${prefix}& ${text.slice(prefix.length)}`;
}

export interface LyricTriplet {
  /** Shown in the center as kinetic typography. */
  mainRaw: string;
  /** Bottom subtitle row 1. */
  pronText: string;
  /** Bottom subtitle row 2. */
  transText: string;
  /** Written with a leading "&": shown over the line before it instead of replacing it. */
  overlap: boolean;
}

/** Splits "main | pronunciation | meaning"; a "&" before the main part marks the block as overlapping. */
export function splitLyricTriplet(content: string): LyricTriplet {
  const parts = content.split(/\s*\|\s*/).map((p) => splitOverlapMark(p.trim()));
  return {
    mainRaw: (parts[0]?.body ?? "").trim(),
    pronText: (parts[1]?.body ?? "").trim(),
    transText: (parts[2]?.body ?? "").trim(),
    overlap: parts[0]?.overlap ?? false,
  };
}
