import { useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_SIZE } from "@/lib/render/canvas-size";
import { createParticles } from "@/lib/render/particles";
import { resolveIllustrationImages, resolvePropLayers } from "@/lib/render/looks/image-cache";
import { previewPropVideos } from "@/lib/media/prop-video";
import { renderFrame, steppedTime } from "@/lib/render/render-frame";
import { detectSections, SECTION_KINDS, type Section, type SectionKind } from "@/lib/structure/sections";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

/** One tone per kind, so a repeated chorus reads at a glance. */
const TONE: Record<SectionKind, string> = {
  intro: "border-zinc-600 bg-zinc-800/80 text-zinc-200",
  verse: "border-sky-700 bg-sky-950/80 text-sky-100",
  chorus: "border-amber-500 bg-amber-900/70 text-amber-50",
  bridge: "border-violet-600 bg-violet-950/80 text-violet-100",
  outro: "border-zinc-600 bg-zinc-800/80 text-zinc-200",
};

/** The song's structure, found from the lyrics; read it as sections, correct it with a double click. */
export function useSections(): Section[] {
  const lines = useProjectStore((s) => s.lines);
  const overrides = useProjectStore((s) => s.style.sectionKinds);
  return useMemo(
    () =>
      detectSections(
        lines.map((l) => ({
          startTime: l.startTime,
          endTime: l.endTime,
          overlap: l.overlap,
          text: l.cleanText,
        })),
        overrides,
      ),
    [lines, overrides],
  );
}

/** Next kind in the cycle; after the last one the section goes back to what the lyrics say. */
function nextOverride(current: Section): SectionKind | null {
  if (!current.manual) return SECTION_KINDS[0];
  const at = SECTION_KINDS.indexOf(current.kind);
  return at + 1 < SECTION_KINDS.length ? SECTION_KINDS[at + 1] : null;
}

export function SectionLane({ pps }: { pps: number }) {
  const sections = useSections();
  const setStyle = useProjectStore((s) => s.setStyle);
  const seek = usePlaybackStore((s) => s.seek);
  const [board, setBoard] = useState(false);
  if (sections.length === 0) return null;

  const cycle = (sec: Section) => {
    const { sectionKinds } = useProjectStore.getState().style;
    const next = { ...sectionKinds };
    const kind = nextOverride(sec);
    if (kind) next[String(sec.block)] = kind;
    else delete next[String(sec.block)];
    setStyle({ sectionKinds: next });
  };

  return (
    <div className="shrink-0 border-t border-zinc-800/80">
      <div role="group" aria-label="곡 구조" className="relative h-7 border-b border-zinc-900">
        <span className="pointer-events-none sticky left-0 z-[2] inline-flex h-full items-center gap-1 pl-1 pr-1.5 text-[11px] text-zinc-400">
          구조
          <Tip label="곡 구조 설명">
            가사가 쉬는 곳에서 끊고, 같은 가사가 다시 나오는 덩어리를 후렴으로 봅니다. 자동 구성은 같은 종류의
            구간에 같은 움직임을 줍니다. 구간을 두 번 클릭하면 종류가 바뀌고, 한 바퀴 돌면 자동으로
            돌아갑니다.
          </Tip>
        </span>
        {sections.map((sec) => (
          <button
            key={sec.block}
            type="button"
            onClick={() => seek(sec.startTime)}
            onDoubleClick={() => cycle(sec)}
            title={`${sec.label}${sec.manual ? " (직접 지정)" : ""} · ${formatLrcTime(sec.startTime)} ~ ${formatLrcTime(sec.endTime)} · 두 번 클릭: 종류 바꾸기`}
            className={`absolute inset-y-1 overflow-hidden truncate rounded border px-1.5 text-left text-[11px] font-medium ${TONE[sec.kind]} ${sec.manual ? "border-dashed" : ""}`}
            style={{ left: sec.startTime * pps, width: Math.max(8, (sec.endTime - sec.startTime) * pps - 2) }}
          >
            {sec.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-zinc-900 px-2 py-1 text-xs text-zinc-400">
        <button
          type="button"
          aria-expanded={board}
          onClick={() => setBoard((v) => !v)}
          className="rounded px-1.5 py-0.5 text-tide-300 hover:underline"
        >
          {board ? "구간별 장면 접기" : "구간별 장면 보기"}
        </button>
        <span>구간마다 한 장면을 나란히 봅니다. 끝까지 재생하지 않아도 흐름을 확인할 수 있어요.</span>
      </div>
      {board && <Storyboard sections={sections} />}
    </div>
  );
}

const THUMB_W = 224;

/** One still per section, drawn with the same renderer as the preview and the export. */
function Storyboard({ sections }: { sections: readonly Section[] }) {
  const lines = useProjectStore((s) => s.lines);
  const style = useProjectStore((s) => s.style);
  const aspect = useProjectStore((s) => s.style.aspectRatio);
  const seek = usePlaybackStore((s) => s.seek);
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const logical = CANVAS_SIZE[aspect];
  const thumbH = Math.round((THUMB_W * logical.height) / logical.width);
  const times = useMemo(
    () =>
      sections.map((s) => {
        const second = lines[Math.min(s.from + 1, s.to - 1)] ?? lines[s.from];
        return Math.min(s.endTime - 0.05, (second?.startTime ?? s.startTime) + 0.9);
      }),
    [sections, lines],
  );

  useEffect(() => {
    const project = useProjectStore.getState();
    const images = resolveIllustrationImages(project.images);
    sections.forEach((_, k) => {
      const canvas = canvases.current[k];
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const t = times[k];
      ctx.setTransform(canvas.width / logical.width, 0, 0, canvas.width / logical.width, 0, 0);
      ctx.clearRect(0, 0, logical.width, logical.height);
      renderFrame({
        ctx,
        W: logical.width,
        H: logical.height,
        timeSec: steppedTime(t, project.style.frameStep),
        lines: project.lines,
        style: project.style,
        fx: project.fx,
        subtitles: project.subtitles,
        introGateSec: project.sync.introGateSec,
        particles: createParticles(),
        energy: 0,
        animateParticles: false,
        images,
        props: resolvePropLayers(project.props, previewPropVideos(project.props, t, false)),
      });
    });
  }, [sections, times, style, logical.width, logical.height]);

  return (
    <ol aria-label="구간별 장면" className="flex gap-3 overflow-x-auto px-3 py-3">
      {sections.map((sec, k) => (
        <li key={sec.block} className="shrink-0" style={{ width: THUMB_W }}>
          <button type="button" onClick={() => seek(times[k])} className="block w-full text-left">
            <canvas
              ref={(el) => {
                canvases.current[k] = el;
              }}
              width={THUMB_W * 2}
              height={thumbH * 2}
              className="block w-full rounded border border-zinc-800"
              style={{ height: thumbH }}
            />
            <span
              className={`mt-1.5 inline-block rounded border px-1.5 text-xs font-medium ${TONE[sec.kind]}`}
            >
              {sec.label}
            </span>
            <span className="ml-2 text-xs text-zinc-400">{formatLrcTime(sec.startTime)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
