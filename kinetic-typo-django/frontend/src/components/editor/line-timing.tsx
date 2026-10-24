import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LyricLine } from "@/types/project";
import {
  currentTiming,
  moveMark,
  stampMark,
  timingLabels,
  timingUnit,
  wordStarts,
  type TimingUnit,
} from "@/lib/lyrics/timing";
import { usePlaybackStore } from "@/store/playback-store";
import { Tip } from "@/components/ui/tip";

const BTN = "rounded-md border border-zinc-800 px-1.5 py-1 text-zinc-300 hover:border-indigo-500";
const ON = "border-indigo-400 bg-indigo-500/20 text-indigo-100";

/**
 * The selected line's detail timeline: one mark per word or per character at
 * the moment it appears. Marks are dragged along the line (the preview follows
 * the mark), or tapped in while the line plays. Saved as shares of the line,
 * so the timing keeps its shape when the line is moved or stretched.
 */
export function LineTimingRow({
  line,
  onChange,
}: {
  line: LyricLine;
  onChange: (timing: number[] | undefined) => void;
}) {
  const seek = usePlaybackStore((s) => s.seek);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);
  const [unit, setUnit] = useState<TimingUnit>(() => timingUnit(line));
  const [draft, setDraft] = useState<number[] | null>(null);
  const [tapAt, setTapAt] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; marks: number[] } | null>(null);

  const span = Math.max(0.01, line.endTime - line.startTime);
  const labels = timingLabels(line, unit);
  const marks = draft ?? currentTiming(line, unit);
  const firsts = new Set(wordStarts(line, unit));

  // A line edited elsewhere (another line picked, text rewritten) drops what was in progress
  const key = `${line.index}|${line.rawText}`;
  useEffect(() => {
    setUnit(timingUnit(line));
    setDraft(null);
    setTapAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the line itself changes
  }, [key]);

  // Playhead inside the line, read straight from the clock each frame
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = usePlaybackStore.getState().currentTime;
      const head = headRef.current;
      if (head) {
        const k = (t - line.startTime) / span;
        head.style.display = k >= 0 && k <= 1 ? "block" : "none";
        head.style.left = `${k * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line.startTime, span]);

  const shareAt = (clientX: number): number => {
    const r = stripRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const onMarkDown = (e: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (tapAt !== null) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { index, marks };
    pause();
  };
  const onMarkMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = moveMark(drag.marks, drag.index, shareAt(e.clientX));
    drag.marks = next;
    setDraft(next);
    // The preview shows the frame where the mark sits, so its character can be seen arriving
    seek(line.startTime + next[drag.index] * span + 0.02);
  };
  const onMarkUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    onChange(drag.marks);
    setDraft(null);
  };

  const switchUnit = (next: TimingUnit) => {
    if (next === unit || tapAt !== null) return;
    setUnit(next);
    onChange(currentTiming(line, next));
  };

  const startTapping = () => {
    setDraft(currentTiming(line, unit));
    setTapAt(0);
    seek(line.startTime);
    void play();
  };
  const stopTapping = (keep: number[] | null) => {
    pause();
    setTapAt(null);
    setDraft(null);
    if (keep) onChange(keep);
  };
  const tap = () => {
    if (tapAt === null || !draft) return;
    const t = usePlaybackStore.getState().currentTime;
    const next = stampMark(draft, tapAt, (t - line.startTime) / span);
    if (tapAt + 1 >= labels.length) stopTapping(next);
    else {
      setDraft(next);
      setTapAt(tapAt + 1);
    }
  };

  return (
    <div className="w-full space-y-1.5 rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-zinc-400">
        <span className="font-semibold text-zinc-200">세부 타이밍</span>
        <Tip>
          줄 안에서 단어나 글자가 나오는 순간을 정합니다. 표시를 좌우로 끌면 미리보기가 그 순간으로 따라가고,
          &apos;탭으로 찍기&apos;를 누르면 줄이 재생되는 동안 노래에 맞춰 탭 버튼(또는 스페이스)을 눌러 차례로
          찍을 수 있습니다. 줄을 옮기거나 늘려도 비율이 유지되고, 가사를 고치면 고르게 나오도록 돌아갑니다.
        </Tip>
        <div className="ml-1 flex overflow-hidden rounded-md border border-zinc-800">
          {(
            [
              ["word", "단어"],
              ["char", "글자"],
            ] as const
          ).map(([u, label]) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              disabled={tapAt !== null}
              onClick={() => switchUnit(u)}
              className={`px-2 py-1 ${unit === u ? ON : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {label} 단위
            </button>
          ))}
        </div>
        {tapAt === null ? (
          <button type="button" onClick={startTapping} className={BTN} disabled={labels.length === 0}>
            ⏺ 탭으로 찍기
          </button>
        ) : (
          <>
            <button
              type="button"
              autoFocus
              onClick={tap}
              onKeyDown={(e) => {
                // Space taps here instead of pausing the song
                if (e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  tap();
                }
              }}
              className="rounded-md bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
            >
              탭 · {labels[tapAt]} ({tapAt + 1}/{labels.length})
            </button>
            <button type="button" onClick={() => stopTapping(draft)} className={BTN}>
              여기까지 저장
            </button>
            <button type="button" onClick={() => stopTapping(null)} className={BTN}>
              취소
            </button>
          </>
        )}
        <button
          type="button"
          disabled={!line.timing || tapAt !== null}
          onClick={() => {
            setUnit("word");
            onChange(undefined);
          }}
          className={`${BTN} disabled:opacity-40`}
          title="세부 타이밍을 지우고 고르게 나오게 합니다"
        >
          고르게
        </button>
      </div>
      <div
        ref={stripRef}
        role="group"
        aria-label="세부 타이밍 표시줄"
        onPointerDown={(e) => {
          if (tapAt === null) seek(line.startTime + shareAt(e.clientX) * span);
        }}
        className="relative h-14 w-full cursor-text select-none rounded bg-zinc-900"
      >
        {/* Half-second ticks */}
        {Array.from({ length: Math.floor(span / 0.5) + 1 }, (_, k) => (
          <div
            key={k}
            className={`pointer-events-none absolute inset-y-0 border-l ${k % 2 === 0 ? "border-zinc-700/70" : "border-zinc-800/70"}`}
            style={{ left: `${((k * 0.5) / span) * 100}%` }}
          />
        ))}
        {marks.map((v, i) => (
          <div key={i} className="pointer-events-none absolute inset-y-0" style={{ left: `${v * 100}%` }}>
            <div
              className={`absolute inset-y-0 w-px ${firsts.has(i) ? "bg-indigo-400" : "bg-indigo-400/40"}`}
            />
            <button
              type="button"
              aria-label={`${i + 1}번째 ${unit === "word" ? "단어" : "글자"} ${labels[i]} ${(v * span).toFixed(2)}초`}
              title={`${labels[i]} · ${(v * span).toFixed(2)}초`}
              onPointerDown={(e) => onMarkDown(e, i)}
              onPointerMove={onMarkMove}
              onPointerUp={onMarkUp}
              onPointerCancel={onMarkUp}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const step = (e.key === "ArrowLeft" ? -0.05 : 0.05) / span;
                onChange(moveMark(marks, i, v + step));
              }}
              className={`pointer-events-auto absolute -translate-x-1/2 cursor-ew-resize whitespace-nowrap rounded px-1 text-[11px] leading-5 ${
                tapAt !== null && i === tapAt
                  ? "bg-rose-500 text-white"
                  : firsts.has(i)
                    ? "bg-indigo-500/80 text-white hover:bg-indigo-400"
                    : "bg-indigo-900/90 text-indigo-100 hover:bg-indigo-700"
              } ${i % 2 === 0 ? "top-1" : "top-7"}`}
            >
              {labels[i]}
            </button>
          </div>
        ))}
        <div ref={headRef} className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-rose-400" />
      </div>
    </div>
  );
}
