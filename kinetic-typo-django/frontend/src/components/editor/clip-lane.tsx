import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { MIN_CLIP, snapToLines, type Span } from "@/lib/props/clips";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";

type DragKind = "move" | "start" | "end";

interface Drag {
  clipId: string;
  kind: DragKind;
  pointerX: number;
  origStart: number;
  origEnd: number;
  moved: boolean;
}

/** Pointer travel before a press on a clip counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;
/** How close (in pixels) a dragged edge must come to a lyric edge to snap to it. */
const SNAP_PX = 8;
export const CLIP_LANE_HEIGHT = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ClipLaneProps<T extends Span> {
  label: ReactNode;
  ariaLabel: string;
  clips: readonly T[];
  selectedId: string | null;
  pps: number;
  timeAt: (clientX: number) => number;
  onSelect: (id: string) => void;
  /** New times for a clip; the store keeps it clear of its neighbors. */
  onTimes: (id: string, start: number, end: number) => void;
  /** Double-click on empty lane; returns the new clip's id when one was made. */
  onAdd: (at: number) => string | null;
  content: (clip: T) => ReactNode;
  title: (clip: T) => string;
  /** Tailwind classes for a clip, picked or not. */
  tone: { on: string; off: string; handle: string; label: string };
}

/**
 * One timeline lane of clips (an illustration or the themes), under the lyric
 * track and on the same time scale. Drag a clip to move it, its ends to trim
 * it; with snapping on, edges stick to the lyric lines' starts and ends. Click
 * empty lane to seek, double-click it to add a clip there.
 */
export function ClipLane<T extends Span>(p: ClipLaneProps<T>) {
  const duration = useProjectStore((s) => s.duration);
  const seek = usePlaybackStore((s) => s.seek);
  const dragRef = useRef<Drag | null>(null);
  /** Times shown while dragging; saved to the store on release. */
  const [draft, setDraft] = useState<{ clipId: string; start: number; end: number } | null>(null);

  const snap = (t: number) => {
    const { style, lines } = useProjectStore.getState();
    return style.snapToLyrics ? snapToLines(t, lines, SNAP_PX / p.pps) : t;
  };

  const onClipDown = (e: ReactPointerEvent<HTMLElement>, clip: T, kind: DragKind) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = {
      clipId: clip.id,
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
    const dt = dx / p.pps;
    let start = d.origStart;
    let end = d.origEnd;
    if (d.kind === "move") {
      const len = d.origEnd - d.origStart;
      start = Math.min(Math.max(0, d.origStart + dt), duration - len);
      // Whichever edge lands near a lyric edge pulls the clip onto it
      const s = snap(start);
      const e2 = snap(start + len);
      start = s !== start ? s : e2 !== start + len ? e2 - len : start;
      start = Math.min(Math.max(0, start), duration - len);
      end = start + len;
    } else if (d.kind === "start") {
      start = Math.min(Math.max(0, snap(d.origStart + dt)), d.origEnd - MIN_CLIP);
    } else {
      end = Math.max(Math.min(duration, snap(d.origEnd + dt)), d.origStart + MIN_CLIP);
    }
    setDraft({ clipId: d.clipId, start: round2(start), end: round2(end) });
  };

  const onClipUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    p.onSelect(d.clipId);
    if (!d.moved) {
      seek(d.origStart);
      return;
    }
    if (draft && draft.clipId === d.clipId) p.onTimes(d.clipId, draft.start, draft.end);
    setDraft(null);
  };

  return (
    <div
      role="group"
      aria-label={p.ariaLabel}
      onPointerDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) seek(p.timeAt(e.clientX));
      }}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const id = p.onAdd(snap(p.timeAt(e.clientX)));
        if (id) p.onSelect(id);
      }}
      title="빈 곳 두 번 클릭: 구간 추가 · 구간 고르고 Delete: 지우기"
      className="relative border-b border-zinc-900"
      style={{ height: CLIP_LANE_HEIGHT }}
    >
      <span
        className={`pointer-events-none sticky left-0 inline-flex h-full max-w-[9rem] items-center gap-1 truncate pl-1 pr-1.5 text-[10px] ${p.tone.label}`}
      >
        {p.label}
      </span>
      {p.clips.map((c) => {
        const start = draft?.clipId === c.id ? draft.start : c.start;
        const end = draft?.clipId === c.id ? draft.end : c.end;
        const isSel = p.selectedId === c.id;
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            aria-label={`${p.title(c)} ${formatLrcTime(start)} ~ ${formatLrcTime(end)}`}
            onPointerDown={(e) => onClipDown(e, c, "move")}
            onPointerMove={onClipMove}
            onPointerUp={onClipUp}
            onPointerCancel={onClipUp}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                p.onSelect(c.id);
                seek(c.start);
              }
            }}
            title={`${p.title(c)} · ${formatLrcTime(start)} ~ ${formatLrcTime(end)}`}
            className={`absolute inset-y-1 z-[1] flex cursor-grab items-center gap-1 overflow-hidden rounded border px-1.5 active:cursor-grabbing ${
              isSel ? p.tone.on : p.tone.off
            }`}
            style={{ left: start * p.pps, width: Math.max(6, (end - start) * p.pps) }}
          >
            {p.content(c)}
            <span
              aria-hidden
              onPointerDown={(e) => onClipDown(e, c, "start")}
              className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize ${p.tone.handle}`}
            />
            <span
              aria-hidden
              onPointerDown={(e) => onClipDown(e, c, "end")}
              className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize ${p.tone.handle}`}
            />
          </div>
        );
      })}
    </div>
  );
}
