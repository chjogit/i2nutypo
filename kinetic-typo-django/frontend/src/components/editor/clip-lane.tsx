import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { snapToBeat } from "@/lib/beats/detect";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { MIN_CLIP, snapToLines, type Span } from "@/lib/props/clips";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";

type DragKind = "move" | "start" | "end";

interface Drag {
  clipId: string;
  kind: DragKind;
  /** Ctrl, ⌘ or Shift was held: a click adds the clip to the picked group. */
  additive: boolean;
  /** The clip is part of a picked group, so moving it moves the whole group. */
  group: boolean;
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
  /** Drag data type this lane takes from the effects library, and what to do with a drop at `at`. */
  dropType?: string;
  onDropData?: (at: number, data: string) => void;
  /** Clips picked together with the main pick, drawn as picked too. */
  groupIds?: ReadonlySet<string>;
  /** Ctrl/Shift click: adds the clip to the group or takes it out. Without it, lanes have no groups. */
  onTogglePick?: (id: string) => void;
  /** A picked group being dragged: how far it is moved now, and the move when it is dropped. */
  groupShift?: number;
  onGroupShift?: (dt: number) => void;
  onGroupMove?: (dt: number) => void;
  /** Right click on a clip, or on the empty lane at `at`. */
  onClipMenu?: (e: ReactMouseEvent, clip: T) => void;
  onLaneMenu?: (e: ReactMouseEvent, at: number) => void;
  /** Lane height in pixels (CLIP_LANE_HEIGHT when missing). */
  height?: number;
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

  const [dropAt, setDropAt] = useState<number | null>(null);

  const snap = (t: number) => {
    const { style, lines, beats } = useProjectStore.getState();
    const reach = SNAP_PX / p.pps;
    const onLine = style.snapToLyrics ? snapToLines(t, lines, reach) : t;
    if (onLine !== t || !style.snapToBeats || !beats) return onLine;
    return snapToBeat(t, beats.times, reach);
  };

  const accepts = (e: DragEvent) => p.dropType !== undefined && e.dataTransfer.types.includes(p.dropType);

  const onClipDown = (e: ReactPointerEvent<HTMLElement>, clip: T, kind: DragKind) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const additive = (e.ctrlKey || e.metaKey || e.shiftKey) && p.onTogglePick !== undefined;
    dragRef.current = {
      clipId: clip.id,
      kind,
      additive,
      group: kind === "move" && (p.groupIds?.size ?? 0) > 1 && (p.groupIds?.has(clip.id) ?? false),
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
    if (d.group) {
      p.onGroupShift?.(round2(dt));
      return;
    }
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
    if (d.group && d.moved) {
      p.onGroupMove?.(p.groupShift ?? 0);
      p.onGroupShift?.(0);
      return;
    }
    if (!d.moved && d.additive) {
      p.onTogglePick?.(d.clipId);
      return;
    }
    if (!(d.group && !d.moved)) p.onSelect(d.clipId);
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
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget || !p.onLaneMenu) return;
        p.onLaneMenu(e, snap(p.timeAt(e.clientX)));
      }}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropAt(snap(p.timeAt(e.clientX)));
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(e) => {
        if (!accepts(e) || !p.dropType) return;
        e.preventDefault();
        setDropAt(null);
        p.onDropData?.(snap(p.timeAt(e.clientX)), e.dataTransfer.getData(p.dropType));
      }}
      title={
        p.onTogglePick
          ? "빈 곳 두 번 클릭: 구간 추가 · 우클릭: 메뉴 · Ctrl/Shift 클릭: 여러 개 고르기 · Delete: 지우기"
          : "빈 곳 두 번 클릭: 구간 추가 · 우클릭: 메뉴 · 구간 고르고 Delete: 지우기"
      }
      className={`relative border-b border-zinc-900 ${dropAt !== null ? "bg-indigo-500/10" : ""}`}
      style={{ height: p.height ?? CLIP_LANE_HEIGHT }}
    >
      {dropAt !== null && (
        <span
          className="pointer-events-none absolute inset-y-0 z-[2] w-0.5 bg-indigo-400"
          style={{ left: dropAt * p.pps }}
        />
      )}
      <span
        className={`pointer-events-none sticky left-0 inline-flex h-full max-w-[9rem] items-center gap-1 truncate pl-1 pr-1.5 text-[10px] ${p.tone.label}`}
      >
        {p.label}
      </span>
      {p.clips.map((c) => {
        const inGroup = p.groupIds?.has(c.id) ?? false;
        const shift = inGroup && (p.groupIds?.size ?? 0) > 1 ? (p.groupShift ?? 0) : 0;
        const start = draft?.clipId === c.id ? draft.start : c.start + shift;
        const end = draft?.clipId === c.id ? draft.end : c.end + shift;
        const isSel = p.selectedId === c.id || inGroup;
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
            onContextMenu={(e) => {
              if (!p.onClipMenu) return;
              p.onSelect(c.id);
              p.onClipMenu(e, c);
            }}
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
