import type { LineStyle, LyricLine } from "@/types/project";
import { COLLAB_PARTS } from "@/lib/presets/collab-parts";
import { formatLineOptions, parseLineOptions } from "./line-options";
import { detectWordSemanticEffect, splitManualBreaks, tokenizeMultilingualLine } from "./tokenize";
import {
  hasJapanese,
  isKoreanOnly,
  LRC_LINE,
  LRC_PREFIX,
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
 * two become bottom subtitles.
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
  }> = [];
  rawLines.forEach((lineStr, index) => {
    const match = lineStr.match(LRC_LINE);
    const { mainRaw, pronText, transText } = splitLyricTriplet(match ? match[6] : lineStr);
    if (!mainRaw) return;
    const startTime = match ? parseInt(match[1], 10) * 60 + parseFloat(match[2]) : null;
    const endTime = match?.[3] ? parseInt(match[3], 10) * 60 + parseFloat(match[4]) : null;
    const options = parseLineOptions(match?.[5]);
    drafts.push({ index, startTime, endTime, ...options, content: mainRaw, pronText, transText });
  });

  const sliceDur = Math.max(8, duration - introGateSec) / Math.max(1, drafts.length);
  const timed = drafts
    .map((d, i) => ({ ...d, startTime: d.startTime ?? round2(introGateSec + i * sliceDur) }))
    .sort((a, b) => a.startTime - b.startTime);

  if (timed.length > 0 && timed[0].startTime < introGateSec) {
    const shift = introGateSec - timed[0].startTime;
    timed.forEach((d) => {
      d.startTime = round2(d.startTime + shift);
      if (d.endTime !== null) d.endTime = round2(d.endTime + shift);
    });
  }

  return timed.map((d, i): LyricLine => {
    const nextStart = i < timed.length - 1 ? timed[i + 1].startTime : duration;
    const endTime = Math.max(
      d.startTime + MIN_LINE_DURATION,
      d.endTime !== null && d.endTime < nextStart ? d.endTime : nextStart,
    );
    const isBigLine = i % 3 === 1;
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

export function formatLrcTime(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

/**
 * Re-times plain lyrics evenly across the song, starting after the intro gate.
 * Stacked Japanese/pronunciation/meaning blocks are merged first so each block
 * gets one time, written back as "main | pronunciation | meaning".
 */
export function autoDistributeLyrics(text: string, duration: number, introGateSec: number): string {
  const plainLines = normalizeMultilineJapaneseBlocks(text)
    .map((l) => l.replace(LRC_PREFIX, "").trim())
    .filter(Boolean);
  if (plainLines.length === 0) return text;
  const available = Math.max(8, duration - introGateSec - 0.5);
  const step = Math.min(4.2, available / plainLines.length);
  return plainLines.map((l, i) => `[${formatLrcTime(introGateSec + i * step)}] ${l}`).join("\n");
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
}

/**
 * Writes timed lines back as lyrics text, one line per block
 * ("main | pronunciation | meaning"). An end time is written only when the
 * line ends before the next one starts, as [start~end], and per-line options
 * only when the line has its own, as [start;x=0.10;glitch=0.80].
 */
export function serializeTimedLyrics(lines: readonly TimedLyric[], duration: number): string {
  return lines
    .map((line, i) => {
      const nextStart = i < lines.length - 1 ? lines[i + 1].startTime : duration;
      const end = line.endTime < nextStart - 0.005 ? `~${formatLrcTime(line.endTime)}` : "";
      const options = formatLineOptions(line);
      const parts = [line.rawText];
      if (line.pronText || line.transText) parts.push(line.pronText);
      if (line.transText) parts.push(line.transText);
      return `[${formatLrcTime(line.startTime)}${end}${options}] ${parts.join(" | ")}`;
    })
    .join("\n");
}

export const hasTimestamps = (text: string) => text.split("\n").some((l) => LRC_LINE.test(l.trim()));

/**
 * Lyrics as the user types them, without times: Japanese blocks stacked on
 * three lines when that round-trips, "main | pronunciation | meaning" otherwise.
 */
export function toEditableLyrics(lines: readonly TimedLyric[]): string {
  const withSubs = lines.filter((l) => l.pronText || l.transText);
  const stackable = withSubs.every(
    (l) =>
      hasJapanese(l.rawText) && isKoreanOnly(l.pronText) && (l.transText === "" || isKoreanOnly(l.transText)),
  );
  return lines
    .map((l) => {
      if (!l.pronText && !l.transText) return l.rawText;
      const parts = [l.rawText, l.pronText, l.transText].filter(Boolean);
      return stackable
        ? parts.join("\n")
        : [l.rawText, l.pronText, l.transText].join(" | ").replace(/ \| $/, "");
    })
    .join("\n");
}
