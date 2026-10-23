import type { LyricLine } from "@/types/project";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { markOverlap } from "@/lib/lyrics/triplet";
import { learnKanjiReadings } from "./kanji-readings";
import { soundSubstitutionCost, toPronunciationKey, type KanjiReadings } from "./pronunciation";

/** A recognized stretch of audio with its text, in song seconds. */
export interface TranscriptChunk {
  text: string;
  start: number;
  end: number;
}

export interface LineAlignment {
  /** Position in the lines array. */
  lineIdx: number;
  /** Confirmed start time, or null when the line scored under the threshold. */
  time: number | null;
  /**
   * Where the alignment put the line even when it scored under the threshold,
   * or null when too little of it was heard to place it at all.
   */
  estimate: number | null;
  similarity: number;
  /** What was heard at the match, for display. */
  heard: string;
}

// Global alignment scores (lyrics against transcript, one sound unit each).
// Gaps are affine (opening costs more than extending) so the lyrics land on
// the transcript in runs instead of being scattered over stray matching sounds.
const SCORE_MATCH = 2;
const SCORE_SIMILAR = 1;
const SCORE_MISMATCH = -1;
/** Lyric sounds the recognizer missed. */
const GAP_LYRIC_OPEN = -3;
const GAP_LYRIC_EXTEND = -0.6;
/** Transcript sounds with no lyric (noise, ad-libs, hallucinations). Cheaper, since songs have plenty. */
const GAP_HEARD_OPEN = -2;
const GAP_HEARD_EXTEND = -0.3;
/** Credit toward a line's score per aligned unit. */
const CREDIT_MATCH = 1;
const CREDIT_SIMILAR = 0.6;
/** Plausible time per sound unit when extrapolating back to a line's first unit. */
const MIN_UNIT_SEC = 0.04;
const MAX_UNIT_SEC = 0.35;
const DEFAULT_UNIT_SEC = 0.12;
/** A match further than this from where the rest of its line puts it is treated as a stray. */
const STRAY_MATCH_SEC = 0.6;
/** Below this share of matched sounds a line's aligned position is a guess and is not used. */
export const MIN_ESTIMATE_SIMILARITY = 0.3;

/**
 * Sound key of a line's main text. Kanji take the readings learned from the
 * pronunciation rows; a line whose kanji stay unread is matched on its
 * pronunciation row instead, when that row is kana or Hangul.
 */
export function lineSoundKey(line: Pick<LyricLine, "cleanText" | "pronText">, kanji?: KanjiReadings): string {
  const key = toPronunciationKey(line.cleanText, kanji);
  if (!/\p{Script=Han}/u.test(key) || !line.pronText) return key;
  const pron = toPronunciationKey(line.pronText);
  return pron && !/\p{Script=Han}/u.test(pron) ? pron : key;
}

interface HeardTrack {
  key: string;
  /** Time of each unit in key. */
  times: number[];
  /** Original chunk index of each unit, to show what was heard. */
  chunkOf: number[];
}

function buildHeardTrack(chunks: readonly TranscriptChunk[], kanji?: KanjiReadings): HeardTrack {
  let key = "";
  const times: number[] = [];
  const chunkOf: number[] = [];
  chunks.forEach((chunk, ci) => {
    const k = toPronunciationKey(chunk.text, kanji);
    const span = Math.max(0, chunk.end - chunk.start);
    for (let i = 0; i < k.length; i++) {
      // Units are spread evenly across the chunk's time span (a word, or a whole segment)
      times.push(chunk.start + (span * i) / Math.max(1, k.length));
      chunkOf.push(ci);
    }
    key += k;
  });
  return { key, times, chunkOf };
}

/**
 * Forced alignment of the known lyrics against the transcript.
 *
 * All lines are joined into one sound sequence and aligned to the whole
 * transcript at once (Needleman-Wunsch, with free transcript ends), so every
 * line is placed relative to its neighbours instead of being searched for on
 * its own. A line's score is the share of its sounds that landed on the same
 * or a similar transcript sound; lines under the threshold are only estimated
 * (see MIN_ESTIMATE_SIMILARITY).
 * A line's start is fitted to all of its aligned sounds at once (see
 * fitLineStart), so one stray early or late match, often on the first word,
 * does not move the line.
 */
export function alignLinesToTranscript(
  lines: readonly LyricLine[],
  chunks: readonly TranscriptChunk[],
  threshold: number,
): LineAlignment[] {
  const kanji = learnKanjiReadings(lines);
  const heard = buildHeardTrack(chunks, kanji);
  const lineKeys = lines.map((l) => lineSoundKey(l, kanji));
  const lyric = lineKeys.join("");
  const lineStart: number[] = [];
  let acc = 0;
  for (const k of lineKeys) {
    lineStart.push(acc);
    acc += k.length;
  }

  const n = lyric.length;
  const m = heard.key.length;
  const empty = (): LineAlignment[] =>
    lines.map((_, lineIdx) => ({ lineIdx, time: null, estimate: null, similarity: 0, heard: "" }));
  if (n === 0 || m === 0) return empty();

  // Gotoh alignment over (lyric i, heard j) with three states: M aligns the two
  // sounds, X skips a lyric sound, Y skips a transcript sound. trace packs, per
  // cell, the previous state of M (bits 0-1), X (bits 2-3) and Y (bits 4-5).
  const M = 0;
  const X = 1;
  const Y = 2;
  const width = m + 1;
  const trace = new Uint8Array((n + 1) * width);
  let pM = new Float32Array(width); // row 0: alignment may start anywhere in the transcript
  let pX = new Float32Array(width).fill(-Infinity);
  let pY = new Float32Array(width).fill(-Infinity);
  let cM = new Float32Array(width);
  let cX = new Float32Array(width);
  let cY = new Float32Array(width);

  for (let i = 1; i <= n; i++) {
    const row = i * width;
    cM[0] = -Infinity;
    cY[0] = -Infinity;
    cX[0] = i === 1 ? GAP_LYRIC_OPEN : pX[0] + GAP_LYRIC_EXTEND;
    trace[row] = (i === 1 ? M : X) << 2;
    const a = lyric[i - 1];
    for (let j = 1; j <= m; j++) {
      const sub = soundSubstitutionCost(a, heard.key[j - 1]);
      const s = sub === 0 ? SCORE_MATCH : sub < 1 ? SCORE_SIMILAR : SCORE_MISMATCH;

      let mPrev = M;
      let best = pM[j - 1];
      if (pX[j - 1] > best) [best, mPrev] = [pX[j - 1], X];
      if (pY[j - 1] > best) [best, mPrev] = [pY[j - 1], Y];
      cM[j] = best + s;

      let xPrev = M;
      let xBest = pM[j] + GAP_LYRIC_OPEN;
      if (pX[j] + GAP_LYRIC_EXTEND > xBest) [xBest, xPrev] = [pX[j] + GAP_LYRIC_EXTEND, X];
      if (pY[j] + GAP_LYRIC_OPEN > xBest) [xBest, xPrev] = [pY[j] + GAP_LYRIC_OPEN, Y];
      cX[j] = xBest;

      let yPrev = M;
      let yBest = cM[j - 1] + GAP_HEARD_OPEN;
      if (cY[j - 1] + GAP_HEARD_EXTEND > yBest) [yBest, yPrev] = [cY[j - 1] + GAP_HEARD_EXTEND, Y];
      if (cX[j - 1] + GAP_HEARD_OPEN > yBest) [yBest, yPrev] = [cX[j - 1] + GAP_HEARD_OPEN, X];
      cY[j] = yBest;

      trace[row + j] = mPrev | (xPrev << 2) | (yPrev << 4);
    }
    [pM, cM] = [cM, pM];
    [pX, cX] = [cX, pX];
    [pY, cY] = [cY, pY];
  }

  // Trailing transcript is free too: end at the best cell of the last row
  let j = 0;
  let state = X;
  let bestEnd = pX[0];
  for (let k = 1; k <= m; k++) {
    if (pM[k] > bestEnd) [bestEnd, j, state] = [pM[k], k, M];
    if (pX[k] > bestEnd) [bestEnd, j, state] = [pX[k], k, X];
  }

  // heardOf[i] = transcript unit aligned to lyric unit i (-1 if none); credit[i] = match quality
  const heardOf = new Int32Array(n).fill(-1);
  const credit = new Float32Array(n);
  let i = n;
  while (i > 0) {
    const bits = trace[i * width + j];
    if (state === M) {
      const sub = soundSubstitutionCost(lyric[i - 1], heard.key[j - 1]);
      heardOf[i - 1] = j - 1;
      credit[i - 1] = sub === 0 ? CREDIT_MATCH : sub < 1 ? CREDIT_SIMILAR : 0;
      state = bits & 3;
      i--;
      j--;
    } else if (state === X) {
      state = (bits >> 2) & 3;
      i--;
    } else {
      state = (bits >> 4) & 3;
      j--;
    }
  }

  let lastTime = -Infinity;
  return lines.map((_, lineIdx): LineAlignment => {
    const from = lineStart[lineIdx];
    const len = lineKeys[lineIdx].length;
    if (len === 0) return { lineIdx, time: null, estimate: null, similarity: 0, heard: "" };

    let score = 0;
    const hits: UnitHit[] = [];
    for (let u = from; u < from + len; u++) {
      score += credit[u];
      if (credit[u] > 0) hits.push({ offset: u - from, time: heard.times[heardOf[u]], weight: credit[u] });
    }
    const similarity = score / len;
    if (hits.length === 0 || similarity < Math.min(threshold, MIN_ESTIMATE_SIMILARITY)) {
      return { lineIdx, time: null, estimate: null, similarity, heard: "" };
    }

    const time = Math.max(0, lastTime, fitLineStart(hits));
    lastTime = time;
    const mid = hits[Math.floor(hits.length / 2)];
    return {
      lineIdx,
      time: similarity >= threshold ? time : null,
      estimate: time,
      similarity,
      heard: chunks[heard.chunkOf[heardOf[from + mid.offset]]]?.text.trim() ?? "",
    };
  });
}

/** A lyric sound that landed on a transcript sound: its place in the line, when it was heard, and how well it matched. */
export interface UnitHit {
  offset: number;
  time: number;
  weight: number;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const k = v.length >> 1;
  return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
}

function weightedMedian(items: { value: number; weight: number }[]): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((acc, it) => acc + it.weight, 0) / 2;
  let acc = 0;
  for (const it of sorted) {
    acc += it.weight;
    if (acc >= half) return it.value;
  }
  return sorted[sorted.length - 1].value;
}

/**
 * Start time of a line from all of its matched sounds: the singing pace is the
 * median of the pace between every pair of matches (Theil-Sen), and the start
 * is read off the earliest match that agrees with the match-weighted median of
 * where every match says the line began. A few stray matches, such as a first
 * word that the recognizer heard somewhere else, are outvoted by the rest of
 * the line.
 */
export function fitLineStart(hits: readonly UnitHit[]): number {
  const slopes: number[] = [];
  for (let a = 0; a < hits.length; a++) {
    for (let b = a + 1; b < hits.length; b++) {
      const d = hits[b].offset - hits[a].offset;
      if (d !== 0) slopes.push((hits[b].time - hits[a].time) / d);
    }
  }
  const unitSec = slopes.length
    ? Math.min(MAX_UNIT_SEC, Math.max(MIN_UNIT_SEC, median(slopes)))
    : DEFAULT_UNIT_SEC;
  const start = weightedMedian(hits.map((h) => ({ value: h.time - h.offset * unitSec, weight: h.weight })));
  // The earliest match that agrees with the line as a whole pins the start most
  // precisely, since it needs the least stepping back
  const first = hits.find((h) => Math.abs(h.time - h.offset * unitSec - start) <= STRAY_MATCH_SEC);
  return first ? first.time - first.offset * unitSec : start;
}

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * New start times for every line: confirmed lines take their match, lines
 * under the threshold take the alignment's estimate, and each run of lines
 * with neither keeps its old times when they still fit between the
 * neighbouring placed lines, otherwise it is spread evenly between them.
 */
export function resolveLineTimes(
  lines: readonly LyricLine[],
  alignments: readonly LineAlignment[],
  duration: number,
  introGateSec: number,
): number[] {
  const times = lines.map((_, i) => alignments[i]?.time ?? alignments[i]?.estimate ?? null);
  const out = lines.map((l) => l.startTime);

  let i = 0;
  while (i < lines.length) {
    const t = times[i];
    if (t !== null) {
      out[i] = round2(t);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && times[j] === null) j++;
    const next = j < lines.length ? round2(times[j] as number) : duration;
    const prev = i > 0 ? out[i - 1] : next > introGateSec ? introGateSec : 0;
    const run = lines.slice(i, j).map((l) => l.startTime);
    const fits = run.every((s, k) => s > prev && s < next && (k === 0 || s > run[k - 1]));
    for (let k = 0; k < run.length; k++) {
      out[i + k] = fits ? run[k] : round2(prev + ((k + 1) * (next - prev)) / (run.length + 1));
    }
    i = j;
  }
  return out;
}

/**
 * Aligns the ordinary lines and gives every line a new start. Overlapping
 * ("&") lines are sung over another voice, so they are not looked for in the
 * transcript: each keeps its distance from the line it overlaps and moves
 * with it. Alignments use positions in the full lines array.
 */
export function syncLineTimes(
  lines: readonly LyricLine[],
  chunks: readonly TranscriptChunk[],
  threshold: number,
  duration: number,
  introGateSec: number,
): { alignments: LineAlignment[]; startTimes: number[] } {
  const mainIdx = lines.flatMap((l, i) => (l.overlap ? [] : [i]));
  const main = mainIdx.map((i) => lines[i]);
  const raw = alignLinesToTranscript(main, chunks, threshold);
  const mainTimes = resolveLineTimes(main, raw, duration, introGateSec);
  const startTimes = lines.map((l) => l.startTime);
  mainIdx.forEach((i, k) => (startTimes[i] = mainTimes[k]));
  let parent = -1;
  lines.forEach((l, i) => {
    if (!l.overlap) {
      parent = i;
    } else if (parent >= 0) {
      const shifted = startTimes[parent] + (l.startTime - lines[parent].startTime);
      startTimes[i] = round2(Math.min(duration, Math.max(0, shifted)));
    }
  });
  return { alignments: raw.map((a) => ({ ...a, lineIdx: mainIdx[a.lineIdx] })), startTimes };
}

/** Writes lines back as LRC, one line per block ("main | pronunciation | meaning"). */
export function linesToLrc(lines: readonly LyricLine[], startTimes: readonly number[]): string {
  return lines
    .map((line, i) => {
      const parts = [line.rawText];
      if (line.pronText || line.transText) parts.push(line.pronText);
      if (line.transText) parts.push(line.transText);
      const text = parts.join(" | ");
      return `[${formatLrcTime(startTimes[i])}] ${line.overlap ? markOverlap(text) : text}`;
    })
    .join("\n");
}
