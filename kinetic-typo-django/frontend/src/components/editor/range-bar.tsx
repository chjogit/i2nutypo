import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { usePlaybackStore } from "@/store/playback-store";

type Grip = "start" | "end" | "move";

/** Shortest part that can be picked, in seconds. */
const MIN_SPAN = 0.5;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The whole song as a quiet bar with the picked part on it: drag either end to
 * trim, drag the middle to slide the part, click elsewhere to move the
 * nearer end there. Faint marks show where lyric lines start, and a thin line
 * shows the playhead.
 */
export function RangeBar({
  start,
  end,
  duration,
  marks,
  disabled,
  onChange,
}: {
  start: number;
  end: number;
  duration: number;
  marks: readonly number[];
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ grip: Grip; pointerT: number; start: number; end: number } | null>(null);
  const playhead = usePlaybackStore((s) => s.currentTime);
  const total = Math.max(MIN_SPAN, duration);
  const pct = (t: number) => `${(Math.min(total, Math.max(0, t)) / total) * 100}%`;

  const timeAt = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    return r && r.width > 0 ? Math.min(total, Math.max(0, ((clientX - r.left) / r.width) * total)) : 0;
  };

  const apply = (grip: Grip, t: number, d: { pointerT: number; start: number; end: number }) => {
    if (grip === "start") onChange(round1(Math.min(t, end - MIN_SPAN)), end);
    else if (grip === "end") onChange(start, round1(Math.max(t, start + MIN_SPAN)));
    else {
      const len = d.end - d.start;
      const s = Math.min(Math.max(0, d.start + t - d.pointerT), total - len);
      onChange(round1(s), round1(s + len));
    }
  };

  const onDown = (e: ReactPointerEvent<HTMLElement>, grip: Grip | null) => {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    const t = timeAt(e.clientX);
    // A press on the bar itself grabs whichever end is nearer and moves it there
    const g = grip ?? (Math.abs(t - start) <= Math.abs(t - end) ? "start" : "end");
    dragRef.current = { grip: g, pointerT: t, start, end };
    barRef.current?.setPointerCapture(e.pointerId);
    if (!grip) apply(g, t, dragRef.current);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (d) apply(d.grip, timeAt(e.clientX), d);
  };
  const onUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={barRef}
      role="group"
      aria-label="저장할 구간 막대"
      onPointerDown={(e) => onDown(e, null)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={`relative h-6 touch-none select-none rounded bg-zinc-900/70 ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      {marks.map((t, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 w-px bg-zinc-700/70"
          style={{ left: pct(t) }}
        />
      ))}
      <div
        onPointerDown={(e) => onDown(e, "move")}
        title="끌어서 구간 옮기기"
        className="absolute inset-y-0 cursor-grab rounded border border-indigo-500/60 bg-indigo-500/15 active:cursor-grabbing"
        style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
      >
        <span
          onPointerDown={(e) => onDown(e, "start")}
          title="시작 조절"
          aria-hidden
          className="absolute inset-y-0 -left-1 w-2.5 cursor-ew-resize rounded-l bg-indigo-400/70 hover:bg-indigo-300"
        />
        <span
          onPointerDown={(e) => onDown(e, "end")}
          title="끝 조절"
          aria-hidden
          className="absolute inset-y-0 -right-1 w-2.5 cursor-ew-resize rounded-r bg-indigo-400/70 hover:bg-indigo-300"
        />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-px bg-rose-400/80"
        style={{ left: pct(playhead) }}
      />
    </div>
  );
}
