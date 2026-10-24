import { getLookPreset } from "@/lib/render/looks/presets";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { ClipLane } from "./clip-lane";
import { illustrationName } from "./props-panel";

export { CLIP_LANE_HEIGHT as PROP_LANE_HEIGHT } from "./clip-lane";

/** One lane per illustration on the timeline. */
export function PropLanes({ pps, timeAt }: { pps: number; timeAt: (clientX: number) => number }) {
  const props = useProjectStore((s) => s.props);
  const addPropClip = useProjectStore((s) => s.addPropClip);
  const updatePropClip = useProjectStore((s) => s.updatePropClip);
  const selected = usePropUiStore((s) => s.selected);
  const select = usePropUiStore((s) => s.select);

  return (
    <>
      {props
        .filter((p) => p.onTimeline)
        .map((p) => {
          const name = illustrationName(props, p.id);
          return (
            <ClipLane
              key={p.id}
              label={`🖼 ${name}`}
              ariaLabel={`일러스트 타임라인: ${name}`}
              clips={p.clips}
              selectedId={selected?.propId === p.id ? selected.clipId : null}
              pps={pps}
              timeAt={timeAt}
              onSelect={(clipId) => select({ propId: p.id, clipId })}
              onTimes={(clipId, start, end) => updatePropClip(p.id, clipId, { start, end })}
              onAdd={(at) => addPropClip(p.id, at)}
              title={(c) => `${name}${c.front ? " · 가사 앞" : ""}`}
              content={(c) => (
                <>
                  <img
                    src={p.objectUrl}
                    alt=""
                    className="pointer-events-none h-4 w-4 shrink-0 object-contain"
                  />
                  <span className="pointer-events-none truncate text-[10px] text-zinc-200">
                    {c.front ? "▲ " : ""}
                    {name}
                  </span>
                </>
              )}
              tone={{
                on: "border-emerald-400 bg-emerald-900",
                off: "border-emerald-800/80 bg-emerald-950 hover:border-emerald-400/70",
                handle: "hover:bg-emerald-300/50",
                label: "text-emerald-300/60",
              }}
            />
          );
        })}
    </>
  );
}

/** The theme lane: stretches of the song drawn with their own themes. */
export function ThemeLane({ pps, timeAt }: { pps: number; timeAt: (clientX: number) => number }) {
  const clips = useProjectStore((s) => s.style.themeClips);
  const addThemeClip = useProjectStore((s) => s.addThemeClip);
  const updateThemeClip = useProjectStore((s) => s.updateThemeClip);
  const selectedId = usePropUiStore((s) => s.themeClip);
  const selectThemeClip = usePropUiStore((s) => s.selectThemeClip);
  const label = (c: (typeof clips)[number]) =>
    [c.lookPreset, ...c.mixLooks]
      .map((id) => `${getLookPreset(id).emoji} ${getLookPreset(id).label}`)
      .join(" + ");

  return (
    <ClipLane
      label="🎨 테마"
      ariaLabel="테마 타임라인"
      clips={clips ?? []}
      selectedId={selectedId}
      pps={pps}
      timeAt={timeAt}
      onSelect={selectThemeClip}
      onTimes={(id, start, end) => updateThemeClip(id, { start, end })}
      onAdd={addThemeClip}
      title={label}
      content={(c) => (
        <span className="pointer-events-none truncate text-[10px] text-zinc-200">{label(c)}</span>
      )}
      tone={{
        on: "border-amber-400 bg-amber-900/80",
        off: "border-amber-800/80 bg-amber-950/80 hover:border-amber-400/70",
        handle: "hover:bg-amber-300/50",
        label: "text-amber-300/60",
      }}
    />
  );
}
