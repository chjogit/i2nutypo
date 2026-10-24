import { useEffect, useRef } from "react";
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
import { IllustrationOverlay } from "./illustration-overlay";
import { ElementOverlay } from "./element-overlay";
import { MiniPreview, useMiniPreviewEnabled } from "./mini-preview";
import { Tip } from "@/components/ui/tip";
import { applyOverride, TextBoxOverlay, type LineOverride } from "./text-box-overlay";

/**
 * Canvas preview. Playback time lives in the playback store and the canvas is
 * drawn from a RAF loop, so React does not re-render per frame. With a song
 * loaded, the player in the audio section is the clock; the transport is the
 * subtitle timeline at the bottom.
 */
export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Where the last frame drew its lyrics, and a text box drag not yet saved. */
  const boundsRef = useRef<TextBounds>({ lyrics: null, elements: [] });
  const overrideRef = useRef<LineOverride | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [miniEnabled, setMiniEnabled] = useMiniPreviewEnabled();
  const aspectRatio = useProjectStore((s) => s.style.aspectRatio);
  const setStyle = useProjectStore((s) => s.setStyle);
  const size = CANVAS_SIZE[aspectRatio];
  const quality = useLayoutStore((s) => s.previewQuality);
  const setLayout = useLayoutStore((s) => s.set);
  const px = pixelSize(aspectRatio, quality);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const particles = createParticles();
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const playback = usePlaybackStore.getState();
      const project = useProjectStore.getState();
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
      <div ref={frameRef} data-preview-frame className="flex items-center justify-center">
        <div className="group/preview relative max-w-full">
          <canvas
            ref={canvasRef}
            width={px.width}
            height={px.height}
            data-lw={size.width}
            data-lh={size.height}
            className="block h-auto max-h-[480px] w-auto max-w-full border border-zinc-800"
          />
          <TextBoxOverlay canvasRef={canvasRef} boundsRef={boundsRef} overrideRef={overrideRef} />
          <ElementOverlay canvasRef={canvasRef} boundsRef={boundsRef} />
          {FEATURES_NOW.characters && <IllustrationOverlay canvasRef={canvasRef} />}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          미리보기에서 바로 고치기
          <Tip label="미리보기 조작법">
            가사 박스를 끌어 옮기고, 모서리로 글자 크기, 좌우 막대로 가로 폭(줄바꿈), 위아래 막대로 줄 간격을
            바꿉니다. 두 번 클릭하면 가사와 줄바꿈을 고칩니다. 마우스를 올리면 나오는 ⌖ 점을 끌면 테마
            장식(레코드, 커버, 원 등)을 옮기고, 두 번 클릭하면 원래 자리로 돌아갑니다.
            {FEATURES_NOW.characters &&
              " 일러스트 칸이나 타임라인에서 캐릭터·소품을 고르면 여기서 끌어 옮기고 모서리로 크기, 위쪽 점으로 회전을 바꿉니다."}
          </Tip>
        </span>
        <label
          className="ml-auto flex shrink-0 items-center gap-1 text-xs text-zinc-500"
          title="아래로 스크롤해 미리보기가 안 보이면 화면 구석에 작은 미리보기 창을 띄웁니다"
        >
          <input
            type="checkbox"
            checked={miniEnabled}
            onChange={(e) => setMiniEnabled(e.target.checked)}
            className="accent-indigo-500"
          />
          작은 창
        </label>
        <label
          className="flex shrink-0 items-center gap-1 text-xs text-zinc-500"
          title="미리보기 화질 (내보내기 화질과는 따로 정합니다)"
        >
          화질
          <select
            value={quality}
            onChange={(e) =>
              setLayout({ previewQuality: Number(e.target.value) as (typeof PREVIEW_QUALITIES)[number] })
            }
            aria-label="미리보기 화질"
            className="rounded-md border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            {PREVIEW_QUALITIES.map((q) => (
              <option key={q} value={q}>
                {q}p
              </option>
            ))}
          </select>
        </label>
        <span className="shrink-0 text-xs text-zinc-500">화면 비율</span>
        <div className="flex flex-wrap rounded-md border border-zinc-800 text-xs">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setStyle({ aspectRatio: r })}
              className={`px-2 py-1 ${r === aspectRatio ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
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
