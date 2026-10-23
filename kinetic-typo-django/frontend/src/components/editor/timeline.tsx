import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
import { formatLrcTime, MIN_LINE_DURATION } from "@/lib/lyrics/parse";
import { CELLS, GRID } from "@/lib/render/looks/layout";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { PROP_LANE_HEIGHT, PropLanes } from "./prop-lanes";

type DragKind = "move" | "start" | "end";

interface Drag {
  kind: DragKind;
  index: number;
  pointerX: number;
  origStart: number;
  origEnd: number;
  /** Free space around the line: the previous line's end and the next line's start. */
  minStart: number;
  maxEnd: number;
  moved: boolean;
}

interface Draft {
  index: number;
  start: number;
  end: number;
}

const MIN_PPS = 8;
const MAX_PPS = 200;
const NUDGE_SEC = 0.05;
/** Pointer travel before a press on a segment counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;

const MIN_TIMELINE_HEIGHT = 120;
/** Used until the page has laid out. */
const DEFAULT_MAX_HEIGHT = 600;
/** Heights before the user drags the edge: track only, and track with the selected line's editor. */
const DEFAULT_HEIGHT = 170;
const DEFAULT_EDIT_HEIGHT = 400;
/** The selected line's editor grows with the section, up to this zoom and this width before zooming. */
const MAX_EDITOR_SCALE = 1.8;
const EDITOR_MAX_WIDTH = 1120;
const MIN_FONT_SCALE = 0.5;
const MAX_FONT_SCALE = 2;

/** Thin scrollbar on a clear track, so it sits inside the timeline instead of a bright bar under it. */
const QUIET_SCROLLBAR =
  "[scrollbar-color:rgb(82_82_91/0.5)_transparent] [scrollbar-width:thin] hover:[scrollbar-color:rgb(129_140_248/0.6)_transparent]";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Room between the bottom of the preview frame and the bottom of the window. */
function maxHeightBelowPreview(): number {
  const frame = document.querySelector("[data-preview-frame]");
  const bottom = frame ? frame.getBoundingClientRect().bottom : 0;
  return Math.max(MIN_TIMELINE_HEIGHT, window.innerHeight - Math.max(0, bottom));
}

/**
 * Zooms the editor to fill its panel's height (never past MAX_EDITOR_SCALE,
 * never so far that it no longer fits), laying it out at the width it will
 * have once zoomed. Writes styles directly, so it costs no re-render.
 */
function fitEditor(panel: HTMLElement, sizer: HTMLElement, inner: HTMLElement): void {
  const W = panel.clientWidth;
  const H = panel.clientHeight;
  if (W === 0 || H === 0) return;
  const heightAt = (s: number) => {
    inner.style.width = `${Math.min(W / s, EDITOR_MAX_WIDTH)}px`;
    return inner.offsetHeight;
  };
  let s = 1;
  for (let i = 0; i < 6; i++) {
    const next = clamp(H / heightAt(s), 1, MAX_EDITOR_SCALE);
    if (Math.abs(next - s) < 0.01) break;
    s = next;
  }
  let h = heightAt(s);
  while (s > 1 && h * s > H) {
    s = Math.max(1, s - 0.05);
    h = heightAt(s);
  }
  inner.style.transform = `scale(${s})`;
  sizer.style.width = `${inner.offsetWidth * s}px`;
  sizer.style.height = `${h * s}px`;
}

function useFitEditor(
  panelRef: RefObject<HTMLDivElement | null>,
  sizerRef: RefObject<HTMLDivElement | null>,
  innerRef: RefObject<HTMLDivElement | null>,
  line: LyricLine | null,
): void {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const sizer = sizerRef.current;
    const inner = innerRef.current;
    if (!panel || !sizer || !inner) return;
    const fit = () => fitEditor(panel, sizer, inner);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [panelRef, sizerRef, innerRef, line]);
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

/** Fields where Space types a character; everywhere else it is the play key. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function tickStep(pps: number): number {
  if (pps >= 80) return 1;
  if (pps >= 40) return 2;
  if (pps >= 16) return 5;
  return 10;
}

/** Space around line i that it may grow into or move within, between its neighbours on the same lane. */
function lineBounds(lines: readonly LyricLine[], i: number, duration: number) {
  const lane = lines[i].overlap;
  let minStart = 0;
  let maxEnd = duration;
  for (let j = i - 1; j >= 0; j--) {
    if (lines[j].overlap === lane) {
      minStart = lines[j].endTime;
      break;
    }
  }
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].overlap === lane) {
      maxEnd = lines[j].startTime;
      break;
    }
  }
  return { minStart, maxEnd };
}

/** Text or number field that commits on blur or Enter, so a half-typed value never reaches the lyrics. */
function CommitInput({
  value,
  onCommit,
  label,
  className,
  type = "text",
  inputRef,
  title,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  className?: string;
  type?: "text" | "number";
  inputRef?: RefObject<HTMLInputElement | null>;
  title?: string;
}) {
  return (
    <input
      key={value}
      ref={inputRef}
      title={title}
      type={type}
      step={type === "number" ? 0.01 : undefined}
      defaultValue={value}
      aria-label={label}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      className={`rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100 focus:border-indigo-500 focus:outline-none ${className ?? ""}`}
    />
  );
}

/**
 * Subtitle timeline under the preview: a ruler, one block per lyric line and
 * the playhead. Click empty track to seek, drag a block to move it, drag its
 * edges to change its start or end, and click a block to edit its text and
 * exact times below. The playhead and clock are moved from a RAF loop, so
 * playback does not re-render this component.
 */
export function Timeline() {
  const lines = useProjectStore((s) => s.lines);
  const duration = useProjectStore((s) => s.duration);
  const updateLine = useProjectStore((s) => s.updateLine);
  const removeLine = useProjectStore((s) => s.removeLine);
  const fontScale = useProjectStore((s) => s.style.fontScale);
  const charCues = useProjectStore((s) => s.style.illustration.charCues);
  const propLanes = useProjectStore((s) => s.props.filter((p) => p.onTimeline).length);
  const setStyle = useProjectStore((s) => s.setStyle);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);
  const seek = usePlaybackStore((s) => s.seek);

  const [pps, setPps] = useState(40);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const ppsRef = useRef(pps);
  const dragRef = useRef<Drag | null>(null);
  /** Same as draft, readable when the drag ends. */
  const draftRef = useRef<Draft | null>(null);
  const scrubbingRef = useRef(false);
  /** "Play this line" stops here. */
  const stopAtRef = useRef<number | null>(null);

  ppsRef.current = pps;

  // User-set height (null = fits its content), never taller than the space below the preview
  const sectionRef = useRef<HTMLElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [maxHeight, setMaxHeight] = useState(DEFAULT_MAX_HEIGHT);
  const resizeRef = useRef<{ pointerY: number; startHeight: number } | null>(null);

  const clampHeight = (h: number) => Math.round(clamp(h, MIN_TIMELINE_HEIGHT, maxHeightBelowPreview()));

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = maxHeightBelowPreview();
        setMaxHeight(max);
        setHeight((h) => (h === null ? null : Math.min(h, max)));
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    resizeRef.current = { pointerY: e.clientY, startHeight: sectionRef.current?.offsetHeight ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (r) setHeight(clampHeight(r.startHeight + (r.pointerY - e.clientY)));
  };
  const onResizeUp = () => {
    resizeRef.current = null;
  };
  const sel = selected !== null && selected < lines.length ? selected : null;
  const shownHeight = Math.min(
    maxHeight,
    height ?? (sel !== null ? DEFAULT_EDIT_HEIGHT : DEFAULT_HEIGHT) + propLanes * PROP_LANE_HEIGHT,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const lyricInputRef = useRef<HTMLInputElement>(null);

  // Fit the whole song in view whenever its length changes
  useEffect(() => {
    const width = scrollRef.current?.clientWidth ?? 0;
    if (width > 0 && duration > 0) setPps(clamp((width - 24) / duration, MIN_PPS, MAX_PPS));
  }, [duration]);

  // Playhead, clock and follow-scroll
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const playback = usePlaybackStore.getState();
      const t = playback.currentTime;
      const x = t * ppsRef.current;
      if (headRef.current) headRef.current.style.transform = `translateX(${x}px)`;
      if (clockRef.current) {
        clockRef.current.textContent = `${formatLrcTime(t)} / ${formatLrcTime(useProjectStore.getState().duration)}`;
      }
      if (stopAtRef.current !== null && playback.isPlaying && t >= stopAtRef.current) {
        stopAtRef.current = null;
        playback.pause();
      }
      const sc = scrollRef.current;
      if (sc && playback.isPlaying && !dragRef.current && !scrubbingRef.current) {
        if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 48) sc.scrollLeft = Math.max(0, x - 48);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const togglePlay = () => {
    stopAtRef.current = null;
    if (usePlaybackStore.getState().isPlaying) pause();
    else void play();
  };

  // Outside a text field Space only plays and pauses: it never presses a
  // focused button, ticks a checkbox or scrolls the page
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTextEntry(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) togglePlay();
    };
    // Buttons and checkboxes act on key up, so that is swallowed too
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTextEntry(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
    // togglePlay only reads stores through getState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect ? clamp((clientX - rect.left) / ppsRef.current, 0, duration) : 0;
  };

  // Empty track: seek, and keep seeking while the pointer is held
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    scrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    stopAtRef.current = null;
    seek(timeAt(e.clientX));
  };
  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current) seek(timeAt(e.clientX));
  };
  const onTrackUp = () => {
    scrubbingRef.current = false;
  };

  const onSegmentDown = (e: ReactPointerEvent<HTMLElement>, index: number, kind: DragKind) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const line = lines[index];
    const { minStart, maxEnd } = lineBounds(lines, index, duration);
    dragRef.current = {
      kind,
      index,
      pointerX: e.clientX,
      origStart: line.startTime,
      origEnd: line.endTime,
      minStart,
      maxEnd,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSegmentMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.pointerX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const dt = dx / ppsRef.current;
    let start = d.origStart;
    let end = d.origEnd;
    if (d.kind === "move") {
      const len = d.origEnd - d.origStart;
      start = clamp(d.origStart + dt, d.minStart, d.maxEnd - len);
      end = start + len;
    } else if (d.kind === "start") {
      start = clamp(d.origStart + dt, d.minStart, d.origEnd - MIN_LINE_DURATION);
    } else {
      end = clamp(d.origEnd + dt, d.origStart + MIN_LINE_DURATION, d.maxEnd);
    }
    draftRef.current = { index: d.index, start: round2(start), end: round2(end) };
    setDraft(draftRef.current);
  };

  const onSegmentUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    setSelected(d.index);
    if (!d.moved) {
      stopAtRef.current = null;
      seek(d.origStart);
      return;
    }
    const cur = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (cur && (cur.start !== d.origStart || cur.end !== d.origEnd)) {
      updateLine(d.index, { startTime: cur.start, endTime: cur.end });
    }
  };

  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);
  const width = Math.ceil(duration * pps) + 24;

  const selLine = sel !== null ? lines[sel] : null;
  const selBounds = sel !== null ? lineBounds(lines, sel, duration) : null;
  // Overlapping ("&") lines get a second lane under the main one
  const twoLanes = lines.some((l) => l.overlap);

  const setStart = (v: number) => {
    if (sel === null || !selLine || !selBounds || !Number.isFinite(v)) return;
    updateLine(sel, { startTime: round2(clamp(v, selBounds.minStart, selLine.endTime - MIN_LINE_DURATION)) });
  };
  const setEnd = (v: number) => {
    if (sel === null || !selLine || !selBounds || !Number.isFinite(v)) return;
    updateLine(sel, { endTime: round2(clamp(v, selLine.startTime + MIN_LINE_DURATION, selBounds.maxEnd)) });
  };
  const now = () => usePlaybackStore.getState().currentTime;
  useFitEditor(panelRef, sizerRef, editorRef, selLine);

  // Puts a manual line break where the cursor is in the lyric field; Enter or leaving the field saves it
  const insertBreak = () => {
    const input = lyricInputRef.current;
    if (!input) return;
    const at = input.selectionStart ?? input.value.length;
    input.setRangeText("/n", at, input.selectionEnd ?? at, "end");
    input.focus();
  };

  return (
    <section
      ref={sectionRef}
      aria-label="자막 타임라인"
      className="sticky bottom-0 z-10 flex flex-col border-t border-zinc-800 bg-zinc-950/95 backdrop-blur"
      style={{ height: shownHeight, maxHeight }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="타임라인 높이 조절"
        aria-valuenow={Math.round(shownHeight)}
        aria-valuemax={Math.round(maxHeight)}
        tabIndex={0}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = sectionRef.current?.offsetHeight ?? shownHeight;
            setHeight(clampHeight(cur + (e.key === "ArrowUp" ? 24 : -24)));
          }
        }}
        title="끌어서 타임라인 높이 조절 (두 번 클릭하면 원래 높이)"
        onDoubleClick={() => setHeight(null)}
        className="group flex h-2.5 shrink-0 cursor-ns-resize touch-none items-center justify-center hover:bg-indigo-500/10 focus:bg-indigo-500/10 focus:outline-none"
      >
        <span className="h-1 w-12 rounded-full bg-zinc-700 group-hover:bg-indigo-400 group-focus:bg-indigo-400" />
      </div>
      <div className="flex shrink-0 items-center gap-3 px-4 pt-1 text-xs">
        <button
          type="button"
          onClick={togglePlay}
          className="w-16 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {isPlaying ? "정지" : "재생"}
        </button>
        <span ref={clockRef} className="w-40 whitespace-nowrap font-mono text-zinc-300" />
        <span className="hidden text-zinc-500 sm:inline">
          빈 곳 클릭: 이동 · 구간 끌기: 옮기기 · 양 끝 끌기: 시작/끝 조정 · Space: 재생
        </span>
        <label className="ml-auto flex items-center gap-2 text-zinc-400" title="모든 줄의 글자 크기">
          전체 글자 크기
          <input
            type="range"
            min={MIN_FONT_SCALE}
            max={MAX_FONT_SCALE}
            step={0.05}
            value={fontScale}
            onChange={(e) => setStyle({ fontScale: Number(e.target.value) })}
            onDoubleClick={() => setStyle({ fontScale: 1 })}
            aria-label="전체 글자 크기"
            className="w-24 accent-indigo-500"
          />
          <span className="w-10 font-mono text-zinc-300">{fontScale.toFixed(2)}×</span>
        </label>
        <label className="flex items-center gap-2 text-zinc-400">
          확대
          <input
            type="range"
            min={MIN_PPS}
            max={MAX_PPS}
            step={1}
            value={pps}
            onChange={(e) => setPps(Number(e.target.value))}
            aria-label="타임라인 확대"
            className="w-28 accent-indigo-500"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Track and editor split the height 3:7 while a line is selected */}
        <div
          ref={scrollRef}
          className={`min-h-[96px] overflow-x-auto overflow-y-auto px-4 pb-1 pt-1 ${sel !== null ? "flex-[3]" : "flex-1"} ${QUIET_SCROLLBAR}`}
        >
          {/* Lyric track on top, then one illustration lane per prop, sharing the playhead */}
          <div className="relative flex h-full flex-col" style={{ width }}>
            <div
              ref={trackRef}
              onPointerDown={onTrackDown}
              onPointerMove={onTrackMove}
              onPointerUp={onTrackUp}
              onPointerCancel={onTrackUp}
              className={`relative flex-1 cursor-text select-none ${twoLanes ? "min-h-[150px]" : "min-h-[84px]"}`}
            >
              {/* Ruler */}
              {ticks.map((t) => (
                <div
                  key={t}
                  className="pointer-events-none absolute top-0 h-full border-l border-zinc-800/80"
                  style={{ left: t * pps }}
                >
                  <span className="ml-1 font-mono text-[10px] text-zinc-500">
                    {formatLrcTime(t).slice(0, 5)}
                  </span>
                </div>
              ))}

              {/* Stretches where the character is away (leaving through coming back), set in the illustration panel */}
              {(charCues ?? []).map((c, i) => (
                <div
                  key={`cue-${i}`}
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-amber-400/70"
                  style={{ left: c.hideAt * pps, width: Math.max(4, (c.showAt + c.fade - c.hideAt) * pps) }}
                />
              ))}

              {twoLanes && (
                <span className="pointer-events-none absolute bottom-1 left-1 top-[calc(50%+10px)] flex items-center text-[10px] font-semibold text-violet-300/60">
                  &
                </span>
              )}

              {lines.length === 0 && (
                <p className="pointer-events-none absolute left-2 top-8 text-xs text-zinc-500">
                  가사를 입력하면 여기에 자막 구간이 생깁니다.
                </p>
              )}

              {/* Lyric blocks */}
              {lines.map((line, i) => {
                const start = draft?.index === i ? draft.start : line.startTime;
                const end = draft?.index === i ? draft.end : line.endTime;
                const isSel = sel === i;
                return (
                  <div
                    key={`${i}-${line.rawText}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${i + 1}번 ${line.overlap ? "겹치는 " : ""}자막 ${formatLrcTime(start)} ~ ${formatLrcTime(end)}: ${line.cleanText}`}
                    aria-pressed={isSel}
                    onPointerDown={(e) => onSegmentDown(e, i, "move")}
                    onPointerMove={onSegmentMove}
                    onPointerUp={onSegmentUp}
                    onPointerCancel={onSegmentUp}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSelected(i);
                        seek(line.startTime);
                      }
                    }}
                    className={`absolute flex cursor-grab flex-col justify-center overflow-hidden rounded-md border px-2 text-left active:cursor-grabbing ${
                      !twoLanes
                        ? "bottom-1 top-5"
                        : line.overlap
                          ? "bottom-1 top-[calc(50%+10px)]"
                          : "bottom-[calc(50%-6px)] top-5"
                    } ${
                      isSel
                        ? line.overlap
                          ? "border-violet-400 bg-violet-500/15"
                          : "border-indigo-400 bg-indigo-500/15"
                        : line.overlap
                          ? "border-violet-800/80 bg-violet-950/30 hover:border-violet-400/70"
                          : "border-zinc-700 bg-zinc-900/40 hover:border-indigo-400/70"
                    }`}
                    style={{ left: start * pps, width: Math.max(6, (end - start) * pps) }}
                    title={`${formatLrcTime(start)} ~ ${formatLrcTime(end)}`}
                  >
                    <span className="truncate text-xs font-semibold text-zinc-100">
                      {(line.offsetX !== 0 ||
                        line.offsetY !== 0 ||
                        Object.keys(line.lineStyle).length > 0) && (
                        <span title="따로 조정한 줄" className="mr-1 text-indigo-200">
                          ⌖
                        </span>
                      )}
                      {line.cleanText}
                    </span>
                    {line.pronText && (
                      <span className="truncate text-[10px] text-amber-200/70">{line.pronText}</span>
                    )}
                    {line.transText && (
                      <span className="truncate text-[10px] text-zinc-300">{line.transText}</span>
                    )}
                    <span
                      aria-hidden
                      onPointerDown={(e) => onSegmentDown(e, i, "start")}
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-indigo-300/50"
                    />
                    <span
                      aria-hidden
                      onPointerDown={(e) => onSegmentDown(e, i, "end")}
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-indigo-300/50"
                    />
                  </div>
                );
              })}
            </div>
            <PropLanes pps={pps} timeAt={timeAt} />
            {/* Playhead */}
            <div
              ref={headRef}
              className="pointer-events-none absolute left-0 top-0 z-[2] h-full w-px bg-rose-400"
            >
              <div className="-ml-1 h-2 w-2 rotate-45 bg-rose-400" />
            </div>
          </div>
        </div>

        {selLine && sel !== null && selBounds && (
          <div
            ref={panelRef}
            className={`flex min-h-0 flex-[7] flex-col overflow-y-auto border-t border-zinc-800 ${QUIET_SCROLLBAR}`}
          >
            <div ref={sizerRef} className="m-auto shrink-0">
              <div
                ref={editorRef}
                className="flex origin-top-left flex-col items-center gap-2 px-4 py-2 text-xs"
              >
                <div className="grid w-full gap-2 sm:grid-cols-[1.5fr_1fr_1fr]">
                  <label className="flex items-center gap-2 text-zinc-400">
                    <span className="shrink-0">{sel + 1}번 가사</span>
                    <CommitInput
                      label="선택한 자막 가사"
                      value={selLine.rawText}
                      onCommit={(v) => v.trim() && updateLine(sel, { rawText: v.trim() })}
                      className="min-w-0 flex-1"
                      inputRef={lyricInputRef}
                      title="/n 을 넣은 자리에서 줄이 나뉩니다"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={insertBreak}
                      title="커서 자리에 줄 나눔(/n)을 넣습니다. Enter로 저장"
                      className={SMALL_BTN}
                    >
                      ↵ 줄 나눔
                    </button>
                  </label>
                  <label className="flex items-center gap-2 text-zinc-400">
                    <span className="shrink-0">발음</span>
                    <CommitInput
                      label="선택한 자막 발음"
                      value={selLine.pronText}
                      onCommit={(v) => updateLine(sel, { pronText: v.trim() })}
                      className="min-w-0 flex-1"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-zinc-400">
                    <span className="shrink-0">뜻</span>
                    <CommitInput
                      label="선택한 자막 뜻"
                      value={selLine.transText}
                      onCommit={(v) => updateLine(sel, { transText: v.trim() })}
                      className="min-w-0 flex-1"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-zinc-400">
                  <span>시작</span>
                  <CommitInput
                    type="number"
                    label="선택한 자막 시작(초)"
                    value={selLine.startTime.toFixed(2)}
                    onCommit={(v) => setStart(Number(v))}
                    className="w-20 font-mono"
                  />
                  <NudgeButtons onNudge={(d) => setStart(selLine.startTime + d)} />
                  <button type="button" onClick={() => setStart(now())} className={SMALL_BTN}>
                    현재 위치
                  </button>
                  <span className="ml-2">끝</span>
                  <CommitInput
                    type="number"
                    label="선택한 자막 끝(초)"
                    value={selLine.endTime.toFixed(2)}
                    onCommit={(v) => setEnd(Number(v))}
                    className="w-20 font-mono"
                  />
                  <NudgeButtons onNudge={(d) => setEnd(selLine.endTime + d)} />
                  <button type="button" onClick={() => setEnd(now())} className={SMALL_BTN}>
                    현재 위치
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      seek(selLine.startTime);
                      stopAtRef.current = selLine.endTime;
                      void play();
                    }}
                    className="ml-2 rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-500"
                  >
                    ▶ 구간 재생
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeLine(sel);
                      setSelected(null);
                    }}
                    className="rounded-md px-2 py-1 text-red-300 hover:bg-red-500/10"
                  >
                    줄 삭제
                  </button>
                  <label
                    className="ml-2 flex items-center gap-1.5 text-zinc-300"
                    title="켜면 앞 줄과 같은 시간에 작게 함께 나옵니다 (가사 앞에 & 를 붙인 것과 같습니다)"
                  >
                    <input
                      type="checkbox"
                      checked={selLine.overlap}
                      disabled={sel === 0 && !selLine.overlap}
                      onChange={(e) => updateLine(sel, { overlap: e.target.checked })}
                      className="accent-violet-500"
                    />
                    겹치는 줄(&)
                  </label>
                  <button type="button" onClick={() => setSelected(null)} className={SMALL_BTN}>
                    닫기
                  </button>
                </div>
                <PositionRow
                  offsetX={selLine.offsetX}
                  offsetY={selLine.offsetY}
                  onChange={(offsetX, offsetY) => updateLine(sel, { offsetX, offsetY })}
                />
                <LineStyleRow
                  value={selLine.lineStyle}
                  onChange={(lineStyle) => updateLine(sel, { lineStyle })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const SMALL_BTN = "rounded-md border border-zinc-800 px-1.5 py-1 text-zinc-300 hover:border-indigo-500";

function NudgeButtons({ onNudge }: { onNudge: (delta: number) => void }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onNudge(-NUDGE_SEC)}
        className={SMALL_BTN}
        aria-label="0.05초 앞으로"
      >
        −
      </button>
      <button type="button" onClick={() => onNudge(NUDGE_SEC)} className={SMALL_BTN} aria-label="0.05초 뒤로">
        +
      </button>
    </>
  );
}

/** Offsets of the quick positions: the middle of each column/row of the lyric grid. */
const GRID_CENTERS = Array.from({ length: GRID }, (_, k) => (k + 0.5) / GRID - 0.5);
const QUICK_CELLS = Array.from({ length: CELLS }, (_, cell) => ({
  x: GRID_CENTERS[cell % GRID],
  y: GRID_CENTERS[Math.floor(cell / GRID)],
  name: `${Math.floor(cell / GRID) + 1}행 ${(cell % GRID) + 1}열`,
}));

/** Where the selected line's lyrics sit: a quick pick on the lyric grid plus fine sliders, as shares of the frame. */
function PositionRow({
  offsetX,
  offsetY,
  onChange,
}: {
  offsetX: number;
  offsetY: number;
  onChange: (offsetX: number, offsetY: number) => void;
}) {
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const max = Math.round(MAX_LINE_OFFSET * 100);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-zinc-400">
      <span>이 줄 위치</span>
      <div
        role="group"
        aria-label="빠른 위치"
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}
      >
        {QUICK_CELLS.map(({ x, y, name }) => {
          const on = Math.abs(offsetX - x) < 0.01 && Math.abs(offsetY - y) < 0.01;
          return (
            <button
              key={name}
              type="button"
              aria-label={`위치: ${name}`}
              aria-pressed={on}
              title={name}
              onClick={() => onChange(Number(x.toFixed(2)), Number(y.toFixed(2)))}
              className={`h-3.5 w-5 rounded-sm border ${on ? "border-indigo-300 bg-indigo-500" : "border-zinc-700 hover:border-indigo-500"}`}
            />
          );
        })}
      </div>
      <label className="flex items-center gap-2">
        가로
        <input
          type="range"
          min={-max}
          max={max}
          step={1}
          value={Math.round(offsetX * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100, offsetY)}
          aria-label="이 줄 가로 위치"
          className="w-28 accent-indigo-500"
        />
        <span className="w-10 font-mono text-zinc-300">{pct(offsetX)}</span>
      </label>
      <label className="flex items-center gap-2">
        세로
        <input
          type="range"
          min={-max}
          max={max}
          step={1}
          value={Math.round(offsetY * 100)}
          onChange={(e) => onChange(offsetX, Number(e.target.value) / 100)}
          aria-label="이 줄 세로 위치"
          className="w-28 accent-indigo-500"
        />
        <span className="w-10 font-mono text-zinc-300">{pct(offsetY)}</span>
      </label>
      <button type="button" onClick={() => onChange(0, 0)} className={SMALL_BTN}>
        원래 위치로
      </button>
    </div>
  );
}

const LINE_STYLE_CONTROLS: ReadonlyArray<{
  key: keyof LineStyle;
  label: string;
  min: number;
  max: number;
  /** Starting value when the line first takes its own setting. */
  initial: number;
  format: (v: number) => string;
}> = [
  { key: "glitch", label: "글리치", min: 0, max: 1, initial: 0.6, format: (v) => `${Math.round(v * 100)}%` },
  { key: "shake", label: "흔들림", min: 0, max: 1, initial: 0.6, format: (v) => `${Math.round(v * 100)}%` },
  {
    key: "size",
    label: "글자 크기",
    min: MIN_LINE_SIZE,
    max: MAX_LINE_SIZE,
    initial: 1,
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: "width",
    label: "가로 폭",
    min: MIN_BOX_WIDTH,
    max: MAX_BOX_WIDTH,
    initial: 1,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "height",
    label: "줄 간격",
    min: MIN_BOX_HEIGHT,
    max: MAX_BOX_HEIGHT,
    initial: 1,
    format: (v) => `${Math.round(v * 100)}%`,
  },
];

/**
 * The selected line's own style. Each setting is either "follows the whole
 * video" (unchecked) or this line's value, which the renderer uses while the
 * line is on screen.
 */
function LineStyleRow({ value, onChange }: { value: LineStyle; onChange: (next: LineStyle) => void }) {
  const set = (key: keyof LineStyle, v: number | undefined) => {
    const next: LineStyle = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-zinc-400">
      <span>이 줄 스타일</span>
      {LINE_STYLE_CONTROLS.map((c) => {
        const own = value[c.key];
        return (
          <span key={c.key} className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={own !== undefined}
                onChange={(e) => set(c.key, e.target.checked ? c.initial : undefined)}
                aria-label={`이 줄만 ${c.label} 따로`}
                className="accent-indigo-500"
              />
              {c.label}
            </label>
            {own !== undefined ? (
              <>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={0.01}
                  value={own}
                  onChange={(e) => set(c.key, Number(e.target.value))}
                  aria-label={`이 줄 ${c.label}`}
                  className="w-24 accent-indigo-500"
                />
                <span className="w-10 font-mono text-zinc-300">{c.format(own)}</span>
              </>
            ) : (
              <span className="text-zinc-600">전체 설정</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
