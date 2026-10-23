import type { LineStyle, LyricLine } from "@/types/project";
import { COLLAB_PARTS } from "@/lib/presets/collab-parts";
import { formatLineOptions, parseLineOptions } from "./line-options";
import { detectWordSemanticEffect, splitManualBreaks, tokenizeMultilingualLine } from "./tokenize";
import {
  hasJapanese,
  isKoreanOnly,
  LRC_LINE,
  LRC_PREFIX,
  markOverlap,
  normalizeMultilineJapaneseBlocks,
  splitLyricTriplet,
} from "./triplet";

/** Share of a line's duration over which its words appear. */
const WORD_ACTIVE_SPAN = 0.82;
export const MIN_LINE_DURATION = 0.6;

const round2 = (n: number) => Number(n.toFixed(2));

export interface ParseLyricsOptions {
  duration: number;
  introGateSec: number;
}

/**
 * Turns LRC-style lyrics into timed lines and words. Untimed lines are spread
 * evenly after the intro gate, and no line starts before the gate. A line
 * written "main | pronunciation | meaning" (or stacked on three lines, see
 * normalizeMultilineJapaneseBlocks) animates only the main part; the other
 * two become bottom subtitles. A line starting with "&" overlaps the line
 * before it: without a time of its own it starts with that line, and it
 * ends with it unless an end time is written.
 */
export function parseLyrics(text: string, { duration, introGateSec }: ParseLyricsOptions): LyricLine[] {
  const rawLines = normalizeMultilineJapaneseBlocks(text);

  const drafts: Array<{
    index: number;
    startTime: number | null;
    /** Written as [start~end] when the line ends before the next one starts. */
    endTime: number | null;
    offsetX: number;
    offsetY: number;
    lineStyle: LineStyle;
    content: string;
    pronText: string;
    transText: string;
    overlap: boolean;
  }> = [];
  rawLines.forEach((lineStr, index) => {
    const match = lineStr.match(LRC_LINE);
    const { mainRaw, pronText, transText, overlap } = splitLyricTriplet(match ? match[6] : lineStr);
    if (!mainRaw) return;
    const startTime = match ? parseInt(match[1], 10) * 60 + parseFloat(match[2]) : null;
    const endTime = match?.[3] ? parseInt(match[3], 10) * 60 + parseFloat(match[4]) : null;
    const options = parseLineOptions(match?.[5]);
    // A first line has nothing to overlap, so it is an ordinary line
    const overlaps = overlap && drafts.length > 0;
    drafts.push({
      index,
      startTime,
      endTime,
      ...options,
      content: mainRaw,
      pronText,
      transText,
      overlap: overlaps,
    });
  });

  // Untimed lines share the song evenly; overlapping lines take the time of the line they overlap
  const mainCount = drafts.filter((d) => !d.overlap).length;
  const sliceDur = Math.max(8, duration - introGateSec) / Math.max(1, mainCount);
  let mainSeen = 0;
  let parentStart = introGateSec;
  const timed = drafts
    .map((d) => {
      if (d.overlap) return { ...d, startTime: d.startTime ?? parentStart };
      const startTime = d.startTime ?? round2(introGateSec + mainSeen * sliceDur);
      mainSeen++;
      parentStart = startTime;
      return { ...d, startTime };
    })
    .sort((a, b) => a.startTime - b.startTime);

  if (timed.length > 0 && timed[0].startTime < introGateSec) {
    const shift = introGateSec - timed[0].startTime;
    timed.forEach((d) => {
      d.startTime = round2(d.startTime + shift);
      if (d.endTime !== null) d.endTime = round2(d.endTime + shift);
    });
  }

  const ends = lineEnds(
    timed.map((d) => ({ startTime: d.startTime, endTime: d.endTime, overlap: d.overlap })),
    duration,
  );
  return timed.map((d, i): LyricLine => {
    const endTime = ends[i];
    const isBigLine = !d.overlap && i % 3 === 1;
    // Each manually broken part is tokenized alone; its first word starts a new row
    const tokenParts = splitManualBreaks(d.content).map(tokenizeMultilingualLine);
    const tokens = tokenParts.flat();
    const rowStarts = new Set<number>();
    tokenParts.reduce((n, part) => {
      if (n > 0) rowStarts.add(n);
      return n + part.length;
    }, 0);
    const plain = splitManualBreaks(d.content).join("\n").replace(/\*/g, "");
    const perWord = ((endTime - d.startTime) * WORD_ACTIVE_SPAN) / Math.max(1, tokens.length);
    const firstWord = tokens.length > 0 ? tokens[0].replace(/\*/g, "") : plain.slice(0, 4);

    return {
      index: d.index,
      startTime: d.startTime,
      endTime,
      rawText: d.content,
      cleanText: plain,
      pronText: d.pronText,
      transText: d.transText,
      offsetX: d.offsetX,
      offsetY: d.offsetY,
      lineStyle: d.lineStyle,
      overlap: d.overlap,
      firstWord,
      tokens,
      collabPartId: COLLAB_PARTS[(d.index + 1) % COLLAB_PARTS.length].partId,
      isBigLine,
      cameraAngle: (i % 2 === 0 ? 1 : -1) * (isBigLine ? 4.5 : 2.0),
      words: tokens.map((w, wIdx) => {
        const sem = detectWordSemanticEffect(w);
        return {
          text: w.replace(/\*/g, ""),
          isFirstWord: wIdx === 0,
          breakBefore: rowStarts.has(wIdx),
          startOffset: wIdx * perWord,
          endOffset: (wIdx + 1) * perWord,
          effect: sem.effect,
          isAccent: sem.isAccent || (wIdx === tokens.length - 1 && isBigLine),
        };
      }),
    };
  });
}

interface LaneLine {
  startTime: number;
  overlap: boolean;
}

/** Start of the first ordinary line after line i, or the song's end. */
function nextMainStart(lines: readonly LaneLine[], i: number, duration: number): number {
  for (let j = i + 1; j < lines.length; j++) if (!lines[j].overlap) return lines[j].startTime;
  return duration;
}

/** The ordinary line an overlapping line i is sung over: the last one before it. */
function parentIndex(lines: readonly LaneLine[], i: number): number {
  for (let j = i - 1; j >= 0; j--) if (!lines[j].overlap) return j;
  return -1;
}

/**
 * Where each line ends when no end time is written: an ordinary line at the
 * next ordinary line, an overlapping line with the line it overlaps (or at the
 * next ordinary line when that one has already ended).
 */
function defaultEnds(lines: readonly LaneLine[], mainEnds: readonly number[], duration: number): number[] {
  return lines.map((l, i) => {
    const next = nextMainStart(lines, i, duration);
    if (!l.overlap) return next;
    const p = parentIndex(lines, i);
    const parentEnd = p >= 0 ? mainEnds[p] : next;
    return parentEnd >= l.startTime + MIN_LINE_DURATION ? parentEnd : next;
  });
}

/**
 * End times for lines sorted by start, from their written ends (null: none).
 * An ordinary line's written end only counts when it ends before the next
 * ordinary line; an overlapping line may run past it.
 */
function lineEnds(lines: ReadonlyArray<LaneLine & { endTime: number | null }>, duration: number): number[] {
  const mainEnds = lines.map((l, i) => {
    const next = nextMainStart(lines, i, duration);
    const end = l.endTime !== null && l.endTime < next ? l.endTime : next;
    return Math.max(l.startTime + MIN_LINE_DURATION, end);
  });
  const defaults = defaultEnds(lines, mainEnds, duration);
  return lines.map((l, i) =>
    l.overlap ? Math.max(l.startTime + MIN_LINE_DURATION, l.endTime ?? defaults[i]) : mainEnds[i],
  );
}

export function formatLrcTime(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

/**
 * Re-times plain lyrics evenly across the song, starting after the intro gate.
 * Stacked Japanese/pronunciation/meaning blocks are merged first so each block
 * gets one time, written back as "main | pronunciation | meaning". An
 * overlapping ("&") line gets the time of the line it overlaps.
 */
export function autoDistributeLyrics(text: string, duration: number, introGateSec: number): string {
  const plainLines = normalizeMultilineJapaneseBlocks(text)
    .map((l) => l.replace(LRC_PREFIX, "").trim())
    .filter(Boolean);
  if (plainLines.length === 0) return text;
  const isOverlap = plainLines.map((l, i) => i > 0 && splitLyricTriplet(l).overlap);
  const mainCount = isOverlap.filter((o) => !o).length;
  const available = Math.max(8, duration - introGateSec - 0.5);
  const step = Math.min(4.2, available / mainCount);
  let k = -1;
  return plainLines
    .map((l, i) => {
      if (!isOverlap[i]) k++;
      return `[${formatLrcTime(introGateSec + Math.max(0, k) * step)}] ${l}`;
    })
    .join("\n");
}

/** One line as the timeline edits it. */
export interface TimedLyric {
  startTime: number;
  endTime: number;
  rawText: string;
  pronText: string;
  transText: string;
  offsetX: number;
  offsetY: number;
  lineStyle: LineStyle;
  /** Sung over the line before it ("&" in the text). */
  overlap: boolean;
}

/** "main | pronunciation | meaning", with the "&" mark on an overlapping line. */
function blockText(line: Pick<TimedLyric, "rawText" | "pronText" | "transText" | "overlap">): string {
  const parts = [line.rawText];
  if (line.pronText || line.transText) parts.push(line.pronText);
  if (line.transText) parts.push(line.transText);
  const text = parts.join(" | ");
  return line.overlap ? markOverlap(text) : text;
}

/**
 * Writes timed lines back as lyrics text, one line per block
 * ("main | pronunciation | meaning"). An end time is written only when the
 * line ends before the next one starts, as [start~end], and per-line options
 * only when the line has its own, as [start;x=0.10;glitch=0.80]. An
 * overlapping line keeps its "&" and writes its end whenever it differs from
 * the end of the line it overlaps.
 */
export function serializeTimedLyrics(lines: readonly TimedLyric[], duration: number): string {
  const sorted = [...lines].sort((a, b) => a.startTime - b.startTime);
  const defaults = defaultEnds(
    sorted,
    sorted.map((l) => l.endTime),
    duration,
  );
  return sorted
    .map((line, i) => {
      const def = defaults[i];
      const custom = line.overlap ? Math.abs(line.endTime - def) > 0.005 : line.endTime < def - 0.005;
      const end = custom ? `~${formatLrcTime(line.endTime)}` : "";
      const options = formatLineOptions(line);
      return `[${formatLrcTime(line.startTime)}${end}${options}] ${blockText(line)}`;
    })
    .join("\n");
}

export const hasTimestamps = (text: string) => text.split("\n").some((l) => LRC_LINE.test(l.trim()));

/**
 * Lyrics as the user types them, without times: Japanese blocks stacked on
 * three lines when that round-trips, "main | pronunciation | meaning" otherwise.
 */
export function toEditableLyrics(lines: readonly TimedLyric[]): string {
  const mark = (l: TimedLyric, s: string) => (l.overlap ? markOverlap(s) : s);
  const withSubs = lines.filter((l) => l.pronText || l.transText);
  const stackable = withSubs.every(
    (l) =>
      hasJapanese(l.rawText) && isKoreanOnly(l.pronText) && (l.transText === "" || isKoreanOnly(l.transText)),
  );
  return lines
    .map((l) => {
      if (!l.pronText && !l.transText) return mark(l, l.rawText);
      const parts = [l.rawText, l.pronText, l.transText].filter(Boolean);
      // Every row of an overlapping block keeps the "&" so the block reads as one
      return stackable
        ? parts.map((p) => mark(l, p)).join("\n")
        : mark(l, [l.rawText, l.pronText, l.transText].join(" | ").replace(/ \| $/, ""));
    })
    .join("\n");
}
