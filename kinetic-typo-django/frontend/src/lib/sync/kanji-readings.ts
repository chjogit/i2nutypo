import { isKanji, soundSubstitutionCost, toPronunciationKey, type KanjiReadings } from "./pronunciation";

// Japanese lyrics come with a pronunciation row (usually in Hangul), and that
// row says how each kanji in the line is read. Lining the two up ("愛してる"
// against "아이시테루") teaches the reading of every kanji run in the song, so
// kanji in the lyrics and in the transcript can be matched by sound, even when
// the recognizer writes them in kana.

/** One kanji can stand for this many sound letters at most (光 → hikari). */
const MAX_SOUNDS_PER_KANJI = 7;
/** A line is learned from only when its kana part agrees this well with its pronunciation row. */
const MAX_MISMATCH_PER_SOUND = 0.2;

type Unit = { kanji: string } | { sound: string };

function units(text: string): Unit[] {
  const out: Unit[] = [];
  let plain = "";
  const flush = () => {
    for (const ch of toPronunciationKey(plain)) out.push({ sound: ch });
    plain = "";
  };
  const chars = Array.from(text.normalize("NFC"));
  for (let i = 0; i < chars.length; i++) {
    if (!isKanji(chars[i])) {
      plain += chars[i];
      continue;
    }
    flush();
    let run = "";
    while (i < chars.length && isKanji(chars[i])) run += chars[i++];
    i--;
    out.push({ kanji: run });
  }
  flush();
  return out;
}

/**
 * Lines the units of one line up with its pronunciation key. Each kanji run
 * takes 1..7 sounds per kanji for free; every other sound must be matched.
 * Returns each run's reading, or null when the two rows do not agree.
 */
export function readKanjiRuns(text: string, pron: string): Map<string, string> | null {
  const u = units(text);
  const p = toPronunciationKey(pron);
  const sounds = u.filter((x) => "sound" in x).length;
  if (!u.some((x) => "kanji" in x) || p.length === 0 || /\p{Script=Han}/u.test(p)) return null;

  const T = u.length;
  const m = p.length;
  const W = m + 1;
  const cost = new Float32Array((T + 1) * W).fill(Infinity);
  const from = new Int32Array((T + 1) * W).fill(-1);
  cost[0] = 0;
  for (let j = 1; j <= m; j++) [cost[j], from[j]] = [j, j - 1];
  for (let k = 1; k <= T; k++) {
    const unit = u[k - 1];
    for (let j = 0; j <= m; j++) {
      const at = k * W + j;
      const relax = (c: number, prev: number) => {
        if (c < cost[at]) [cost[at], from[at]] = [c, prev];
      };
      if ("kanji" in unit) {
        const maxLen = Math.min(j, MAX_SOUNDS_PER_KANJI * Array.from(unit.kanji).length);
        for (let len = 1; len <= maxLen; len++) relax(cost[(k - 1) * W + j - len], (k - 1) * W + j - len);
      } else {
        relax(cost[(k - 1) * W + j] + 1, (k - 1) * W + j); // sound not in the pronunciation row
        if (j > 0) {
          relax(cost[(k - 1) * W + j - 1] + soundSubstitutionCost(unit.sound, p[j - 1]), (k - 1) * W + j - 1);
          relax(cost[at - 1] + 1, at - 1); // extra sound in the pronunciation row
        }
      }
    }
  }
  if (cost[T * W + m] > MAX_MISMATCH_PER_SOUND * sounds + 0.5) return null;

  const readings = new Map<string, string>();
  let at = T * W + m;
  while (at > 0) {
    const prev = from[at];
    const k = Math.floor(at / W);
    const pk = Math.floor(prev / W);
    const unit = u[k - 1];
    if (pk === k - 1 && "kanji" in unit) readings.set(unit.kanji, p.slice(prev % W, at % W));
    at = prev;
  }
  return readings;
}

/** Learns kanji readings from every line that has a pronunciation row; the most common reading of a run wins. */
export function learnKanjiReadings(
  lines: ReadonlyArray<{ cleanText: string; pronText: string }>,
): KanjiReadings | undefined {
  const votes = new Map<string, Map<string, number>>();
  for (const line of lines) {
    if (!line.pronText) continue;
    const runs = readKanjiRuns(line.cleanText, line.pronText);
    if (!runs) continue;
    for (const [kanji, reading] of runs) {
      const v = votes.get(kanji) ?? new Map<string, number>();
      v.set(reading, (v.get(reading) ?? 0) + 1);
      votes.set(kanji, v);
    }
  }
  if (votes.size === 0) return undefined;
  const readings = new Map<string, string>();
  let maxLen = 0;
  for (const [kanji, v] of votes) {
    readings.set(kanji, [...v].sort((a, b) => b[1] - a[1])[0][0]);
    maxLen = Math.max(maxLen, Array.from(kanji).length);
  }
  return { readings, maxLen };
}
