import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CharacterCue } from "@/types/project";
import { formatLrcTime } from "@/lib/lyrics/parse";
import {
  characterAt,
  CUE_EFFECTS,
  moveCueTime,
  shiftCue,
  sortCues,
  transitionLength,
  visibleSpans,
} from "@/lib/render/looks/cues";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { PROP_LANE_HEIGHT } from "./prop-lanes";

type DragKind = "hide" | "show" | "shift";

interface Drag {
  cue: number;
  kind: DragKind;
  pointerX: number;
  from: CharacterCue[];
  moved: boolean;
}

const DRAG_THRESHOLD_PX = 3;
/** Length of the gap a double click makes, in seconds. */
const NEW_GAP = 2;

const EFFECT_LABEL = Object.fromEntries(CUE_EFFECTS) as Record<CharacterCue["effect"], string>;

/**
 * The character's lane in the illustration timeline: blue where it is on
 * screen, dashed where it is away. Drag a gap to move the exit and return
 * together, or its edges to move each one; double-click the blue part to make
 * it leave there. A gap click picks that exit for editing in the illustration
 * panel. The no-lyric cell rules follow the cues as before.
 */
export function CharacterLane({ pps, timeAt }: { pps: number; timeAt: (clientX: number) => number }) {
  const ill = useProjectStore((s) => s.style.illustration);
  const hasCharacter = useProjectStore((s) => s.images.character !== null);
  const duration = useProjectStore((s) => s.duration);
  const setIllustration = useProjectStore((s) => s.setIllustration);
  const seek = usePlaybackStore((s) => s.seek);
  const sel = usePropUiStore((s) => s.cue);
  const selectCue = usePropUiStore((s) => s.selectCue);
  const selectCharacter = usePropUiStore((s) => s.selectCharacter);
  const charPicked = usePropUiStore((s) => s.character);
  const dragRef = useRef<Drag | null>(null);
  /** Cues shown while dragging; saved on release. */
  const [draft, setDraft] = useState<CharacterCue[] | null>(null);

  if (!hasCharacter || !ill.showCharacter) return null;
  const cues = draft ?? ill.charCues ?? [];

  const onDown = (e: ReactPointerEvent<HTMLElement>, cue: number, kind: DragKind) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { cue, kind, pointerX: e.clientX, from: [...(ill.charCues ?? [])], moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.pointerX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const c = d.from[d.cue];
    const dt = dx / pps;
    setDraft(
      d.kind === "shift"
        ? shiftCue(d.from, d.cue, dt, duration)
        : moveCueTime(d.from, d.cue, d.kind, (d.kind === "hide" ? c.hideAt : c.showAt) + dt, duration),
    );
  };

  const onUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    selectCue(d.cue);
    if (!d.moved) seek(d.from[d.cue].hideAt);
    else if (draft) setIllustration({ charCues: draft });
    setDraft(null);
  };

  // Double click on a shown stretch: leave there and come back a little later at the same place
  const addGap = (t: number) => {
    const list = ill.charCues ?? [];
    const nextHide = list.find((c) => c.hideAt > t)?.hideAt ?? duration;
    const at = characterAt(ill, t);
    const cue: CharacterCue = {
      hideAt: Math.round(t * 100) / 100,
      showAt: Math.round(Math.min(t + NEW_GAP, nextHide) * 100) / 100,
      effect: "fade",
      fade: 0.6,
      x: at.x,
      y: at.y,
    };
    const next = sortCues([...list, cue]);
    setIllustration({ charCues: next });
    selectCue(next.indexOf(cue));
  };

  return (
    <div
      role="group"
      aria-label="일러스트 타임라인: 캐릭터"
      onPointerDown={(e) => {
        if (e.button === 0 && e.target === e.currentTarget) seek(timeAt(e.clientX));
      }}
      title="파란 구간 두 번 클릭: 그 시간에 퇴장 추가"
      className="relative border-b border-zinc-900"
      style={{ height: PROP_LANE_HEIGHT }}
    >
      {visibleSpans(cues, duration).map((s) => (
        <div
          key={`span-${s.startsWith ?? "first"}`}
          role="button"
          aria-label={`캐릭터 보이는 구간 ${formatLrcTime(s.start)} ~ ${formatLrcTime(s.end)}`}
          onDoubleClick={(e) => addGap(timeAt(e.clientX))}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            selectCharacter(true);
            seek(timeAt(e.clientX));
          }}
          className={`absolute inset-y-1 flex cursor-pointer items-center overflow-hidden rounded border bg-sky-950 px-1.5 ${
            charPicked ? "border-sky-400" : "border-sky-800/80 hover:border-sky-400/70"
          }`}
          style={{ left: s.start * pps, width: Math.max(2, (s.end - s.start) * pps) }}
        >
          <span className="pointer-events-none sticky left-1 truncate text-[10px] text-sky-200/80">
            🧍 캐릭터
          </span>
        </div>
      ))}
      {cues.map((c, i) => {
        const isSel = sel === i;
        const fade = transitionLength(c) * pps;
        return (
          <div
            key={`gap-${i}`}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            aria-label={`캐릭터 ${i + 1}번 퇴장 ${formatLrcTime(c.hideAt)} ~ 재등장 ${formatLrcTime(c.showAt)}, ${EFFECT_LABEL[c.effect]}`}
            onPointerDown={(e) => onDown(e, i, "shift")}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                selectCue(i);
                seek(c.hideAt);
              }
            }}
            title={`${i + 1}번: ${formatLrcTime(c.hideAt)} 퇴장 → ${formatLrcTime(c.showAt)} 재등장 · ${EFFECT_LABEL[c.effect]}`}
            className={`absolute inset-y-1 z-[1] flex cursor-grab items-center justify-center overflow-hidden rounded border border-dashed text-[10px] active:cursor-grabbing ${
              isSel
                ? "border-violet-400 bg-violet-500/15 text-violet-200"
                : "border-zinc-600 text-zinc-400 hover:border-violet-400/70"
            }`}
            style={{ left: c.hideAt * pps, width: Math.max(8, (c.showAt - c.hideAt) * pps) }}
          >
            {/* Exit and return transitions, shaded at both ends */}
            {fade > 0 && (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-sky-800/60 to-transparent"
                  style={{ width: fade }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-sky-800/60 to-transparent"
                  style={{ width: fade }}
                />
              </>
            )}
            <span className="pointer-events-none truncate px-2">{i + 1}번 퇴장</span>
            <span
              aria-hidden
              onPointerDown={(e) => onDown(e, i, "hide")}
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-violet-300/50"
            />
            <span
              aria-hidden
              onPointerDown={(e) => onDown(e, i, "show")}
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-violet-300/50"
            />
          </div>
        );
      })}
    </div>
  );
}
