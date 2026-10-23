import type { TranscriptChunk } from "./align";
import { toPronunciationKey } from "./pronunciation";
import type { TimestampMode } from "./whisper-protocol";

// Whisper output gets messy where nobody sings: in an instrumental interlude
// it may write stock phrases from video subtitles, loop the same words, or
// stretch the first word after the break back to where the break started.
// These are removed or trimmed before the lyrics are aligned to the
// transcript; the alignment already tolerates the rest.

/** Phrases Whisper writes for music or silence (learned from video subtitles), never lyrics. */
const STOCK_PHRASES = [
  "시청해주셔서감사합니다",
  "구독과좋아요",
  "구독좋아요",
  "자막제공",
  "다음영상에서만나요",
  "mbc뉴스",
  "ご視聴ありがとうございました",
  "チャンネル登録",
  "おつかれさまでした",
  "thankyouforwatching",
  "thanksforwatching",
  "subtitlesby",
  "pleasesubscribe",
].map((p) => p.toLowerCase());

/** A sung word rarely lasts longer than this plus a little per sound. */
const WORD_BASE_SEC = 0.8;
const WORD_PER_SOUND_SEC = 0.3;
/** The same run of words this many times in a row is a decoding loop. */
const LOOP_REPEATS = 4;
const LOOP_MAX_WORDS = 8;

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export interface CleanedTranscript {
  chunks: TranscriptChunk[];
  /** How many chunks were dropped as stock phrases, loops or noise. */
  dropped: number;
}

export function cleanTranscript(chunks: readonly TranscriptChunk[], mode: TimestampMode): CleanedTranscript {
  const keep = chunks.map((c) => normalize(c.text).length > 0);

  // Stock phrases, which in word mode are spread over several chunks
  let joined = "";
  const owner: number[] = [];
  chunks.forEach((c, i) => {
    const n = normalize(c.text);
    joined += n;
    for (let k = 0; k < n.length; k++) owner.push(i);
  });
  for (const phrase of STOCK_PHRASES) {
    let at = joined.indexOf(phrase);
    while (at >= 0) {
      for (let k = at; k < at + phrase.length; k++) keep[owner[k]] = false;
      at = joined.indexOf(phrase, at + phrase.length);
    }
  }

  // Decoding loops: a run of chunks repeated LOOP_REPEATS+ times in a row keeps one copy.
  // Single words may repeat in lyrics ("baby baby baby baby"); whole segments may not.
  const texts = chunks.map((c) => normalize(c.text));
  const minLen = mode === "word" ? 2 : 1;
  for (let i = 0; i < chunks.length; i++) {
    for (let len = minLen; len <= LOOP_MAX_WORDS; len++) {
      let reps = 1;
      while (
        i + (reps + 1) * len <= chunks.length &&
        texts.slice(i + reps * len, i + (reps + 1) * len).join(" ") === texts.slice(i, i + len).join(" ")
      ) {
        reps++;
      }
      if (reps >= LOOP_REPEATS) {
        for (let k = i + len; k < i + reps * len; k++) keep[k] = false;
        i += reps * len - 1;
        break;
      }
    }
  }

  const kept = chunks.filter((_, i) => keep[i]).map((c) => ({ ...c }));
  if (mode === "word") trimStretchedWords(kept);
  return { chunks: kept, dropped: chunks.length - kept.length };
}

/** Fallback singing pace when no neighbouring word gives one. */
const DEFAULT_SEC_PER_SOUND = 0.12;

/**
 * A word that "lasts" far longer than its sounds could be sung in started
 * after a break; its start is moved to fit the pace of the words after it.
 */
function trimStretchedWords(words: TranscriptChunk[]): void {
  const units = words.map((w) => Math.max(1, toPronunciationKey(w.text).length));
  const maxDur = (i: number) => WORD_BASE_SEC + WORD_PER_SOUND_SEC * units[i];
  words.forEach((w, i) => {
    if (w.end - w.start <= maxDur(i)) return;
    // Seconds per sound of the next few words that look normal
    const paces: number[] = [];
    for (let k = i + 1; k < words.length && paces.length < 4; k++) {
      const d = words[k].end - words[k].start;
      if (d > 0 && d <= maxDur(k)) paces.push(d / units[k]);
    }
    paces.sort((a, b) => a - b);
    const pace = paces.length ? paces[Math.floor(paces.length / 2)] : DEFAULT_SEC_PER_SOUND;
    w.start = w.end - Math.min(maxDur(i), pace * units[i]);
  });
}
