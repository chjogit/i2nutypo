import { useEffect, useState } from "react";
import {
  ensureLyricFont,
  findLyricFont,
  FONT_LANGUAGE_LABEL,
  LYRIC_FONTS,
  type FontLanguage,
} from "@/lib/fonts/catalog";
import { addUserFont, onUserFontsChange, userFonts } from "@/lib/fonts/user-fonts";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

const LANGS: FontLanguage[] = ["ko", "ja", "en"];
/** The font tabs: the catalog's languages, then the user's own font files. */
type FontTab = FontLanguage | "mine";
/** What each font card shows, in the card's own font. */
const SAMPLE: Record<FontLanguage, string> = { ko: "가사 글씨", ja: "歌詞の文字", en: "Lyrics Aa" };

/**
 * Lyric font for every theme, picked in the lyrics section. Fonts are fetched only for the
 * open language tab (as small samples) and for the picked font (with the whole lyrics).
 */
export function LyricFontPicker() {
  const lyricFont = useProjectStore((s) => s.style.lyricFont);
  const lyricsText = useProjectStore((s) => s.lyricsText);
  const setStyle = useProjectStore((s) => s.setStyle);
  const picked = findLyricFont(lyricFont);
  const mine = userFonts().find((f) => f.family === lyricFont);
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<FontTab>(picked?.lang ?? (mine ? "mine" : "ko"));
  const [, setReady] = useState(0);
  const [fontError, setFontError] = useState<string | null>(null);

  useEffect(() => onUserFontsChange(() => setReady((n) => n + 1)), []);

  const addFont = async (file: File) => {
    setFontError(null);
    try {
      const font = await addUserFont(file);
      setStyle({ lyricFont: font.family });
    } catch {
      setFontError(`${file.name}: 글꼴 파일을 읽지 못했습니다 (.ttf, .otf, .woff, .woff2).`);
    }
  };

  // The picked font with every glyph the lyrics use, so the canvas never draws the fallback
  useEffect(() => {
    if (lyricFont) void ensureLyricFont(lyricFont, lyricsText.slice(0, 4000) || undefined);
  }, [lyricFont, lyricsText]);

  // Card samples for the open tab; re-render once they arrive
  useEffect(() => {
    if (!open || lang === "mine") return;
    let alive = true;
    const fonts = LYRIC_FONTS.filter((f) => f.lang === lang);
    void Promise.all(fonts.map((f) => ensureLyricFont(f.family, SAMPLE[lang] + f.label))).then(() => {
      if (alive) setReady((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [open, lang]);

  return (
    <div className="space-y-2 border-t border-zinc-800/70 pt-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-zinc-400">
          글씨체{" "}
          <span className="text-zinc-200">{picked ? picked.label : mine ? mine.fileName : "테마 기본"}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-300 hover:border-indigo-500 hover:text-zinc-100"
        >
          {open ? "닫기" : "글씨체 바꾸기"}
        </button>
      </div>
      {open && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={l === lang}
                className={`rounded-md border px-2 py-1 text-xs ${
                  l === lang
                    ? "border-indigo-500 bg-indigo-500/10 text-zinc-100"
                    : "border-zinc-800 text-zinc-400 hover:border-indigo-500"
                }`}
              >
                {FONT_LANGUAGE_LABEL[l]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setLang("mine")}
              aria-pressed={lang === "mine"}
              className={`rounded-md border px-2 py-1 text-xs ${
                lang === "mine"
                  ? "border-indigo-500 bg-indigo-500/10 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:border-indigo-500"
              }`}
            >
              내 글꼴
            </button>
            <button
              type="button"
              onClick={() => setStyle({ lyricFont: "" })}
              aria-pressed={!picked && !mine}
              className={`ml-auto rounded-md border px-2 py-1 text-xs ${
                !picked && !mine
                  ? "border-indigo-500 bg-indigo-500/10 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:border-indigo-500"
              }`}
            >
              테마 기본
            </button>
          </div>
          {lang === "mine" ? (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:border-indigo-500">
                + 글꼴 파일 올리기 (.ttf .otf .woff .woff2)
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void addFont(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {fontError && <p className="text-xs text-red-400">{fontError}</p>}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {userFonts().map((f) => {
                  const on = f.family === lyricFont;
                  return (
                    <button
                      key={f.family}
                      type="button"
                      onClick={() => setStyle({ lyricFont: f.family })}
                      aria-pressed={on}
                      className={`rounded-md border px-2 py-1.5 text-left ${
                        on ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:border-indigo-500"
                      }`}
                    >
                      <span
                        className="block truncate text-base text-zinc-100"
                        style={{ fontFamily: `'${f.family}'` }}
                      >
                        가사 歌詞 Aa
                      </span>
                      <span className="block truncate text-[10px] text-zinc-500">{f.fileName}</span>
                    </button>
                  );
                })}
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                내 글꼴은 이 브라우저에서만 쓰임
                <Tip>
                  글꼴 파일은 이 브라우저 안에서만 읽고, 페이지를 닫으면 다시 올려야 합니다. 영상에 쓸 수 있는
                  라이선스인지 확인하세요.
                </Tip>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
              {LYRIC_FONTS.filter((f) => f.lang === lang).map((f) => {
                const on = f.family === lyricFont;
                return (
                  <button
                    key={f.family}
                    type="button"
                    onClick={() => setStyle({ lyricFont: f.family })}
                    aria-pressed={on}
                    title={f.note}
                    className={`rounded-md border px-2 py-1.5 text-left ${
                      on ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:border-indigo-500"
                    }`}
                  >
                    <span
                      className="block truncate text-base text-zinc-100"
                      style={{ fontFamily: `'${f.family}', sans-serif` }}
                    >
                      {SAMPLE[lang]}
                    </span>
                    <span className="block truncate text-[10px] text-zinc-500">{f.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {lang !== "mine" && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              무료 글꼴(OFL) · 상업 사용 가능
              <Tip>
                모두 Google Fonts의 무료 글꼴(OFL)이라 영상에 상업적으로 써도 됩니다. 고른 글씨체만 인터넷에서
                받아옵니다.
              </Tip>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
