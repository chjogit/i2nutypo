import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LookPresetId } from "@/types/project";
import { BEGINNER_THEMES } from "@/lib/mode/mode";
import { getLookPreset } from "@/lib/render/looks/presets";
import { recommendThemes } from "@/lib/render/looks/theme-advisor";
import { useProjectStore } from "@/store/project-store";
import { loadProject } from "@/lib/session/shared-song";
import { useLayoutStore } from "@/store/layout-store";
import { AlbumCoverPicker } from "./album-cover-picker";
import { AudioInput } from "./audio-input";
import { BgVideoPicker } from "./bg-video-picker";
import {
  AutoContrastControl,
  ElementMotionToggle,
  LyricOrientationControl,
  NoVibrationToggle,
} from "./readability-controls";
import { ExportPanel } from "./export-panel";
import { LyricFontPicker } from "./lyric-font-picker";
import { LyricsEditor } from "./lyrics-editor";
import { Preview } from "./preview";
import { SubtitlePanel } from "./subtitle-panel";
import { Timeline } from "./timeline";
import { Tip } from "@/components/ui/tip";
import { ContextMenuHost } from "@/components/ui/context-menu";

/**
 * A numbered step. The step to do next has an indigo border and a "지금 할
 * 차례" tag; a finished one shows a check. Every step stays open, so the order
 * is a guide and not a lock.
 */
function StepCard({
  n,
  title,
  hint,
  done,
  current,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  done: boolean;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`${n}단계 ${title}`}
      className={`rounded-xl border-2 bg-zinc-900/40 ${current ? "border-indigo-500" : "border-zinc-800"}`}
    >
      <header className="flex items-center gap-3 px-4 pt-4">
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
            done
              ? "bg-emerald-500 text-zinc-950"
              : current
                ? "bg-indigo-600 text-white"
                : "bg-zinc-800 text-zinc-300"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-zinc-100">
            {n}. {title}
          </h2>
          <p className="text-xs text-zinc-400">{hint}</p>
        </div>
        {current && (
          <span className="shrink-0 rounded-full bg-indigo-600/20 px-2.5 py-1 text-xs font-semibold text-indigo-200">
            지금 할 차례
          </span>
        )}
        {done && !current && <span className="shrink-0 text-xs font-semibold text-emerald-400">완료</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * Three big theme buttons; picking one replaces the theme and its colors. One
 * of them is marked as recommended from the lyrics and tempo.
 */
function ThemeChoice({ onPick }: { onPick: () => void }) {
  const current = useProjectStore((s) => s.style.lookPreset);
  const applyLookPreset = useProjectStore((s) => s.applyLookPreset);
  const lines = useProjectStore((s) => s.lines);
  const bpm = useProjectStore((s) => s.style.bpm);
  const language = useProjectStore((s) => s.style.language);
  const rec = useMemo(
    () => recommendThemes({ lines, bpm, language }, 1, BEGINNER_THEMES)[0] ?? null,
    [lines, bpm, language],
  );
  const pick = (id: LookPresetId) => {
    applyLookPreset(id);
    onPick();
  };
  return (
    <div className="space-y-2 px-4 py-4">
      {rec && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 break-keep text-zinc-300">
            <span className="font-semibold text-indigo-200">
              추천: {getLookPreset(rec.lookPreset).emoji} {getLookPreset(rec.lookPreset).label}
            </span>{" "}
            <span className="text-zinc-400">
              가사와 템포를 보면 {rec.tags.slice(0, 2).join(" · ")} 느낌이 어울려요.
            </span>
          </span>
          {current !== rec.lookPreset && (
            <button
              type="button"
              onClick={() => pick(rec.lookPreset)}
              className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-500"
            >
              추천 테마로
            </button>
          )}
        </div>
      )}
      <div role="radiogroup" aria-label="테마" className="grid gap-2 sm:grid-cols-3">
        {BEGINNER_THEMES.map((id) => {
          const p = getLookPreset(id);
          const on = current === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(id)}
              className={`relative rounded-lg border-2 p-3 text-left ${
                on ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:border-indigo-500"
              }`}
            >
              {/* The theme's own colors, so the three read apart at a glance */}
              <span
                aria-hidden
                className="mb-2 flex h-14 items-center justify-center rounded-md text-2xl font-black"
                style={{
                  background: p.palette.bgColor,
                  color: p.palette.textColor,
                  fontFamily: p.palette.mainFont,
                }}
              >
                <span style={{ color: p.palette.accentColor }}>{p.emoji}</span>&nbsp;가사
              </span>
              <span className="block text-sm font-bold text-zinc-100">
                {p.label}
                {rec?.lookPreset === id && (
                  <span className="ml-1.5 rounded-full bg-indigo-600/25 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-indigo-200">
                    추천
                  </span>
                )}
              </span>
              <span className="block break-keep text-[11px] leading-snug text-zinc-400">{p.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Lyric color and size; line breaks and the box size are changed on the preview itself. */
function LyricLook() {
  const textColor = useProjectStore((s) => s.style.textColor);
  const fontScale = useProjectStore((s) => s.style.fontScale);
  const setStyle = useProjectStore((s) => s.setStyle);
  return (
    <div className="space-y-2.5 px-4 pt-4 text-xs text-zinc-400">
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        미리보기에서 바로 고치는 법
        <Tip>
          미리보기의 가사 상자를 끌면 위치, 모서리는 크기, 좌우 막대는 줄바꿈 폭이 바뀝니다. 두 번 클릭하면
          가사와 줄바꿈을 직접 고칠 수 있어요. 미리보기에 마우스를 올리면 나오는 ⌖ 점을 끌면 테마 장식을 옮길
          수 있어요. 시간이 어긋난 줄은 아래 타임라인에서 끌어 맞추세요.
        </Tip>
      </p>
      <label className="flex items-center justify-between gap-3">
        <span>가사 색</span>
        <input
          type="color"
          value={textColor}
          onChange={(e) => setStyle({ textColor: e.target.value })}
          aria-label="가사 색"
          className="h-7 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
        />
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>가사 크기</span>
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={fontScale}
            onChange={(e) => setStyle({ fontScale: Number(e.target.value) })}
            onDoubleClick={() => setStyle({ fontScale: 1 })}
            aria-label="가사 크기"
            className="w-32 accent-indigo-500"
          />
          <span className="w-10 text-right font-mono text-zinc-300">{Math.round(fontScale * 100)}%</span>
        </span>
      </label>
      <LyricOrientationControl />
      <AutoContrastControl />
      <ElementMotionToggle />
      <NoVibrationToggle />
      <LyricFontPicker />
    </div>
  );
}

/**
 * The beginner page: three big steps (theme, song, lyrics), then subtitle
 * touch-ups and saving the video, with the preview kept in view beside them.
 */
export function BeginnerShell() {
  useEffect(() => {
    void loadProject();
    useLayoutStore.getState().load();
  }, []);

  const [themePicked, setThemePicked] = useState(false);
  const hasAudio = useProjectStore((s) => s.audio.kind === "upload");
  const lyricsDone = useProjectStore((s) => s.lyricsCollapsed && s.lines.length > 0);
  const done = [themePicked, hasAudio, lyricsDone];
  const next = done.indexOf(false);

  return (
    <div className="flex flex-col">
      <div className="grid gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <StepCard
            n={1}
            title="테마 선택"
            hint="영상 분위기를 하나 고르세요. 나중에 바꿔도 됩니다."
            done={themePicked}
            current={next === 0}
          >
            <ThemeChoice onPick={() => setThemePicked(true)} />
          </StepCard>
          <StepCard
            n={2}
            title="음원 파일 선택"
            hint="노래 파일을 고르세요. 파일은 이 브라우저 밖으로 나가지 않습니다."
            done={hasAudio}
            current={next === 1}
          >
            <AudioInput heading={false} />
          </StepCard>
          <StepCard
            n={3}
            title="가사 입력"
            hint="한 줄에 한 소절씩 넣고 '가사 입력 완료'를 누른 뒤 자동 싱크를 실행하세요."
            done={lyricsDone}
            current={next === 2}
          >
            <LyricsEditor heading={false} fontPicker={false} />
          </StepCard>
          <StepCard
            n={4}
            title="자막 다듬기"
            hint="색, 크기, 줄바꿈, 앨범 커버와 배경 영상을 원하는 대로 바꾸세요."
            done={false}
            current={false}
          >
            <LyricLook />
            <SubtitlePanel />
            <div className="space-y-4 px-4 pb-4">
              <AlbumCoverPicker />
              <BgVideoPicker compact />
            </div>
          </StepCard>
          <StepCard
            n={5}
            title="영상 저장"
            hint="화질을 고르고 저장하면 완성입니다."
            done={false}
            current={next === -1}
          >
            <ExportPanel />
          </StepCard>
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-zinc-800">
            <Preview />
          </div>
        </div>
      </div>
      <Timeline />
      <ContextMenuHost />
    </div>
  );
}
