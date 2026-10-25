import { useState } from "react";
import type { LanguageCode } from "@/types/project";
import { toEditableLyrics } from "@/lib/lyrics/parse";
import { useProjectStore } from "@/store/project-store";
import { LyricFontPicker } from "./lyric-font-picker";
import { SyncPanel } from "./sync-panel";

const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: "ko-KR", label: "한국어" },
  { code: "ja-JP", label: "日本語" },
  { code: "en-US", label: "English" },
];

const PLACEHOLDER = [
  "가사를 한 줄에 한 소절씩 입력하세요.",
  "강조할 단어는 **별표**로 감싸거나 끝에 !를 붙이고, 줄 끝에 ' !'를 띄워 붙이면 그 줄 전체를 강조합니다.",
  "표시가 없으면 테마가 색을 바꾸지 않고 기본 글자색으로 나옵니다.",
  "",
  "일본어 노래는 원문 아래에 발음, 뜻 줄을 이어 쓰면",
  "원문은 가운데에서 움직이고 발음과 뜻은 하단 자막이 됩니다.",
  "君がいない夜",
  "키미가 이나이 요루",
  "네가 없는 밤",
  "",
  "코러스·화음처럼 앞 줄과 동시에 부르는 줄은 앞에 & 를 붙이세요.",
  "& 君を待つ",
  "& 키미오 마츠",
  "& 너를 기다려",
].join("\n");

/**
 * Lyrics card: the box is for typing lyrics only (times are edited on the
 * timeline). Once entered it folds to a summary with an edit button. The
 * automatic sync controls live in the same card. The beginner page drops the
 * heading (its step card has one) and shows the font picker with the subtitle step.
 */
export function LyricsEditor({
  heading = true,
  fontPicker = true,
}: {
  heading?: boolean;
  fontPicker?: boolean;
}) {
  const lines = useProjectStore((s) => s.lines);
  const collapsed = useProjectStore((s) => s.lyricsCollapsed);
  const commitLyricsInput = useProjectStore((s) => s.commitLyricsInput);
  const setLyricsCollapsed = useProjectStore((s) => s.setLyricsCollapsed);
  const loadSampleLyrics = useProjectStore((s) => s.loadSampleLyrics);
  const language = useProjectStore((s) => s.style.language);
  const setStyle = useProjectStore((s) => s.setStyle);
  // The draft is filled from the current lines whenever the box opens
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? toEditableLyrics(lines);

  const finish = () => {
    commitLyricsInput(text);
    setDraft(null);
  };

  return (
    <section aria-label="가사" className="space-y-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        {heading && <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-400 mb-0">가사</h2>}
        {collapsed && (
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setLyricsCollapsed(false);
            }}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-indigo-500 hover:text-zinc-100"
          >
            가사 수정
          </button>
        )}
      </div>

      {collapsed ? (
        <div className="space-y-1 text-xs">
          <p className="text-zinc-400">
            {lines.length}줄 입력됨
            {lines.some((l) => l.pronText || l.transText) && " · 하단 자막(발음·뜻) 포함"}
          </p>
          <ol className="max-h-24 space-y-0.5 overflow-y-auto text-zinc-300">
            {lines.slice(0, 4).map((l, i) => (
              <li key={i} className="truncate">
                {l.cleanText}
              </li>
            ))}
            {lines.length > 4 && <li className="text-zinc-500">…</li>}
          </ol>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setDraft(e.target.value)}
            rows={9}
            spellCheck={false}
            aria-label="가사 입력"
            className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:border-indigo-500 focus:outline-none"
            placeholder={PLACEHOLDER}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={finish}
              disabled={!text.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              가사 입력 완료
            </button>
            <span className="ml-auto text-zinc-500">예시</span>
            <select
              value={language}
              onChange={(e) => setStyle({ language: e.target.value as LanguageCode })}
              aria-label="예시 가사 언어"
              className="rounded-md border border-zinc-800 bg-zinc-950 px-1 py-1 text-zinc-300"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                loadSampleLyrics();
                setDraft(null);
              }}
              className="rounded-md bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
            >
              예시 가사 넣기
            </button>
          </div>
        </div>
      )}

      {fontPicker && <LyricFontPicker />}

      <SyncPanel />
    </section>
  );
}
