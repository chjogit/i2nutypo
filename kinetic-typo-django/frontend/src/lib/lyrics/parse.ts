import type { LineStyle, LyricLine } from "@/types/project";
import { COLLAB_PARTS } from "@/lib/presets/collab-parts";
import { formatLineOptions, parseLineOptions } from "./line-options";
import { detectWordSemanticEffect, splitManualBreaks, tokenizeMultilingualLine } from "./tokenize";
import {
  hasJapanese,
  interludeSeconds,
  isKoreanOnly,
  LRC_LINE,
  LRC_PREFIX,
  markOverlap,
  normalizeMultilineJapaneseBlocks,
  splitCuts,
  splitFlashMark,
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
 *
 * Notation: "[간주 8]" leaves 8 seconds empty between untimed lines, a
 * trailing " !" flashes the screen as the line starts, " / " cuts a line into
 * screens shown one after another, and "#" lines are notes (never shown).
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
    /** Seconds left empty after this line ("[간주 N]"). */
    gapAfter: number;
  }> = [];
  let leadGap = 0;
  rawLines.forEach((lineStr, index) => {
    const gap = interludeSeconds(lineStr);
    if (gap !== null) {
      const last = drafts.length > 0 ? drafts[drafts.length - 1] : null;
      if (last) last.gapAfter += gap;
      else leadGap += gap;
      return;
    }
    const match = lineStr.match(LRC_LINE);
    const { mainRaw: marked, pronText, transText, overlap } = splitLyricTriplet(match ? match[6] : lineStr);
    const { flash, body: mainRaw } = splitFlashMark(marked);
    if (!mainRaw) return;
    const startTime = match ? parseInt(match[1], 10) * 60 + parseFloat(match[2]) : null;
    const endTime = match?.[3] ? parseInt(match[3], 10) * 60 + parseFloat(match[4]) : null;
    const options = parseLineOptions(match?.[5]);
    if (flash) options.lineStyle = { ...options.lineStyle, flash: 1 };
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
      gapAfter: 0,
    });
  });

  // Untimed lines share the song evenly; overlapping lines take the time of the line they overlap
  // Untimed lines share the song evenly, minus the interludes
  const mainCount = drafts.filter((d) => !d.overlap).length;
  const gapTotal = leadGap + drafts.reduce((n, d) => n + d.gapAfter, 0);
  const sliceDur = Math.max(8, duration - introGateSec - gapTotal) / Math.max(1, mainCount);
  let mainSeen = 0;
  let gapsSoFar = leadGap;
  let parentStart = introGateSec;
  const timed = drafts
    .map((d) => {
      if (d.overlap) {
        gapsSoFar += d.gapAfter;
        return { ...d, startTime: d.startTime ?? parentStart };
      }
      const untimed = d.startTime === null;
      const startTime = d.startTime ?? round2(introGateSec + mainSeen * sliceDur + gapsSoFar);
      mainSeen++;
      gapsSoFar += d.gapAfter;
      parentStart = startTime;
      // An untimed line before an interlude ends on time instead of running through it
      const endTime =
        untimed && d.gapAfter > 0 && d.endTime === null ? round2(startTime + sliceDur) : d.endTime;
      return { ...d, startTime, endTime };
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
  const screens = timed.flatMap((d, i) => cutScreens({ ...d, endTime: ends[i] }));
  return screens.map((d, i): LyricLine => {
    const endTime = d.endTime;
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

/**
 * Splits a line written with " / " into screens that share its time, each
 * as long as its share of the text. Only the first keeps the flash.
 */
function cutScreens<T extends { startTime: number; endTime: number; content: string; lineStyle: LineStyle }>(
  line: T,
): T[] {
  const parts = splitCuts(line.content);
  if (parts.length < 2) return [line];
  const total = parts.reduce((n, p) => n + Math.max(1, p.length), 0);
  const span = line.endTime - line.startTime;
  let at = line.startTime;
  return parts.map((content, k) => {
    const start = at;
    at = k === parts.length - 1 ? line.endTime : round2(at + (span * Math.max(1, content.length)) / total);
    const lineStyle = k === 0 ? line.lineStyle : { ...line.lineStyle, flash: undefined };
    return { ...line, content, startTime: start, endTime: at, lineStyle };
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
  const allLines = normalizeMultilineJapaneseBlocks(text)
    .map((l) => l.replace(LRC_PREFIX, "").trim())
    .filter(Boolean);
  const gaps = allLines.map(interludeSeconds);
  if (gaps.every((g) => g !== null)) return text;
  const isOverlap = allLines.map((l, i) => gaps[i] === null && i > 0 && splitLyricTriplet(l).overlap);
  const mainCount = allLines.filter((_, i) => gaps[i] === null && !isOverlap[i]).length;
  const gapTotal = gaps.reduce<number>((n, g) => n + (g ?? 0), 0);
  const available = Math.max(8, duration - introGateSec - 0.5 - gapTotal);
  const step = Math.min(4.2, available / Math.max(1, mainCount));
  let at = introGateSec;
  let start = introGateSec;
  const out: string[] = [];
  allLines.forEach((l, i) => {
    const gap = gaps[i];
    if (gap !== null) {
      // The line before the interlude ends on time; the gap stays empty
      const prev = out.length - 1;
      if (prev >= 0 && !/^\[[^\]]*~/.test(out[prev])) {
        out[prev] = out[prev].replace(/^\[([^\]]+)\]/, `[$1~${formatLrcTime(start + step)}]`);
      }
      at += gap;
      return;
    }
    if (!isOverlap[i]) {
      start = at;
      at += step;
    }
    out.push(`[${formatLrcTime(start)}] ${l}`);
  });
  return out.join("\n");
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
