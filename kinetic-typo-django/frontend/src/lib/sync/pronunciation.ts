// Sound keys for matching lyrics against speech recognition output.
//
// Grew out of the original studio's jamo key (toPronunciationKey,
// pronunciationSimilarity). Hangul, kana and Latin letters are now all folded
// into one rough Latin phonetic alphabet, so "Without You" in the lyrics can
// match "위다웃 유" or "ウィザウト" in the transcript. Kanji have no reading
// without a dictionary and are kept as-is (they match when the recognizer
// writes the same kanji).

// prettier-ignore
const HANGUL_INITIAL_SOUNDS = [
  "g", "k", "n", "d", "t", "r", "m", "b", "p", "s", "s", "", "j", "j", "c", "k", "t", "p", "h",
];
// prettier-ignore
const HANGUL_VOWEL_SOUNDS = [
  "a", "e", "ya", "ye", "o", "e", "yo", "ye", "o", "wa", "we", "we", "yo",
  "u", "wo", "we", "wi", "yu", "u", "ui", "i",
];
// 27 final consonants folded to the 7 representative final sounds; "N" is ng
// prettier-ignore
const HANGUL_FINAL_SOUNDS = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l",
  "p", "l", "m", "p", "p", "t", "t", "N", "t", "t", "k", "t", "p", "t",
];

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

// Hiragana (katakana is folded to hiragana first). Small ゃゅょ combine with the previous kana.
// prettier-ignore
const KANA_SOUNDS: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "si", す: "su", せ: "se", そ: "so",
  ざ: "ja", じ: "ji", ず: "ju", ぜ: "je", ぞ: "jo",
  た: "ta", ち: "ci", つ: "cu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "ju", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "hu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo", ら: "ra", り: "ri",
  る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o",
  ん: "n", ゔ: "bu", ぁ: "a", ぃ: "i", ぅ: "u",
  ぇ: "e", ぉ: "o",
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };

/** Rough English spelling-to-sound folds, applied to Latin runs only. */
const ENGLISH_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/ph/g, "f"],
  [/th/g, "d"],
  [/ck/g, "k"],
  [/qu/g, "kw"],
  [/x/g, "ks"],
  [/c(?=[eiy])/g, "s"],
  // "C" marks ch until the bare-c rule below has run
  [/ch/g, "C"],
  [/sh/g, "s"],
  [/c/g, "k"],
  [/q/g, "k"],
  [/C/g, "c"],
  [/f/g, "p"],
  [/v/g, "b"],
  [/z/g, "j"],
  [/oo/g, "u"],
  [/ee|ea/g, "i"],
  [/(?<=[a-z])e\b/g, ""],
  [/y\b/g, "i"],
];

// Sounds that recognizers and transliterations commonly swap: substitution
// inside a group costs 0.4 instead of 1
const SIMILAR_SOUND_GROUPS = ["bp", "dt", "gk", "lr", "jcs", "nN", "ei", "ou"];
const SOUND_GROUP_OF = new Map<string, number>();
SIMILAR_SOUND_GROUPS.forEach((g, gi) => {
  for (const ch of g) SOUND_GROUP_OF.set(ch, gi);
});

/** Substitution cost between two sound units: 0 same, 0.4 similar, 1 different. */
export function soundSubstitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  const ga = SOUND_GROUP_OF.get(a);
  return ga !== undefined && ga === SOUND_GROUP_OF.get(b) ? 0.4 : 1;
}

function foldEnglish(word: string): string {
  let w = word;
  for (const [re, to] of ENGLISH_FOLDS) w = w.replace(re, to);
  return w;
}

// Korean is sung (and written by recognizers) as it sounds, not as it is
// spelled: 있어 is heard 이써, 없는 엄는, 같이 가치. Both the lyrics and the
// transcript go through the same sound changes, so either spelling gives one key.

/** Final consonant index → [part that stays, part that moves onto a following ㅇ]; null never moves (ㅇ). */
// prettier-ignore
const HANGUL_FINAL_LIAISON: ReadonlyArray<readonly [string, string] | null> = [
  ["", ""], ["", "g"], ["", "k"], ["k", "s"], ["", "n"], ["n", "j"], ["n", ""], ["", "d"],
  ["", "r"], ["l", "g"], ["l", "m"], ["l", "b"], ["l", "s"], ["l", "t"], ["l", "p"], ["l", ""],
  ["", "m"], ["", "b"], ["p", "s"], ["", "s"], ["", "s"], null, ["", "j"], ["", "c"],
  ["", "k"], ["", "t"], ["", "p"], ["", ""],
];
const SILENT_INITIAL = 11; // ㅇ
const VOWEL_I = 20; // ㅣ
const FINAL_H = 27; // ㅎ
/** Plain initials that turn tense after a stop (웃고 → 웃꼬) or aspirated after ㅎ (좋다 → 조타). */
const TENSE_OF: Record<string, string> = { g: "k", d: "t", b: "p", j: "j", s: "s" };
const ASPIRATED_OF: Record<string, string> = { g: "k", d: "t", b: "p", j: "c" };
/** A stop before ㄴ or ㅁ is said as the nasal of its place (없는 → 엄는, 국물 → 궁물). */
const NASAL_OF: Record<string, string> = { k: "N", t: "n", p: "m" };

interface HangulSyllable {
  initialIdx: number;
  initial: string;
  vowelIdx: number;
  vowel: string;
  finalIdx: number;
}

function splitHangul(code: number): HangulSyllable {
  const idx = code - HANGUL_START;
  const vowelIdx = Math.floor((idx % 588) / 28);
  const initialIdx = Math.floor(idx / 588);
  return {
    initialIdx,
    initial: HANGUL_INITIAL_SOUNDS[initialIdx],
    vowelIdx,
    vowel: HANGUL_VOWEL_SOUNDS[vowelIdx],
    finalIdx: idx % 28,
  };
}

/** Sound of a run of Hangul syllables, with the sound changes between neighbouring syllables applied. */
function hangulRunSound(run: readonly number[]): string {
  const syl = run.map(splitHangul);
  let out = "";
  for (let i = 0; i < syl.length; i++) {
    const cur = syl[i];
    const next = syl[i + 1];
    let fin = HANGUL_FINAL_SOUNDS[cur.finalIdx];
    if (next && cur.finalIdx > 0) {
      const liaison = HANGUL_FINAL_LIAISON[cur.finalIdx];
      if (next.initialIdx === SILENT_INITIAL && liaison) {
        // The final moves onto the vowel after it; ㄷ/ㅌ before ㅣ become ㅈ/ㅊ (굳이 → 구지, 같이 → 가치)
        let moved = liaison[1];
        if (next.vowelIdx === VOWEL_I) moved = moved === "d" ? "j" : moved === "t" ? "c" : moved;
        fin = liaison[0];
        next.initial = moved;
      } else if (cur.finalIdx === FINAL_H || cur.finalIdx === 6 || cur.finalIdx === 15) {
        // ㅎ (also in ㄶ, ㅀ) is not said but makes the next plain sound aspirated
        fin = cur.finalIdx === FINAL_H ? "" : fin;
        next.initial = ASPIRATED_OF[next.initial] ?? next.initial;
      } else if (next.initial === "h" && NASAL_OF[fin]) {
        // A stop before ㅎ merges with it into an aspirated sound (축하 → 추카)
        next.initial = { k: "k", t: "t", p: "p" }[fin as "k" | "t" | "p"];
        fin = "";
      } else if ((next.initial === "n" || next.initial === "m") && NASAL_OF[fin]) {
        fin = NASAL_OF[fin];
      } else if (next.initial === "r") {
        // ㄴ+ㄹ and ㄹ+ㄴ are said ㄹㄹ (신라 → 실라); after other finals ㄹ is said ㄴ (종로 → 종노)
        if (fin === "n" || fin === "l") fin = "l";
        else {
          next.initial = "n";
          if (NASAL_OF[fin]) fin = NASAL_OF[fin];
        }
      } else if (next.initial === "n" && fin === "l") {
        next.initial = "l";
      } else if (NASAL_OF[fin]) {
        next.initial = TENSE_OF[next.initial] ?? next.initial;
      }
    }
    out += cur.initial + cur.vowel + fin;
  }
  return out;
}

/**
 * Readings of kanji learned from the lyrics themselves (see kanji-readings.ts):
 * kanji run → sound key. Kanji have no reading without a dictionary, so this
 * lets "愛してる" in the lyrics match "あいしてる" in the transcript.
 */
export interface KanjiReadings {
  readings: ReadonlyMap<string, string>;
  /** Longest kanji run in readings, in characters. */
  maxLen: number;
}

export const isKanji = (ch: string) => /\p{Script=Han}/u.test(ch);

/**
 * Reduces text to a sound key: one Latin letter (or kanji) per sound unit,
 * punctuation and spaces removed, repeated units collapsed because sung
 * vowels get stretched and recognizers write them once. Kanji with a learned
 * reading are replaced by it.
 */
export function toPronunciationKey(text: string, kanji?: KanjiReadings): string {
  const s = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    // Latin words are folded as whole words so the rules can see their context
    .replace(/[a-z]+/g, foldEnglish);

  let out = "";
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const run: number[] = [];
      while (
        i < chars.length &&
        chars[i].charCodeAt(0) >= HANGUL_START &&
        chars[i].charCodeAt(0) <= HANGUL_END
      ) {
        run.push(chars[i].charCodeAt(0));
        i++;
      }
      i--;
      out += hangulRunSound(run);
    } else if (KANA_SOUNDS[ch] !== undefined) {
      const small = SMALL_Y[chars[i + 1] ?? ""];
      out += small ? KANA_SOUNDS[ch].slice(0, -1) + "y" + small : KANA_SOUNDS[ch];
      if (small) i++;
    } else if (ch === "っ" || ch === "ー") {
      // Geminate and long-vowel marks lengthen the neighbouring sound only
    } else if (kanji && isKanji(ch)) {
      let len = Math.min(kanji.maxLen, chars.length - i);
      let reading: string | undefined;
      for (; len > 0; len--) {
        reading = kanji.readings.get(chars.slice(i, i + len).join(""));
        if (reading !== undefined) break;
      }
      if (reading !== undefined) {
        out += reading;
        i += len - 1;
      } else out += ch;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      out += ch;
    }
  }
  return out.replace(/(.)\1+/g, "$1");
}

/** 1 - weighted edit distance / longer length, in 0..1. */
export function pronunciationSimilarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const sub = soundSubstitutionCost(a[i - 1], b[j - 1]);
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
    }
    [prev, cur] = [cur, prev];
  }
  return Math.max(0, 1 - prev[b.length] / Math.max(a.length, b.length));
}
