
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { LyricLine } from "@/types/project";
import { MAX_LINE_OFFSET, MAX_LINE_SIZE, MIN_LINE_SIZE } from "@/lib/lyrics/line-options";
import { splitManualBreaks } from "@/lib/lyrics/tokenize";
import type { TextBounds } from "@/lib/render/text-bounds";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";

/** A line's position and size while it is being dragged, drawn before it is saved. */
export interface LineOverride {
  index: number;
  offsetX: number;
  offsetY: number;
  size: number | undefined;
}

/** The lines to draw, with a drag in progress applied. */
export function applyOverride(lines: readonly LyricLine[], o: LineOverride | null): readonly LyricLine[] {
  if (!o || !lines[o.index]) return lines;
  return lines.map((l, i) =>
    i === o.index
      ? {
          ...l,
          offsetX: o.offsetX,
          offsetY: o.offsetY,
          lineStyle: o.size === undefined ? l.lineStyle : { ...l.lineStyle, size: o.size },
        }
      : l,
  );
}

type Gesture =
  | { kind: "move"; index: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean }
  | { kind: "size"; index: number; cx: number; cy: number; dist: number; size: number };

/** Space around the drawn text, in screen px. */
const PAD = 6;
const NUDGE = 0.01;
const DRAG_THRESHOLD_PX = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (n: number) => Math.round(n * 100) / 100;

function activeIndex(lines: readonly LyricLine[], t: number, introGateSec: number): number {
  if (t < introGateSec) return -1;
  return lines.findIndex((l) => t >= l.startTime && t < l.endTime);
}

/**
 * Handles over the preview for the lyric line on screen: drag the box to move
 * the line, drag its corner to resize the text, double-click to edit the text
 * and its line breaks. The box follows what the last frame drew, from a RAF
 * loop, so it costs no re-render while playing.
 */
export function TextBoxOverlay({
  canvasRef,
  boundsRef,
  overrideRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  boundsRef: RefObject<TextBounds>;
  overrideRef: RefObject<LineOverride | null>;
}) {
  const updateLine = useProjectStore((s) => s.updateLine);
  const boxRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(-1);
  const gestureRef = useRef<Gesture | null>(null);
  // With only bottom subtitles shown, the box is the subtitle box: its text can be edited, but moving and sizing do not apply
  const editOnly = useProjectStore((s) => s.subtitles.enabled && s.subtitles.display === "bottomOnly");
  const [editing, setEditing] = useState<{
    index: number;
    text: string;
    left: number;
    top: number;
    width: number;
  } | null>(null);

  // Follow the drawn text
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = boxRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas) return;
      const project = useProjectStore.getState();
      const t = usePlaybackStore.getState().currentTime;
      const dragging = gestureRef.current !== null;
      const index = dragging ? indexRef.current : activeIndex(project.lines, t, project.sync.introGateSec);
      const box = boundsRef.current.lyrics;
      if (index < 0 || !box) {
        el.style.display = "none";
        if (!dragging) indexRef.current = -1;
        return;
      }
      indexRef.current = index;
      const sx = canvas.clientWidth / canvas.width;
      const sy = canvas.clientHeight / canvas.height;
      const left = clamp(box.x0 * sx - PAD, 0, canvas.clientWidth);
      const top = clamp(box.y0 * sy - PAD, 0, canvas.clientHeight);
      const right = clamp(box.x1 * sx + PAD, 0, canvas.clientWidth);
      const bottom = clamp(box.y1 * sy + PAD, 0, canvas.clientHeight);
      el.style.display = "block";
      el.style.transform = `translate(${left}px, ${top}px)`;
      el.style.width = `${Math.max(12, right - left)}px`;
      el.style.height = `${Math.max(12, bottom - top)}px`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, boundsRef]);

  const lineAt = (index: number) => useProjectStore.getState().lines[index];

  const onBoxDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (editOnly) return;
    const line = lineAt(indexRef.current);
    if (e.button !== 0 || !line) return;
    gestureRef.current = {
      kind: "move",
      index: indexRef.current,
      x: e.clientX,
      y: e.clientY,
      offsetX: line.offsetX,
      offsetY: line.offsetY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const line = lineAt(indexRef.current);
    const el = boxRef.current;
    if (e.button !== 0 || !line || !el) return;
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    gestureRef.current = {
      kind: "size",
      index: indexRef.current,
      cx,
      cy,
      dist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
      size: line.lineStyle.size ?? 1,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    const canvas = canvasRef.current;
    const line = g && lineAt(g.index);
    if (!g || !canvas || !line) return;
    if (g.kind === "move") {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      g.moved = true;
      overrideRef.current = {
        index: g.index,
        offsetX: clamp(g.offsetX + dx / canvas.clientWidth, -MAX_LINE_OFFSET, MAX_LINE_OFFSET),
        offsetY: clamp(g.offsetY + dy / canvas.clientHeight, -MAX_LINE_OFFSET, MAX_LINE_OFFSET),
        size: line.lineStyle.size,
      };
    } else {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      overrideRef.current = {
        index: g.index,
        offsetX: line.offsetX,
        offsetY: line.offsetY,
        size: clamp(g.size * (dist / g.dist), MIN_LINE_SIZE, MAX_LINE_SIZE),
      };
    }
  };

  const onUp = () => {
    const g = gestureRef.current;
    const o = overrideRef.current;
    gestureRef.current = null;
    overrideRef.current = null;
    const line = g && lineAt(g.index);
    if (!g || !o || !line) return;
    if (g.kind === "move") {
      updateLine(g.index, { offsetX: round2(o.offsetX), offsetY: round2(o.offsetY) });
    } else if (o.size !== undefined) {
      updateLine(g.index, { lineStyle: { ...line.lineStyle, size: round2(o.size) } });
    }
  };

  const nudge = (index: number, dx: number, dy: number, dSize: number) => {
    if (editOnly) return;
    const line = lineAt(index);
    if (!line) return;
    if (dSize !== 0) {
      const size = round2(clamp((line.lineStyle.size ?? 1) + dSize, MIN_LINE_SIZE, MAX_LINE_SIZE));
      updateLine(index, { lineStyle: { ...line.lineStyle, size } });
    } else {
      updateLine(index, {
        offsetX: round2(clamp(line.offsetX + dx, -MAX_LINE_OFFSET, MAX_LINE_OFFSET)),
        offsetY: round2(clamp(line.offsetY + dy, -MAX_LINE_OFFSET, MAX_LINE_OFFSET)),
      });
    }
  };

  const startEdit = () => {
    const line = lineAt(indexRef.current);
    const el = boxRef.current;
    const canvas = canvasRef.current;
    if (!line || !el || !canvas) return;
    usePlaybackStore.getState().pause();
    const r = el.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const width = Math.min(c.width, Math.max(240, r.width));
    setEditing({
      index: indexRef.current,
      text: splitManualBreaks(line.rawText).join("\n"),
      left: clamp(r.left - c.left + r.width / 2 - width / 2, 0, c.width - width),
      top: clamp(r.top - c.top, 0, Math.max(0, c.height - 120)),
      width,
    });
  };

  const saveEdit = (text: string) => {
    if (!editing) return;
    const raw = splitManualBreaks(text).join("/n");
    if (raw) updateLine(editing.index, { rawText: raw });
    setEditing(null);
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={boxRef}
        role="button"
        tabIndex={0}
        aria-label={
          editOnly
            ? "가사 텍스트 박스. 두 번 클릭하거나 Enter로 가사를 고칩니다"
            : "가사 텍스트 박스. 끌어서 옮기고, 모서리를 끌어 크기를 바꾸고, 두 번 클릭해 고칩니다. 화살표로 옮기고 +, - 로 크기 조절"
        }
        title={
          editOnly
            ? "두 번 클릭: 가사와 줄바꿈 고치기"
            : "끌어서 옮기기 · 모서리 끌기: 크기 · 두 번 클릭: 가사와 줄바꿈 고치기"
        }
        onPointerDown={onBoxDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={startEdit}
        onKeyDown={(e) => {
          const i = indexRef.current;
          if (i < 0) return;
          const step = e.shiftKey ? NUDGE * 5 : NUDGE;
          const keys: Record<string, [number, number, number]> = {
            ArrowLeft: [-step, 0, 0],
            ArrowRight: [step, 0, 0],
            ArrowUp: [0, -step, 0],
            ArrowDown: [0, step, 0],
            "+": [0, 0, 0.05],
            "=": [0, 0, 0.05],
            "-": [0, 0, -0.05],
          };
          if (e.key === "Enter") {
            e.preventDefault();
            startEdit();
          } else if (keys[e.key]) {
            e.preventDefault();
            nudge(i, ...keys[e.key]);
          }
        }}
        style={{ display: "none" }}
        className={`group pointer-events-auto absolute left-0 top-0 touch-none ${editOnly ? "cursor-text" : "cursor-move"} rounded-sm border border-dashed border-white/30 hover:border-indigo-400 hover:bg-indigo-400/5 focus:border-indigo-400 focus:outline-none`}
      >
        {!editOnly && (
          <span
            aria-hidden
            onPointerDown={onHandleDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="absolute -bottom-px -right-px h-3 w-3 cursor-nwse-resize rounded-sm border border-indigo-300 bg-indigo-500 opacity-60 group-hover:opacity-100"
          />
        )}
      </div>
      {editing && (
        <div
          className="pointer-events-auto absolute space-y-1"
          style={{ left: editing.left, top: editing.top, width: editing.width }}
        >
          <textarea
            autoFocus
            defaultValue={editing.text}
            aria-label="가사 고치기 (Enter: 줄바꿈)"
            rows={Math.max(2, editing.text.split("\n").length + 1)}
            onBlur={(e) => saveEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(null);
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
            }}
            className="w-full resize-none rounded-md border border-indigo-500 bg-zinc-950/95 p-2 text-sm text-zinc-100 focus:outline-none"
          />
          <p className="rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] text-zinc-400">
            Enter: 줄바꿈 · Ctrl+Enter 또는 바깥 클릭: 저장 · Esc: 취소
          </p>
        </div>
      )}
    </div>
  );
}
