import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { FEATURES_NOW } from "@/lib/mode/mode";
import { useProjectStore } from "@/store/project-store";
import {
  DEFAULT_LEFT,
  DEFAULT_RIGHT,
  LEFT_RANGE,
  RIGHT_RANGE,
  useLayoutStore,
  type Contrast,
  type LayoutPreset,
} from "@/store/layout-store";
import { ContextMenuHost } from "@/components/ui/context-menu";
import { CommandPalette } from "@/components/ui/command-palette";
import { Tip } from "@/components/ui/tip";
import { AudioInput } from "./audio-input";
import { EffectsPanel } from "./effects-panel";
import { ExportPanel } from "./export-panel";
import { IllustrationPanel } from "./illustration-panel";
import { Inspector } from "./inspector";
import { LyricsEditor } from "./lyrics-editor";
import { Preview } from "./preview";
import { PropsPanel } from "./props-panel";
import { StyleSidebar } from "./style-sidebar";
import { SubtitlePanel } from "./subtitle-panel";
import { Timeline } from "./timeline";

const PRESETS: ReadonlyArray<readonly [LayoutPreset, string, string]> = [
  ["standard", "기본", "양옆 패널과 미리보기, 아래 타임라인"],
  ["preview", "미리보기", "양옆 패널을 접고 미리보기를 크게"],
  ["timeline", "타임라인", "타임라인을 높게 펼쳐 싱크·효과 작업"],
];
const CONTRASTS: ReadonlyArray<readonly [Contrast, string]> = [
  ["dim", "은은하게"],
  ["normal", "보통"],
  ["high", "또렷하게"],
];

const SEG = "rounded px-2 py-0.5";
const SEG_ON = "bg-zinc-700 text-zinc-50";
const SEG_OFF = "text-zinc-400 hover:text-zinc-100";

const clampTo = ([lo, hi]: readonly [number, number], w: number) => Math.round(Math.min(hi, Math.max(lo, w)));

/** Drag handle on a column edge; `side` is the edge it sits on. */
function ColumnGrip({
  side,
  width,
  range,
  reset,
  label,
  onWidth,
}: {
  side: "left" | "right";
  width: number;
  range: readonly [number, number];
  reset: number;
  label: string;
  onWidth: (w: number) => void;
}) {
  const ref = useRef<{ x: number; w: number } | null>(null);
  // Dragging away from the column makes it wider
  const dir = side === "right" ? 1 : -1;
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    ref.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = ref.current;
    if (r) onWidth(clampTo(range, r.w + dir * (e.clientX - r.x)));
  };
  const up = () => {
    ref.current = null;
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={range[0]}
      aria-valuemax={range[1]}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onWidth(clampTo(range, width + (e.key === "ArrowRight" ? 24 : -24) * dir));
        }
      }}
      title={`끌어서 폭 조절 (두 번 클릭하면 원래 폭)`}
      onDoubleClick={() => onWidth(reset)}
      className={`group absolute inset-y-0 ${side === "right" ? "-right-1.5" : "-left-1.5"} z-10 hidden w-3 cursor-ew-resize touch-none justify-center hover:bg-indigo-500/10 focus:bg-indigo-500/10 focus:outline-none lg:flex`}
    >
      {/* The grip stays in view while the long column scrolls */}
      <span className="sticky top-[45vh] mt-[45vh] h-12 w-1 rounded-full bg-zinc-700 group-hover:bg-indigo-400 group-focus:bg-indigo-400" />
    </div>
  );
}

/** Layout presets, contrast, column toggles and the quick-action list, in one thin bar. */
function Toolbar() {
  const { preset, contrast, leftOpen, rightOpen, set } = useLayoutStore();
  const sidesShown = preset !== "preview";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-zinc-800 px-4 py-1.5 text-[11px]">
      <div className="flex items-center gap-1" role="group" aria-label="레이아웃">
        <span className="mr-1 text-zinc-500">레이아웃</span>
        <span className="flex rounded-md bg-zinc-900 p-0.5">
          {PRESETS.map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              aria-pressed={preset === id}
              title={hint}
              onClick={() =>
                set({ preset: id, ...(id === "standard" ? { leftOpen: true, rightOpen: true } : {}) })
              }
              className={`${SEG} ${preset === id ? SEG_ON : SEG_OFF}`}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className="hidden items-center gap-1 lg:flex" role="group" aria-label="패널 접기">
        <button
          type="button"
          aria-pressed={sidesShown && leftOpen}
          onClick={() => set(sidesShown ? { leftOpen: !leftOpen } : { preset: "standard", leftOpen: true })}
          title="왼쪽 영상 스타일 패널 열기·접기"
          className={`${SEG} ${sidesShown && leftOpen ? SEG_ON : SEG_OFF}`}
        >
          ◧ 스타일
        </button>
        <button
          type="button"
          aria-pressed={sidesShown && rightOpen}
          onClick={() =>
            set(sidesShown ? { rightOpen: !rightOpen } : { preset: "standard", rightOpen: true })
          }
          title="오른쪽 효과·일러스트 패널 열기·접기"
          className={`${SEG} ${sidesShown && rightOpen ? SEG_ON : SEG_OFF}`}
        >
          효과 ◨
        </button>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="화면 대비">
        <span className="mr-1 text-zinc-500">대비</span>
        <span className="flex rounded-md bg-zinc-900 p-0.5">
          {CONTRASTS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={contrast === id}
              onClick={() => set({ contrast: id })}
              className={`${SEG} ${contrast === id ? SEG_ON : SEG_OFF}`}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <Tip label="화면 설정 설명">
        레이아웃·대비·패널 폭은 이 브라우저에 저장되어 다음에 열어도 그대로입니다. 패널 사이 경계를 끌면 폭이
        바뀌고, 두 번 누르면 원래대로 돌아갑니다. 타임라인 위 경계도 같은 방식입니다.
      </Tip>
      <button
        type="button"
        onClick={() => set({ paletteOpen: true })}
        className="ml-auto flex items-center gap-2 rounded-md border border-zinc-800 px-2 py-0.5 text-zinc-300 hover:border-indigo-500"
      >
        빠른 작업
        <kbd className="rounded border border-zinc-700 px-1 font-mono text-[10px] text-zinc-500">Ctrl K</kbd>
      </button>
    </div>
  );
}

/**
 * Editor layout: video style on the left, preview with the song and lyrics in
 * the middle, effects and the illustration layer on the right, and the
 * timeline pinned along the bottom. Both side columns resize and fold, and the
 * whole arrangement is remembered per browser.
 */
export function StudioShell() {
  useEffect(() => {
    void useProjectStore.persist.rehydrate();
    useLayoutStore.getState().load();
  }, []);

  const { preset, contrast, leftWidth, rightWidth, leftOpen, rightOpen, set } = useLayoutStore();

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
  }, [contrast]);

  const showLeft = preset !== "preview" && leftOpen;
  const showRight = preset !== "preview" && rightOpen;
  const cols = `${showLeft ? `${leftWidth}px ` : ""}minmax(0,1fr)${showRight ? ` ${rightWidth}px` : ""}`;

  return (
    <div className="flex flex-col">
      <Toolbar />
      {/* One background; areas are split by lines, not boxes */}
      <div
        className="grid flex-1 divide-y divide-zinc-800 lg:grid-cols-[var(--cols)] lg:divide-y-0"
        style={{ "--cols": cols } as CSSProperties}
      >
        <aside
          aria-label="영상 스타일"
          className={`relative divide-y divide-zinc-800 lg:order-1 lg:border-r lg:border-zinc-800 ${showLeft ? "" : "lg:hidden"}`}
        >
          <StyleSidebar />
          <SubtitlePanel />
          <ColumnGrip
            side="right"
            width={leftWidth}
            range={LEFT_RANGE}
            reset={DEFAULT_LEFT}
            label="영상 스타일 폭 조절"
            onWidth={(w) => set({ leftWidth: w })}
          />
        </aside>
        <main
          className={`divide-y divide-zinc-800 lg:order-2 ${preset === "preview" ? "lg:mx-auto lg:w-full lg:max-w-5xl" : ""}`}
        >
          <Preview />
          <AudioInput />
          <LyricsEditor />
          <ExportPanel />
        </main>
        <aside
          aria-label="효과와 일러스트 레이어"
          className={`relative divide-y divide-zinc-800 lg:order-3 lg:border-l lg:border-zinc-800 ${showRight ? "" : "lg:hidden"}`}
        >
          <ColumnGrip
            side="left"
            width={rightWidth}
            range={RIGHT_RANGE}
            reset={DEFAULT_RIGHT}
            label="효과 패널 폭 조절"
            onWidth={(w) => set({ rightWidth: w })}
          />
          <div className="sticky top-0 z-[5]">
            <Inspector />
          </div>
          <EffectsPanel />
          <IllustrationPanel />
          {FEATURES_NOW.characters ? (
            <PropsPanel />
          ) : (
            <p className="flex items-center gap-2 px-4 py-3 text-[11px] text-zinc-500">
              캐릭터·소품 레이어
              <Tip>캐릭터·소품 레이어와 등장·퇴장 연출은 숙련 단계에서 쓸 수 있습니다.</Tip>
            </p>
          )}
        </aside>
      </div>
      <Timeline />
      <ContextMenuHost />
      <CommandPalette />
    </div>
  );
}
