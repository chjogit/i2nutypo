/**
 * Lyric fonts the user can pick, ten each for Korean, Japanese and English. All are on Google
 * Fonts under the SIL Open Font License, so they are free to use in videos, commercial ones
 * included. A font is fetched only when it is picked, not with the page.
 */
export type FontLanguage = "ko" | "ja" | "en";

export interface LyricFont {
  /** CSS family name, as Google Fonts spells it. */
  family: string;
  label: string;
  lang: FontLanguage;
  /** One line on where it fits. */
  note: string;
  /** Weights fetched; the heaviest is used for bold lyrics when the font has it. */
  weights: readonly number[];
  serif?: boolean;
}

export const FONT_LANGUAGE_LABEL: Record<FontLanguage, string> = {
  ko: "한국어",
  ja: "일본어",
  en: "영어",
};

export const LYRIC_FONTS: readonly LyricFont[] = [
  { family: "Noto Sans KR", label: "본고딕 (Noto Sans KR)", lang: "ko", note: "기본 자막용 고딕", weights: [400, 700, 900] },
  { family: "Black Han Sans", label: "검은고딕", lang: "ko", note: "굵고 강한 제목", weights: [400] },
  { family: "Do Hyeon", label: "도현", lang: "ko", note: "각진 예능 자막", weights: [400] },
  { family: "Jua", label: "주아", lang: "ko", note: "둥글고 귀여운 자막", weights: [400] },
  { family: "Nanum Gothic", label: "나눔고딕", lang: "ko", note: "깔끔한 본문", weights: [400, 700, 800] },
  { family: "Gothic A1", label: "고딕 A1", lang: "ko", note: "단정한 고딕, 굵기 다양", weights: [400, 700, 900] },
  { family: "Gowun Dodum", label: "고운돋움", lang: "ko", note: "부드러운 감성 자막", weights: [400] },
  { family: "Nanum Myeongjo", label: "나눔명조", lang: "ko", note: "발라드·서정적 가사", weights: [400, 700, 800], serif: true },
  { family: "Gowun Batang", label: "고운바탕", lang: "ko", note: "잔잔한 명조", weights: [400, 700], serif: true },
  { family: "Nanum Pen Script", label: "나눔손글씨 펜", lang: "ko", note: "손글씨 느낌", weights: [400] },

  { family: "Noto Sans JP", label: "Noto Sans JP", lang: "ja", note: "基本のゴシック", weights: [400, 700, 900] },
  { family: "M PLUS 1", label: "M PLUS 1", lang: "ja", note: "すっきりしたテロップ", weights: [400, 700, 900] },
  { family: "M PLUS Rounded 1c", label: "M PLUS Rounded 1c", lang: "ja", note: "丸ゴシック", weights: [400, 700, 900] },
  { family: "Kosugi Maru", label: "小杉丸ゴシック", lang: "ja", note: "やわらかい丸文字", weights: [400] },
  { family: "Zen Maru Gothic", label: "Zen Maru Gothic", lang: "ja", note: "やさしい丸ゴシック", weights: [400, 700, 900] },
  { family: "Dela Gothic One", label: "デラゴシック", lang: "ja", note: "極太の見出し", weights: [400] },
  { family: "RocknRoll One", label: "ロックンロール", lang: "ja", note: "ポップで太い", weights: [400] },
  { family: "DotGothic16", label: "ドットゴシック16", lang: "ja", note: "ドット・レトロゲーム", weights: [400] },
  { family: "Shippori Mincho", label: "しっぽり明朝", lang: "ja", note: "物語風の明朝", weights: [400, 700, 800], serif: true },
  { family: "Klee One", label: "クレー", lang: "ja", note: "手書き風の楷書", weights: [400, 600] },

  { family: "Montserrat", label: "Montserrat", lang: "en", note: "Geometric titles", weights: [400, 700, 900] },
  { family: "Poppins", label: "Poppins", lang: "en", note: "Friendly geometric", weights: [400, 700, 900] },
  { family: "Inter", label: "Inter", lang: "en", note: "Clean, very legible", weights: [400, 700, 900] },
  { family: "Anton", label: "Anton", lang: "en", note: "Tall, heavy impact", weights: [400] },
  { family: "Bebas Neue", label: "Bebas Neue", lang: "en", note: "All-caps condensed", weights: [400] },
  { family: "Oswald", label: "Oswald", lang: "en", note: "Condensed headline", weights: [400, 700] },
  { family: "Raleway", label: "Raleway", lang: "en", note: "Thin and elegant", weights: [400, 700, 900] },
  { family: "Nunito", label: "Nunito", lang: "en", note: "Rounded and soft", weights: [400, 700, 900] },
  { family: "Playfair Display", label: "Playfair Display", lang: "en", note: "High-contrast serif", weights: [400, 700, 900], serif: true },
  { family: "Permanent Marker", label: "Permanent Marker", lang: "en", note: "Marker handwriting", weights: [400] },
];

export const findLyricFont = (family: string): LyricFont | undefined => LYRIC_FONTS.find((f) => f.family === family);

/**
 * The CSS font stack for a picked family. Korean and Japanese fallbacks follow it, so a Latin
 * font still shows kana and hangul, and a Korean font still shows kana.
 */
export function lyricFontStack(family: string): string {
  const font = findLyricFont(family);
  if (!font) return "";
  const fallback = font.serif
    ? "'Nanum Myeongjo', 'Shippori Mincho', serif"
    : "'Noto Sans KR', 'Noto Sans JP', sans-serif";
  return `'${font.family}', ${fallback}`;
}

/** Google Fonts stylesheet URL for one family. */
export function googleFontUrl(font: LyricFont): string {
  const name = font.family.replace(/ /g, "+");
  const axis = font.weights.length > 1 || font.weights[0] !== 400 ? `:wght@${font.weights.join(";")}` : "";
  return `https://fonts.googleapis.com/css2?family=${name}${axis}&display=swap`;
}

/** Stylesheet loads by family, so each is added once. */
const sheets = new Map<string, Promise<void>>();

function addSheet(font: LyricFont): Promise<void> {
  let sheet = sheets.get(font.family);
  if (!sheet) {
    sheet = new Promise<void>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontUrl(font);
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    sheets.set(font.family, sheet);
  }
  return sheet;
}

/**
 * Adds the family's stylesheet once and resolves when its glyphs are ready, so the canvas
 * draws with it instead of the fallback. Pass the lyrics as sample so every subset they need
 * is fetched up front. Resolves anyway if the network is down.
 */
export async function ensureLyricFont(family: string, sample = "가あA"): Promise<void> {
  const font = findLyricFont(family);
  if (!font || typeof document === "undefined") return;
  await addSheet(font);
  const heaviest = Math.max(...font.weights);
  try {
    await Promise.all([
      document.fonts.load(`400 32px '${font.family}'`, sample),
      document.fonts.load(`${heaviest} 32px '${font.family}'`, sample),
    ]);
  } catch {
    // Offline or blocked: the fallback fonts draw instead
  }
}
