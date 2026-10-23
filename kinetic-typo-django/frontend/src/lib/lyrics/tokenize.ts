import type { LanguageCode, WordEffect } from "@/types/project";

const LRC_TIME_TAG = /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g;

export function detectLyricsLanguage(text: string): LanguageCode {
  const clean = text.replace(LRC_TIME_TAG, "");
  // Kanji count as Japanese, and Japanese wins at half the Korean count, so a
  // Japanese line with a few Korean words mixed in is still read as Japanese
  const jaCount = (clean.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) ?? []).length;
  const koCount = (clean.match(/[\uAC00-\uD7AF\u3130-\u318F]/g) ?? []).length;
  if (jaCount > 0 && jaCount >= koCount * 0.5) return "ja-JP";
  if (koCount > 0) return "ko-KR";
  return "en-US";
}

/** Splits on spaces; Japanese lines without spaces are chunked by script. */
/**
 * A line break typed into a lyric: "/n" in the lyrics text (変わらぬ人の/n惨さに近い),
 * kept as "\n" in a line's cleanText.
 */
export const MANUAL_BREAK = /\s*(?:\/n|\n)\s*/;

/** The parts of a lyric between manual line breaks, trimmed, without empty parts. */
export function splitManualBreaks(text: string): string[] {
  return text
    .split(MANUAL_BREAK)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function tokenizeMultilingualLine(rawLine: string): string[] {
  const trimmed = rawLine.trim();
  if (!trimmed) return [];
  if (/\s+/.test(trimmed)) return trimmed.split(/\s+/).filter(Boolean);
  if (/[\u3040-\u30FF\u4E00-\u9FAF]/.test(trimmed)) {
    const chunks = trimmed.match(
      /(\*[^*]+\*|[\u4E00-\u9FAF]+[\u3040-\u309F]*|[\u30A0-\u30FF]+|[A-Za-z0-9]+|[\u3040-\u309F]{1,4})/g,
    );
    if (chunks && chunks.length > 1) return chunks;
  }
  return [trimmed];
}

const SEMANTIC_RULES: ReadonlyArray<{ effect: WordEffect; pattern: RegExp }> = [
  {
    effect: "slice",
    pattern:
      /갈라|썰리|조각|깨진|깨뜨려|베어|切り|裂い|割れ|砕け|壊れ|打ち砕け|slice|slash|cut|shatter|split|tear/i,
  },
  {
    effect: "stretch",
    pattern:
      /늘어지|길게|영원|멀리|멀리서|끝없이|伸び|永遠|遠く|果てしなく|長く|stretch|forever|endless|far|wide|afar/i,
  },
  {
    effect: "drop",
    pattern: /아래|떨어|추락|무너|버텼던|落ち|堕ち|下へ|沈む|崩れ|down|drop|fall|sink|crash|deep/i,
  },
  {
    effect: "blur",
    pattern:
      /흐려|꿈|기억|안개|사라|아지랑이|외로웠지만|霞む|ぼやけ|夢|記憶|陽炎|消え|blur|dream|fade|haze|lonely/i,
  },
  {
    effect: "mirror",
    pattern: /거울|반사|비친|데칼|웃고|鏡|映る|反射|mirror|reflect|shadow|smiling/i,
  },
];

const IMPACT_PATTERN =
  /터질|터져|폭발|클라이맥스|강렬|밤|Goodbye|GoodNight|Back|爆発|弾け|ドラマ|夜|drama|done|explode|climax/i;

/** Picks a motion effect from the word's meaning; *starred* words get the impact pop. */
export function detectWordSemanticEffect(rawWord: string): {
  effect: WordEffect;
  isAccent: boolean;
} {
  const clean = rawWord.replace(/\*/g, "");
  for (const rule of SEMANTIC_RULES) {
    if (rule.pattern.test(clean)) return { effect: rule.effect, isAccent: true };
  }
  if (rawWord.includes("*") || IMPACT_PATTERN.test(clean)) {
    return { effect: "impact", isAccent: true };
  }
  return { effect: "normal", isAccent: false };
}
