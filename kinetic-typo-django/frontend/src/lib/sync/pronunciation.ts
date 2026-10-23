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

/**
 * Reduces text to a sound key: one Latin letter (or kanji) per sound unit,
 * punctuation and spaces removed, repeated units collapsed because sung
 * vowels get stretched and recognizers write them once.
 */
export function toPronunciationKey(text: string): string {
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
      const idx = code - HANGUL_START;
      out +=
        HANGUL_INITIAL_SOUNDS[Math.floor(idx / 588)] +
        HANGUL_VOWEL_SOUNDS[Math.floor((idx % 588) / 28)] +
        HANGUL_FINAL_SOUNDS[idx % 28];
    } else if (KANA_SOUNDS[ch] !== undefined) {
      const small = SMALL_Y[chars[i + 1] ?? ""];
      out += small ? KANA_SOUNDS[ch].slice(0, -1) + "y" + small : KANA_SOUNDS[ch];
      if (small) i++;
    } else if (ch === "っ" || ch === "ー") {
      // Geminate and long-vowel marks lengthen the neighbouring sound only
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
