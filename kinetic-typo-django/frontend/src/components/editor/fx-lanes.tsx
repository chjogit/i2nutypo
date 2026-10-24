import { beatsEvery } from "@/lib/beats/detect";
import { ADJUST_BY_ID, TRANSITION_BY_ID } from "@/lib/timeline-fx/defs";
import { addTransitionsAt, lineCuts } from "@/lib/actions/quick-actions";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore, type FxPick } from "@/store/prop-ui-store";
import { openMenu } from "@/components/ui/context-menu";
import { ClipLane } from "./clip-lane";
import { FX_DRAG_TYPE, type FxDrag } from "./effects-panel";

type LaneProps = { pps: number; timeAt: (clientX: number) => number };

const parse = (data: string): FxDrag | null => {
  try {
    return JSON.parse(data) as FxDrag;
  } catch {
    return null;
  }
};

/**
 * What a lane needs for picking several effect clips: Ctrl/Shift click adds
 * one to the group, and dragging any picked clip moves the whole group,
 * across both effect lanes.
 */
function useFxGroup(lane: FxPick["lane"]) {
  const group = usePropUiStore((s) => s.fxGroup);
  const toggleFx = usePropUiStore((s) => s.toggleFx);
  const groupShift = usePropUiStore((s) => s.fxShift);
  const setFxShift = usePropUiStore((s) => s.setFxShift);
  const moveFxClips = useProjectStore((s) => s.moveFxClips);
  const ids = (l: FxPick["lane"]) => group.filter((p) => p.lane === l).map((p) => p.id);
  return {
    groupIds: new Set(group.length > 1 ? ids(lane) : []),
    onTogglePick: (id: string) => toggleFx({ lane, id }),
    groupShift,
    onGroupShift: setFxShift,
    onGroupMove: (dt: number) => moveFxClips(ids("transition"), ids("adjust"), dt),
  };
}

/** Screen transitions; each is centered on its cut. */
export function TransitionLane({ pps, timeAt }: LaneProps) {
  const clips = useProjectStore((s) => s.style.transitions);
  const add = useProjectStore((s) => s.addTransition);
  const update = useProjectStore((s) => s.updateTransition);
  const remove = useProjectStore((s) => s.removeTransition);
  const fx = usePropUiStore((s) => s.fx);
  const selectFx = usePropUiStore((s) => s.selectFx);
  const last = usePropUiStore((s) => s.lastTransition);
  const pick = (id: string | null) => id && selectFx({ lane: "transition", id });
  const groupProps = useFxGroup("transition");
  const label = (kind: string) => TRANSITION_BY_ID.get(kind as never)?.label ?? kind;

  return (
    <ClipLane
      {...groupProps}
      label="✦ 전환"
      ariaLabel="트랜지션 타임라인"
      clips={clips ?? []}
      selectedId={fx?.lane === "transition" ? fx.id : null}
      pps={pps}
      timeAt={timeAt}
      onSelect={(id) => selectFx({ lane: "transition", id })}
      onTimes={(id, start, end) => update(id, { start, end })}
      onAdd={(at) => add(last, at)}
      title={(c) => label(c.kind)}
      content={(c) => (
        <span className="pointer-events-none flex w-full items-center justify-center truncate text-[10px] text-zinc-100">
          ⧖ {label(c.kind)}
        </span>
      )}
      tone={{
        on: "border-fuchsia-300 bg-fuchsia-800",
        off: "border-fuchsia-800/80 bg-fuchsia-950 hover:border-fuchsia-400/70",
        handle: "hover:bg-fuchsia-300/50",
        label: "text-fuchsia-300/70",
      }}
      dropType={FX_DRAG_TYPE}
      onDropData={(at, data) => {
        const d = parse(data);
        if (d?.lane === "transition") pick(add(d.kind, at));
      }}
      onClipMenu={(e, c) =>
        openMenu(
          e,
          [
            {
              label: "복제 (바로 뒤에)",
              onSelect: () => pick(add(c.kind, c.end + (c.end - c.start) / 2 + 0.05)),
            },
            {
              label: `가사 줄마다 '${label(c.kind)}' 넣기`,
              onSelect: () => void addTransitionsAt(lineCuts(), [c.kind]),
            },
            "sep",
            { label: "삭제", hint: "Del", danger: true, onSelect: () => remove(c.id) },
          ],
          label(c.kind),
        )
      }
      onLaneMenu={(e, at) =>
        openMenu(
          e,
          [{ label: `여기에 '${label(last)}' 넣기`, onSelect: () => pick(add(last, at)) }],
          "전환 줄",
        )
      }
    />
  );
}

/** Adjustment layers: an effect over the whole picture for a stretch. */
export function AdjustLane({ pps, timeAt }: LaneProps) {
  const clips = useProjectStore((s) => s.style.adjustClips);
  const add = useProjectStore((s) => s.addAdjust);
  const update = useProjectStore((s) => s.updateAdjust);
  const remove = useProjectStore((s) => s.removeAdjust);
  const fx = usePropUiStore((s) => s.fx);
  const selectFx = usePropUiStore((s) => s.selectFx);
  const pick = (id: string | null) => id && selectFx({ lane: "adjust", id });
  const groupProps = useFxGroup("adjust");
  const label = (kind: string) => ADJUST_BY_ID.get(kind as never)?.label ?? kind;

  return (
    <ClipLane
      {...groupProps}
      label="◐ 조정"
      ariaLabel="조정 레이어 타임라인"
      clips={clips ?? []}
      selectedId={fx?.lane === "adjust" ? fx.id : null}
      pps={pps}
      timeAt={timeAt}
      onSelect={(id) => selectFx({ lane: "adjust", id })}
      onTimes={(id, start, end) => update(id, { start, end })}
      onAdd={(at) => add("shake", at)}
      title={(c) => `${label(c.kind)} ${Math.round(c.amount * 100)}%`}
      content={(c) => (
        <span className="pointer-events-none truncate text-[10px] text-zinc-100">
          {label(c.kind)} <span className="text-zinc-400">{Math.round(c.amount * 100)}%</span>
        </span>
      )}
      tone={{
        on: "border-sky-300 bg-sky-800",
        off: "border-sky-800/80 bg-sky-950 hover:border-sky-400/70",
        handle: "hover:bg-sky-300/50",
        label: "text-sky-300/70",
      }}
      dropType={FX_DRAG_TYPE}
      onDropData={(at, data) => {
        const d = parse(data);
        if (d?.lane === "adjust") pick(add(d.kind, at));
      }}
      onClipMenu={(e, c) =>
        openMenu(
          e,
          [
            {
              label: "복제 (바로 뒤에)",
              onSelect: () => pick(add(c.kind, c.end, c.end + (c.end - c.start))),
            },
            {
              label: "가사 줄 길이에 맞추기",
              onSelect: () => {
                const l = useProjectStore
                  .getState()
                  .lines.find((x) => !x.overlap && c.start >= x.startTime - 0.05 && c.start < x.endTime);
                if (l) update(c.id, { start: l.startTime, end: l.endTime });
              },
            },
            "sep",
            { label: "삭제", hint: "Del", danger: true, onSelect: () => remove(c.id) },
          ],
          label(c.kind),
        )
      }
      onLaneMenu={(e, at) =>
        openMenu(
          e,
          [
            { label: "여기에 카메라 흔들림", onSelect: () => pick(add("shake", at)) },
            { label: "여기에 흑백", onSelect: () => pick(add("mono", at)) },
            { label: "여기에 천천히 줌 인", onSelect: () => pick(add("zoom", at)) },
          ],
          "조정 레이어 줄",
        )
      }
    />
  );
}

/** Beat ticks over the lyric track: thin on each beat, bold on bar starts. */
export function BeatMarks({ pps }: { pps: number }) {
  const beats = useProjectStore((s) => s.beats);
  if (!beats) return null;
  const bars = new Set(beatsEvery(beats, 4));
  // Too dense to read when zoomed far out: bars only
  const showBeats = pps * (60 / beats.bpm) > 6;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-3">
      {beats.times.map((t) =>
        bars.has(t) ? (
          <span key={t} className="absolute top-0 h-3 w-px bg-amber-300/80" style={{ left: t * pps }} />
        ) : showBeats ? (
          <span key={t} className="absolute top-0 h-1.5 w-px bg-amber-200/40" style={{ left: t * pps }} />
        ) : null,
      )}
    </div>
  );
}
