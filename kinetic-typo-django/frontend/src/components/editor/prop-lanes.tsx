import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PropAsset } from "@/types/project";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { MIN_CLIP } from "@/lib/props/clips";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore } from "@/store/prop-ui-store";

type DragKind = "move" | "start" | "end";

interface Drag {
  propId: string;
  clipId: string;
  kind: DragKind;
  pointerX: number;
  origStart: number;
  origEnd: number;
  moved: boolean;
}

/** Pointer travel before a press on a clip counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;
export const PROP_LANE_HEIGHT = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Illustration timeline: one lane per prop on the timeline, under the lyric
 * track and on the same time scale. Drag a clip to move it, its ends to trim
 * it; click empty lane to seek, double-click it to add a clip there.
 */
export function PropLanes({ pps, timeAt }: { pps: number; timeAt: (clientX: number) => number }) {
  const props = useProjectStore((s) => s.props);
  const duration = useProjectStore((s) => s.duration);
  const addPropClip = useProjectStore((s) => s.addPropClip);
  const updatePropClip = useProjectStore((s) => s.updatePropClip);
  const selected = usePropUiStore((s) => s.selected);
  const select = usePropUiStore((s) => s.select);
  const seek = usePlaybackStore((s) => s.seek);
  const dragRef = useRef<Drag | null>(null);
  /** Times shown while dragging; saved to the store on release. */
  const [draft, setDraft] = useState<{ clipId: string; start: number; end: number } | null>(null);

  const lanes = props.filter((p) => p.onTimeline);
  if (lanes.length === 0) return null;

  const onClipDown = (e: ReactPointerEvent<HTMLElement>, p: PropAsset, clipId: string, kind: DragKind) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const clip = p.clips.find((c) => c.id === clipId);
    if (!clip) return;
    dragRef.current = {
      propId: p.id,
      clipId,
      kind,
      pointerX: e.clientX,
      origStart: clip.start,
      origEnd: clip.end,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onClipMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.pointerX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const dt = dx / pps;
    let start = d.origStart;
    let end = d.origEnd;
    if (d.kind === "move") {
      const len = d.origEnd - d.origStart;
      start = Math.min(Math.max(0, d.origStart + dt), duration - len);
      end = start + len;
    } else if (d.kind === "start") {
      start = Math.min(Math.max(0, d.origStart + dt), d.origEnd - MIN_CLIP);
    } else {
      end = Math.max(Math.min(duration, d.origEnd + dt), d.origStart + MIN_CLIP);
    }
    setDraft({ clipId: d.clipId, start: round2(start), end: round2(end) });
  };

  const onClipUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    select({ propId: d.propId, clipId: d.clipId });
    if (!d.moved) {
      seek(d.origStart);
      return;
    }
    // The store keeps it clear of the lane's other clips
    if (draft && draft.clipId === d.clipId) {
      updatePropClip(d.propId, d.clipId, { start: draft.start, end: draft.end });
    }
    setDraft(null);
  };

  return (
    <div>
      {lanes.map((p) => (
        <div
          key={p.id}
          role="group"
          aria-label={`일러스트 타임라인: ${p.fileName}`}
          onPointerDown={(e) => {
            if (e.button === 0 && e.target === e.currentTarget) seek(timeAt(e.clientX));
          }}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const id = addPropClip(p.id, timeAt(e.clientX));
            if (id) select({ propId: p.id, clipId: id });
          }}
          title="빈 곳 두 번 클릭: 구간 추가"
          className="relative border-b border-zinc-900"
          style={{ height: PROP_LANE_HEIGHT }}
        >
          <span className="pointer-events-none sticky left-0 inline-flex h-full max-w-[9rem] items-center gap-1 truncate pl-1 pr-1.5 text-[10px] text-emerald-300/60">
            🖼 {p.fileName}
          </span>
          {p.clips.map((c) => {
            const start = draft?.clipId === c.id ? draft.start : c.start;
            const end = draft?.clipId === c.id ? draft.end : c.end;
            const isSel = selected?.propId === p.id && selected.clipId === c.id;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${p.fileName} 구간 ${formatLrcTime(start)} ~ ${formatLrcTime(end)}`}
                onPointerDown={(e) => onClipDown(e, p, c.id, "move")}
                onPointerMove={onClipMove}
                onPointerUp={onClipUp}
                onPointerCancel={onClipUp}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    select({ propId: p.id, clipId: c.id });
                    seek(c.start);
                  }
                }}
                title={`${formatLrcTime(start)} ~ ${formatLrcTime(end)}${c.front ? " · 가사 앞" : ""}`}
                className={`absolute inset-y-1 flex cursor-grab items-center gap-1 overflow-hidden rounded border px-1.5 active:cursor-grabbing ${
                  isSel
                    ? "z-[1] border-emerald-400 bg-emerald-900"
                    : "z-[1] border-emerald-800/80 bg-emerald-950 hover:border-emerald-400/70"
                }`}
                style={{ left: start * pps, width: Math.max(6, (end - start) * pps) }}
              >
                <img
                  src={p.objectUrl}
                  alt=""
                  className="pointer-events-none h-4 w-4 shrink-0 object-contain"
                />
                <span className="pointer-events-none truncate text-[10px] text-zinc-200">
                  {c.front ? "▲ " : ""}
                  {p.fileName}
                </span>
                <span
                  aria-hidden
                  onPointerDown={(e) => onClipDown(e, p, c.id, "start")}
                  className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-emerald-300/50"
                />
                <span
                  aria-hidden
                  onPointerDown={(e) => onClipDown(e, p, c.id, "end")}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-emerald-300/50"
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
