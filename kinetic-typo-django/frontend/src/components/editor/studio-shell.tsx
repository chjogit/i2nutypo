
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useProjectStore } from "@/store/project-store";
import { AudioInput } from "./audio-input";
import { ExportPanel } from "./export-panel";
import { IllustrationPanel } from "./illustration-panel";
import { LyricsEditor } from "./lyrics-editor";
import { Preview } from "./preview";
import { PropsPanel } from "./props-panel";
import { StyleSidebar } from "./style-sidebar";
import { SubtitlePanel } from "./subtitle-panel";
import { Timeline } from "./timeline";

/** Width of the video style column on wide screens; the user drags its right edge between these. */
const DEFAULT_STYLE_WIDTH = 300;
const MIN_STYLE_WIDTH = 240;
const MAX_STYLE_WIDTH = 560;
const STYLE_WIDTH_KEY = "kinetic-typo-style-width";

const clampWidth = (w: number) => Math.round(Math.min(MAX_STYLE_WIDTH, Math.max(MIN_STYLE_WIDTH, w)));

/**
 * Editor layout: video style on the left, preview with the song and lyrics in
 * the middle, the illustration layer on the right, and the subtitle timeline
 * pinned along the bottom.
 */
export function StudioShell() {
  useEffect(() => {
    void useProjectStore.persist.rehydrate();
  }, []);

  const [styleWidth, setStyleWidth] = useState(DEFAULT_STYLE_WIDTH);
  const resizeRef = useRef<{ pointerX: number; startWidth: number } | null>(null);

  // Remembered per browser; read after mount so the server HTML matches the first paint
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STYLE_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) setStyleWidth(clampWidth(saved));
    } catch {
      // Storage blocked: keep the default
    }
  }, []);

  const changeWidth = (w: number) => {
    setStyleWidth(w);
    try {
      localStorage.setItem(STYLE_WIDTH_KEY, String(w));
    } catch {
      // Storage blocked: the width lasts for this page only
    }
  };

  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    resizeRef.current = { pointerX: e.clientX, startWidth: styleWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (r) changeWidth(clampWidth(r.startWidth + (e.clientX - r.pointerX)));
  };
  const onResizeUp = () => {
    resizeRef.current = null;
  };

  return (
    <div className="flex flex-col">
      {/* One background; areas are split by lines, not boxes */}
      <div
        className="grid flex-1 divide-y divide-zinc-800 lg:grid-cols-[var(--style-w)_minmax(0,1fr)_300px] lg:divide-y-0"
        style={{ "--style-w": `${styleWidth}px` } as CSSProperties}
      >
        <aside
          aria-label="영상 스타일"
          className="relative divide-y divide-zinc-800 lg:order-1 lg:border-r lg:border-zinc-800"
        >
          <StyleSidebar />
          <SubtitlePanel />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="영상 스타일 폭 조절"
            aria-valuenow={styleWidth}
            aria-valuemin={MIN_STYLE_WIDTH}
            aria-valuemax={MAX_STYLE_WIDTH}
            tabIndex={0}
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                changeWidth(clampWidth(styleWidth + (e.key === "ArrowRight" ? 24 : -24)));
              }
            }}
            title="끌어서 영상 스타일 폭 조절 (두 번 클릭하면 원래 폭)"
            onDoubleClick={() => changeWidth(DEFAULT_STYLE_WIDTH)}
            className="group absolute inset-y-0 -right-1.5 z-10 hidden w-3 cursor-ew-resize touch-none justify-center hover:bg-indigo-500/10 focus:bg-indigo-500/10 focus:outline-none lg:flex"
          >
            {/* The grip stays in view while the long column scrolls */}
            <span className="sticky top-[45vh] mt-[45vh] h-12 w-1 rounded-full bg-zinc-700 group-hover:bg-indigo-400 group-focus:bg-indigo-400" />
          </div>
        </aside>
        <main className="divide-y divide-zinc-800 lg:order-2">
          <Preview />
          <AudioInput />
          <LyricsEditor />
          <ExportPanel />
        </main>
        <aside
          aria-label="일러스트 레이어"
          className="divide-y divide-zinc-800 lg:order-3 lg:border-l lg:border-zinc-800"
        >
          <IllustrationPanel />
          <PropsPanel />
        </aside>
      </div>
      <Timeline />
    </div>
  );
}
