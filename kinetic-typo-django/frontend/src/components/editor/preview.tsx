import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { filterBackground } from "@/lib/render/bg-filter";
import type { TextBounds } from "@/lib/render/text-bounds";
import { readBassEnergy } from "@/lib/audio/audio-graph";
import { createParticles } from "@/lib/render/particles";
import { ASPECT_RATIOS, CANVAS_SIZE, logicalSize, pixelSize } from "@/lib/render/canvas-size";
import { previewPropVideos } from "@/lib/media/prop-video";
import { PREVIEW_QUALITIES, useLayoutStore } from "@/store/layout-store";
import { bpmPulseEnergy, renderFrame, steppedTime } from "@/lib/render/render-frame";
import { resolveIllustrationImages, resolvePropLayers } from "@/lib/render/looks/image-cache";
import { FEATURES_NOW } from "@/lib/mode/mode";
import { previewVideoFrame } from "@/lib/media/video-bg";
import { beatGridPulse } from "@/lib/beats/detect";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { ensureKineticFonts, kineticFontsReady } from "@/lib/render/kinetic/fonts";
import { motionStyleOf } from "@/lib/render/kinetic/styles";
import { IllustrationOverlay } from "./illustration-overlay";
import { ElementOverlay } from "./element-overlay";
import { MiniPreview, useMiniPreviewEnabled } from "./mini-preview";
import { Tip } from "@/components/ui/tip";
import { SHORTS_SAFE } from "@/lib/shorts/highlight";
import {
  clampTo,
  DEFAULT_PREVIEW_HEIGHT,
  keyResize,
  PREVIEW_HEIGHT_BIG_STEP,
  PREVIEW_HEIGHT_RANGE,
  PREVIEW_HEIGHT_STEP,
} from "@/lib/ui/preview-size";
import { applyOverride, TextBoxOverlay, type LineOverride } from "./text-box-overlay";

/**
 * Canvas preview. Playback time lives in the playback store and the canvas is
 * drawn from a RAF loop, so React does not re-render per frame. With a song
 * loaded, the player in the audio section is the clock; the transport is the
 * subtitle timeline at the bottom.
 */
/** How often a paused preview with nothing new is drawn anyway. */
const IDLE_REDRAW_MS = 250;

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Where the last frame drew its lyrics, and a text box drag not yet saved. */
  const boundsRef = useRef<TextBounds>({ lyrics: null, elements: [] });
  const overrideRef = useRef<LineOverride | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [miniEnabled, setMiniEnabled] = useMiniPreviewEnabled();
  const [safeZone, setSafeZone] = useState(true);
  const aspectRatio = useProjectStore((s) => s.style.aspectRatio);
  const setStyle = useProjectStore((s) => s.setStyle);
  const size = CANVAS_SIZE[aspectRatio];
  const quality = useLayoutStore((s) => s.previewQuality);
  const setLayout = useLayoutStore((s) => s.set);
  const px = pixelSize(aspectRatio, quality);
  const previewHeight = useLayoutStore((s) => s.previewHeight);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const particles = createParticles();
    let raf = 0;
    let last = performance.now();
    // What the last drawn frame was made from, so a paused preview with nothing new is not drawn again
    let drawn: { t: number; project: unknown; override: unknown; width: number; at: number } | null = null;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const playback = usePlaybackStore.getState();
      if (playback.exporting) {
        drawn = null;
        raf = requestAnimationFrame(tick);
        return;
      }
      const project = useProjectStore.getState();
      // A motion style draws only once its fonts are in, so no fallback face ever flashes
      if (motionStyleOf(project.style) && !kineticFontsReady()) {
        void ensureKineticFonts(project.lyricsText, project.style.lyricFont);
        raf = requestAnimationFrame(tick);
        return;
      }
      const el = playback.audioEl;
      let t = playback.currentTime;

      if (el) {
        // Follows the player even while paused, so its scrubber moves the canvas
        t = el.currentTime;
        if (t !== playback.currentTime) playback.setCurrentTime(t);
      } else if (playback.isPlaying) {
        t += dt;
        if (t >= project.duration) t = 0;
        playback.setCurrentTime(t);
      }

      // Paused and unchanged: redraw only a few times a second, to pick up pictures and video frames
      // that finish loading on their own
      const still =
        !playback.isPlaying &&
        drawn !== null &&
        drawn.t === t &&
        drawn.project === project &&
        drawn.override === overrideRef.current &&
        drawn.width === canvas.width &&
        now - drawn.at < IDLE_REDRAW_MS;
      if (still) {
        raf = requestAnimationFrame(tick);
        return;
      }
      drawn = { t, project, override: overrideRef.current, width: canvas.width, at: now };

      const images = resolveIllustrationImages(project.images);
      const video = previewVideoFrame(project.bgVideo, t, playback.isPlaying);
      if (video) images.background = filterBackground(video, project.style.bgVideoFilter, "preview");
      const pulse = project.beats
        ? beatGridPulse(t, project.beats, project.style.beatReact, playback.isPlaying)
        : bpmPulseEnergy(t, project.style.bpm, project.style.beatReact, playback.isPlaying);

      // Laid out at the logical size and drawn at the chosen pixel size, like the export
      const logical = logicalSize(canvas);
      const scale = canvas.width / logical.width;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderFrame({
        ctx,
        W: logical.width,
        H: logical.height,
        timeSec: steppedTime(t, project.style.frameStep),
        lines: applyOverride(project.lines, overrideRef.current),
        style: project.style,
        fx: project.fx,
        subtitles: project.subtitles,
        introGateSec: project.sync.introGateSec,
        particles,
        energy: (playback.isPlaying ? readBassEnergy(el, project.style.beatReact) : null) ?? pulse,
        animateParticles: true,
        images,
        props: resolvePropLayers(project.props, previewPropVideos(project.props, t, playback.isPlaying)),
        bounds: boundsRef.current,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section aria-label="미리보기" className="space-y-2 px-4 py-4">
      <div ref={frameRef} data-preview-frame className="flex flex-col items-center">
        <div
          ref={boxRef}
          className="group/preview relative max-w-full"
          style={{ width: boxWidth(previewHeight, px.width / px.height) }}
        >
          <canvas
            ref={canvasRef}
            width={px.width}
            height={px.height}
            data-lw={size.width}
            data-lh={size.height}
            className="block h-auto w-full border border-zinc-800"
          />
          <TextBoxOverlay canvasRef={canvasRef} boundsRef={boundsRef} overrideRef={overrideRef} />
          <ElementOverlay canvasRef={canvasRef} boundsRef={boundsRef} />
          {FEATURES_NOW.characters && <IllustrationOverlay canvasRef={canvasRef} />}
          {safeZone && aspectRatio === "9:16" && <ShortsSafeZone />}
        </div>
        <PreviewSizeHandle
          boxRef={boxRef}
          canvasRef={canvasRef}
          height={previewHeight}
          ratio={px.width / px.height}
          onHeight={(h) => setLayout({ previewHeight: h })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          미리보기에서 바로 고치기
          <Tip label="미리보기 조작법">
            가사 박스를 끌어 옮기고, 모서리로 글자 크기, 좌우 막대로 가로 폭(줄바꿈), 위아래 막대로 줄 간격을
            바꿉니다. 두 번 클릭하면 가사와 줄바꿈을 고칩니다. 마우스를 올리면 나오는 ⌖ 점을 끌면 테마
            장식(레코드, 커버, 원 등)을 옮기고, 두 번 클릭하면 원래 자리로 돌아갑니다.
            {
              " 미리보기 아래 막대를 위아래로 끌거나 막대에서 ↑↓ 키로 미리보기 크기를 바꾸고, 두 번 클릭하면 기본 크기로 돌아갑니다."
            }
            {FEATURES_NOW.characters &&
              " 일러스트 칸이나 타임라인에서 캐릭터·소품을 고르면 여기서 끌어 옮기고 모서리로 크기, 위쪽 점으로 회전을 바꿉니다."}
          </Tip>
        </span>
        <label
          className="ml-auto flex shrink-0 items-center gap-1 text-xs text-zinc-400"
          title="아래로 스크롤해 미리보기가 안 보이면 화면 구석에 작은 미리보기 창을 띄웁니다"
        >
          <input
            type="checkbox"
            checked={miniEnabled}
            onChange={(e) => setMiniEnabled(e.target.checked)}
            className="accent-tide-500"
          />
          작은 창
        </label>
        <label
          className="flex shrink-0 items-center gap-1 text-xs text-zinc-400"
          title="미리보기 화질 (내보내기 화질과는 따로 정합니다)"
        >
          화질
          <select
            value={quality}
            onChange={(e) =>
              setLayout({ previewQuality: Number(e.target.value) as (typeof PREVIEW_QUALITIES)[number] })
            }
            aria-label="미리보기 화질"
            className="rounded-md border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-xs text-zinc-200 focus:border-tide-500 focus:outline-none"
          >
            {PREVIEW_QUALITIES.map((q) => (
              <option key={q} value={q}>
                {q}p
              </option>
            ))}
          </select>
        </label>
        {aspectRatio === "9:16" && (
          <label
            className="flex shrink-0 items-center gap-1 text-xs text-zinc-400"
            title="쇼츠·릴스·틱톡의 버튼과 설명 글이 덮는 자리를 미리보기에만 표시합니다 (영상에는 안 들어감)"
          >
            <input
              type="checkbox"
              checked={safeZone}
              onChange={(e) => setSafeZone(e.target.checked)}
              className="accent-tide-500"
            />
            숏폼 안전 영역
          </label>
        )}
        <span className="shrink-0 text-xs text-zinc-400">화면 비율</span>
        <div className="flex flex-wrap rounded-md border border-zinc-800 text-xs">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setStyle({ aspectRatio: r })}
              className={`px-2 py-1 ${r === aspectRatio ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <MiniPreview sourceRef={canvasRef} frameRef={frameRef} enabled={miniEnabled} />
    </section>
  );
}

/**
 * Where a short platform's buttons and caption cover a 9:16 video, hatched over
 * the preview only, so the lyrics can be kept out of them.
 */
function ShortsSafeZone() {
  const pct = (v: number) => `${v * 100}%`;
  const band =
    "pointer-events-none absolute bg-red-500/15 outline outline-1 -outline-offset-1 outline-red-400/60";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={band} style={{ left: 0, right: 0, top: 0, height: pct(SHORTS_SAFE.top) }} />
      <div className={band} style={{ left: 0, right: 0, bottom: 0, height: pct(SHORTS_SAFE.bottom) }} />
      <div
        className={band}
        style={{
          right: 0,
          top: pct(SHORTS_SAFE.top),
          bottom: pct(SHORTS_SAFE.bottom),
          width: pct(SHORTS_SAFE.right),
        }}
      />
      <span className="absolute bottom-1 left-1 rounded-sm bg-zinc-950/80 px-1 text-[10px] text-red-200">
        버튼·설명 글 자리
      </span>
    </div>
  );
}

/** CSS width of the preview box for a wanted height: never wider than its column. */
const boxWidth = (height: number, ratio: number) => `min(100%, ${Math.round(height * ratio)}px)`;

/**
 * The bar under the preview: drag it down to make the preview bigger, up to
 * make it smaller. Only the box's CSS width changes while dragging (the canvas
 * keeps its pixel size, so no frame is redrawn and nothing re-renders); the
 * size is saved once the drag ends.
 */
function PreviewSizeHandle({
  boxRef,
  canvasRef,
  height,
  ratio,
  onHeight,
}: {
  boxRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  height: number;
  ratio: number;
  onHeight: (h: number) => void;
}) {
  const dragRef = useRef<{ y: number; h: number; next: number; raf: number } | null>(null);

  // The timeline sizes itself to the room under the preview, so tell it when that room changes
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [height, ratio]);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Starts from the height shown now, which the column width may have capped
    const shown = canvasRef.current?.clientHeight || height;
    dragRef.current = { y: e.clientY, h: shown, next: shown, raf: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    d.next = clampTo(d.h + e.clientY - d.y, PREVIEW_HEIGHT_RANGE);
    if (d.raf) return;
    d.raf = requestAnimationFrame(() => {
      d.raf = 0;
      if (boxRef.current) boxRef.current.style.width = boxWidth(d.next, ratio);
    });
  };
  const up = () => {
    const d = dragRef.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    dragRef.current = null;
    onHeight(d.next);
  };
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = keyResize(
      e.key,
      e.shiftKey,
      height,
      PREVIEW_HEIGHT_RANGE,
      { step: PREVIEW_HEIGHT_STEP, big: PREVIEW_HEIGHT_BIG_STEP },
      ["ArrowDown", "ArrowRight"],
      ["ArrowUp", "ArrowLeft"],
    );
    if (next === null) return;
    e.preventDefault();
    onHeight(next);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="미리보기 크기 조절"
      aria-valuenow={height}
      aria-valuemin={PREVIEW_HEIGHT_RANGE[0]}
      aria-valuemax={PREVIEW_HEIGHT_RANGE[1]}
      aria-valuetext={`높이 ${height}픽셀`}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={() => onHeight(DEFAULT_PREVIEW_HEIGHT)}
      title="끌어서 미리보기 크기 조절 (두 번 클릭하면 기본 크기)"
      className="group flex h-3 w-full max-w-md cursor-ns-resize touch-none items-center justify-center hover:bg-tide-500/10 focus:bg-tide-500/10 focus:outline-none"
    >
      <span className="h-1 w-12 rounded-full bg-zinc-700 group-hover:bg-tide-400 group-focus:bg-tide-400" />
    </div>
  );
}
