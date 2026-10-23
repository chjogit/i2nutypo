import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { LineStyle, LyricLine } from "@/types/project";
import {
  MAX_BOX_HEIGHT,
  MAX_BOX_WIDTH,
  MAX_LINE_OFFSET,
  MAX_LINE_SIZE,
  MIN_BOX_HEIGHT,
  MIN_BOX_WIDTH,
  MIN_LINE_SIZE,
} from "@/lib/lyrics/line-options";
import { splitManualBreaks } from "@/lib/lyrics/tokenize";
import type { TextBounds } from "@/lib/render/text-bounds";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";

/** A line's position, text size or box shape while it is being dragged, drawn before it is saved. */
export interface LineOverride {
  index: number;
  offsetX: number;
  offsetY: number;
  /** Changed box settings; keys left out keep the line's own. */
  lineStyle: Pick<LineStyle, "size" | "width" | "height">;
}

/** The lines to draw, with a drag in progress applied. */
export function applyOverride(lines: readonly LyricLine[], o: LineOverride | null): readonly LyricLine[] {
  if (!o || !lines[o.index]) return lines;
  return lines.map((l, i) =>
    i === o.index
      ? { ...l, offsetX: o.offsetX, offsetY: o.offsetY, lineStyle: { ...l.lineStyle, ...o.lineStyle } }
      : l,
  );
}

/** Box settings a handle changes, with their range and how a change is shown. */
const BOX_KEYS = {
  size: { min: MIN_LINE_SIZE, max: MAX_LINE_SIZE, label: "글자 크기" },
  width: { min: MIN_BOX_WIDTH, max: MAX_BOX_WIDTH, label: "가로 폭" },
  height: { min: MIN_BOX_HEIGHT, max: MAX_BOX_HEIGHT, label: "줄 간격" },
} as const;
type BoxKey = keyof typeof BOX_KEYS;

type Gesture =
  | { kind: "move"; index: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean }
  | { kind: BoxKey; index: number; cx: number; cy: number; dist: number; start: number };

/** Distance from the box center that a handle's drag measures, per setting. */
function handleDistance(kind: BoxKey, x: number, y: number, cx: number, cy: number): number {
  if (kind === "width") return Math.abs(x - cx);
  if (kind === "height") return Math.abs(y - cy);
  return Math.hypot(x - cx, y - cy);
}

const boxLabel = (kind: BoxKey, v: number) =>
  `${BOX_KEYS[kind].label} ${kind === "size" ? `${v.toFixed(2)}×` : `${Math.round(v * 100)}%`}`;

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

/** Corner for text size, side bars for wrap width, top and bottom bars for row spacing. */
const HANDLES: ReadonlyArray<{ kind: BoxKey; title: string; className: string }> = [
  {
    kind: "size",
    title: "끌기: 글자 크기 · 두 번 클릭: 원래대로",
    className: "-bottom-px -right-px h-3 w-3 cursor-nwse-resize",
  },
  {
    kind: "width",
    title: "끌기: 가로 폭(줄바꿈 위치) · 두 번 클릭: 원래대로",
    className: "-right-1 top-1/2 h-5 w-1.5 -translate-y-1/2 cursor-ew-resize",
  },
  {
    kind: "width",
    title: "끌기: 가로 폭(줄바꿈 위치) · 두 번 클릭: 원래대로",
    className: "-left-1 top-1/2 h-5 w-1.5 -translate-y-1/2 cursor-ew-resize",
  },
  {
    kind: "height",
    title: "끌기: 줄 간격 · 두 번 클릭: 원래대로",
    className: "-bottom-1 left-1/2 h-1.5 w-5 -translate-x-1/2 cursor-ns-resize",
  },
  {
    kind: "height",
    title: "끌기: 줄 간격 · 두 번 클릭: 원래대로",
    className: "-top-1 left-1/2 h-1.5 w-5 -translate-x-1/2 cursor-ns-resize",
  },
];

/**
 * Handles over the preview for the lyric line on screen: drag the box to move
 * the line, drag its corner to resize the text, its side bars to change how
 * wide the text runs before wrapping, its top and bottom bars to change the
 * row spacing, and double-click to edit the text and its line breaks. The box follows what the last frame drew, from a RAF
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
  const badgeRef = useRef<HTMLSpanElement>(null);
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

  const onHandleDown = (kind: BoxKey) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    const line = lineAt(indexRef.current);
    const el = boxRef.current;
    if (e.button !== 0 || !line || !el) return;
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    gestureRef.current = {
      kind,
      index: indexRef.current,
      cx,
      cy,
      dist: Math.max(8, handleDistance(kind, e.clientX, e.clientY, cx, cy)),
      start: line.lineStyle[kind] ?? 1,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const showBadge = (text: string | null) => {
    const b = badgeRef.current;
    if (!b) return;
    b.textContent = text ?? "";
    b.style.display = text ? "block" : "none";
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
        lineStyle: {},
      };
    } else {
      const { min, max } = BOX_KEYS[g.kind];
      const dist = handleDistance(g.kind, e.clientX, e.clientY, g.cx, g.cy);
      const v = clamp(g.start * (dist / g.dist), min, max);
      overrideRef.current = {
        index: g.index,
        offsetX: line.offsetX,
        offsetY: line.offsetY,
        lineStyle: { [g.kind]: v },
      };
      showBadge(boxLabel(g.kind, v));
    }
  };

  const onUp = () => {
    const g = gestureRef.current;
    const o = overrideRef.current;
    gestureRef.current = null;
    overrideRef.current = null;
    showBadge(null);
    const line = g && lineAt(g.index);
    if (!g || !o || !line) return;
    if (g.kind === "move") {
      updateLine(g.index, { offsetX: round2(o.offsetX), offsetY: round2(o.offsetY) });
    } else {
      const v = o.lineStyle[g.kind];
      if (v !== undefined) updateLine(g.index, { lineStyle: { ...line.lineStyle, [g.kind]: round2(v) } });
    }
  };

  /** Back to the whole video's setting for one box key. */
  const resetKey = (kind: BoxKey) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    const line = lineAt(indexRef.current);
    if (!line || line.lineStyle[kind] === undefined) return;
    const next: LineStyle = { ...line.lineStyle };
    delete next[kind];
    updateLine(indexRef.current, { lineStyle: next });
  };

  const nudge = (index: number, dx: number, dy: number, box?: [BoxKey, number]) => {
    if (editOnly) return;
    const line = lineAt(index);
    if (!line) return;
    if (box) {
      const [kind, d] = box;
      const v = round2(clamp((line.lineStyle[kind] ?? 1) + d, BOX_KEYS[kind].min, BOX_KEYS[kind].max));
      updateLine(index, { lineStyle: { ...line.lineStyle, [kind]: v } });
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
            : "가사 텍스트 박스. 끌어서 옮기고, 모서리로 글자 크기, 좌우 막대로 가로 폭, 위아래 막대로 줄 간격을 바꾸고, 두 번 클릭해 고칩니다. 화살표로 옮기고 +, - 로 글자 크기, [ ] 로 가로 폭, { } 로 줄 간격 조절"
        }
        title={
          editOnly
            ? "두 번 클릭: 가사와 줄바꿈 고치기"
            : "끌어서 옮기기 · 모서리: 글자 크기 · 좌우 막대: 가로 폭(줄바꿈) · 위아래 막대: 줄 간격 · 막대를 두 번 클릭: 원래대로 · 박스를 두 번 클릭: 가사와 줄바꿈 고치기"
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
          const keys: Record<string, [number, number, [BoxKey, number]?]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
            "+": [0, 0, ["size", 0.05]],
            "=": [0, 0, ["size", 0.05]],
            "-": [0, 0, ["size", -0.05]],
            "[": [0, 0, ["width", -0.05]],
            "]": [0, 0, ["width", 0.05]],
            "{": [0, 0, ["height", -0.05]],
            "}": [0, 0, ["height", 0.05]],
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
        {!editOnly &&
          HANDLES.map((h) => (
            <span
              key={h.className}
              aria-hidden
              title={h.title}
              onPointerDown={onHandleDown(h.kind)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onDoubleClick={resetKey(h.kind)}
              className={`absolute rounded-sm border border-indigo-300 bg-indigo-500 opacity-60 group-hover:opacity-100 ${h.className}`}
            />
          ))}
        <span
          ref={badgeRef}
          style={{ display: "none" }}
          className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
        />
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
