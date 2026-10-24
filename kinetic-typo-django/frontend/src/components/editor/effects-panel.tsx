import { useEffect, useRef, useState, type DragEvent } from "react";
import type { AdjustKind, StyleSettings, TransitionKind } from "@/types/project";
import { ADJUSTS, TRANSITIONS, TRANSITION_BY_ID, type TransitionDef } from "@/lib/timeline-fx/defs";
import { applyTimelineFx } from "@/lib/timeline-fx/render-fx";
import { MOTION_PACKS } from "@/lib/timeline-fx/packs";
import { beatsEvery } from "@/lib/beats/detect";
import { addTransitionsAt, applyPack, barCuts, lineCuts, runBeatAnalysis } from "@/lib/actions/quick-actions";
import { useProjectStore } from "@/store/project-store";
import { usePlaybackStore } from "@/store/playback-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { Tip } from "@/components/ui/tip";
import { BgVideoPicker } from "./bg-video-picker";

/** Drag data for a library item dropped on a timeline lane. */
export const FX_DRAG_TYPE = "application/x-kinetic-fx";
export type FxDrag = { lane: "transition"; kind: TransitionKind } | { lane: "adjust"; kind: AdjustKind };

const setDrag = (e: DragEvent, data: FxDrag) => {
  e.dataTransfer.setData(FX_DRAG_TYPE, JSON.stringify(data));
  e.dataTransfer.effectAllowed = "copy";
};

type Tab = "packs" | "transitions" | "adjust" | "video" | "beats";

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["packs", "팩"],
  ["transitions", "전환"],
  ["adjust", "조정"],
  ["video", "배경 영상"],
  ["beats", "비트"],
];

const CARD =
  "rounded-md border border-zinc-800 bg-zinc-900/40 text-left hover:border-indigo-500 focus:border-indigo-500 focus:outline-none";
const SMALL =
  "rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-indigo-500 disabled:opacity-40";

const now = () => usePlaybackStore.getState().currentTime;

const OPEN_KEY = "kinetic-typo-effects-open";

/** Whether the effects panel was left open; it starts open, and storage may be unavailable. */
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Folding still works for this visit
  }
}

/**
 * Right column library of ready-made effects: motion packs, transitions,
 * adjustment layers, background videos and beat markers.
 * Hover an item to preview it, click to put it at the playhead, or drag it
 * onto its lane in the timeline.
 */
export function EffectsPanel() {
  const [tab, setTab] = useState<Tab>("packs");
  const fx = usePropUiStore((s) => s.fx);
  // Picking a clip on an effect lane shows its library
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((v) => {
      writeOpen(!v);
      return !v;
    });
  useEffect(() => {
    if (!fx) return;
    setTab(fx.lane === "transition" ? "transitions" : "adjust");
    // Picking an effect clip shows its library even when the panel was folded
    setOpen(true);
  }, [fx]);
  return (
    <section aria-label="효과 · 소스" className={`px-4 ${open ? "space-y-3 py-4" : "py-2.5"}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-400 hover:text-zinc-100"
        >
          <span
            aria-hidden
            className={`text-[10px] text-zinc-500 transition-transform ${open ? "" : "-rotate-90"}`}
          >
            ▾
          </span>
          <h2>효과 · 소스</h2>
          {!open && <span className="font-normal text-zinc-600">{TABS.find(([id]) => id === tab)?.[1]}</span>}
        </button>
        <Tip>
          항목에 마우스를 올리면 미리 볼 수 있고, 누르면 재생 위치에 들어갑니다. 타임라인의 해당 줄로 끌어다
          놓아도 됩니다. 타임라인에서 구간을 우클릭하면 복제·삭제 같은 메뉴가 나옵니다. Ctrl+K로 빠른 작업
          목록을 엽니다.
        </Tip>
      </div>
      {open && (
        <>
          <div role="tablist" aria-label="효과 종류" className="grid grid-cols-3 gap-1 text-[11px]">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-md border px-1.5 py-1 ${tab === id ? "border-indigo-500 bg-indigo-500/15 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "packs" && <PacksTab />}
          {tab === "transitions" && <TransitionsTab />}
          {tab === "adjust" && <AdjustTab />}
          {tab === "video" && <BgVideoPicker />}
          {tab === "beats" && <BeatsTab />}
        </>
      )}
    </section>
  );
}

function Flash({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-200"
    >
      {text}
    </p>
  );
}

function useFlash(): [string | null, (t: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    text,
    (t) => {
      setText(t);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setText(null), 3500);
    },
  ];
}

function PacksTab() {
  const [msg, flash] = useFlash();
  const hasBeats = useProjectStore((s) => s.beats !== null);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        한 번에 영상 분위기 입히기
        <Tip>
          팩을 누르면 전환(트랜지션)·테마 요소 움직임·가사 자리·마무리 색감이 한 번에 들어갑니다. 지금 있는
          트랜지션은 팩 것으로 바뀌고, 나머지는 하나씩 고칠 수 있습니다.
        </Tip>
      </p>
      <Flash text={msg} />
      <div className="grid grid-cols-2 gap-1.5">
        {MOTION_PACKS.map((p) => (
          <div key={p.id} className={`${CARD} flex items-center gap-1 px-2 py-2`}>
            <button
              type="button"
              onClick={() => flash(applyPack(p))}
              className="min-w-0 flex-1 text-left text-xs font-semibold text-zinc-100 hover:text-indigo-200"
            >
              {p.label}
              {p.on === "bars" && !hasBeats && (
                <span className="ml-1 text-[10px] font-normal text-zinc-500">(줄마다)</span>
              )}
            </button>
            <Tip label={`${p.label} 팩 설명`}>{p.hint}</Tip>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A tiny looping picture of a transition: frame A cuts to frame B halfway. */
function TransitionPreview({ kind, playing }: { kind: TransitionKind; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const style = {
      accentColor: "#818cf8",
      bgColor: "#18181b",
      textColor: "#fff",
      transitions: [{ id: `preview-${kind}`, start: 0.2, end: 1, kind, color: "accent" }],
      adjustClips: [],
    } as unknown as StyleSettings;
    let raf = 0;
    const t0 = performance.now();
    const paint = (now: number) => {
      const t = playing ? ((now - t0) / 1000) % 1.4 : 0.85;
      const b = t >= 0.6;
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, b ? "#f59e0b" : "#4338ca");
      g.addColorStop(1, b ? "#be123c" : "#0e7490");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "900 26px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b ? "B" : "A", canvas.width / 2, canvas.height / 2);
      applyTimelineFx(ctx, style, Math.min(0.999, t), 0.5);
      if (playing) raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [kind, playing]);
  return <canvas ref={ref} width={112} height={63} className="block h-auto w-full rounded-t-md" />;
}

function TransitionCard({ def }: { def: TransitionDef }) {
  const [hover, setHover] = useState(false);
  const addTransition = useProjectStore((s) => s.addTransition);
  const last = usePropUiStore((s) => s.lastTransition);
  const setLast = usePropUiStore((s) => s.setLastTransition);
  const selectFx = usePropUiStore((s) => s.selectFx);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        setLast(def.id);
        setDrag(e, { lane: "transition", kind: def.id });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={() => {
        setLast(def.id);
        const id = addTransition(def.id, now());
        if (id) selectFx({ lane: "transition", id });
      }}
      title={`${def.label}: ${def.hint} (누르면 재생 위치에, 끌어서 전환 줄에)`}
      className={`${CARD} overflow-hidden ${last === def.id ? "border-indigo-500/70" : ""}`}
    >
      <TransitionPreview kind={def.id} playing={hover} />
      <span className="block truncate px-1.5 py-1 text-[10px] text-zinc-300">{def.label}</span>
    </button>
  );
}

function TransitionsTab() {
  const [msg, flash] = useFlash();
  const last = usePropUiStore((s) => s.lastTransition);
  const count = useProjectStore((s) => s.style.transitions.length);
  const hasBeats = useProjectStore((s) => s.beats !== null);
  const groups = [...new Set(TRANSITIONS.map((t) => t.group))];
  const lastLabel = TRANSITION_BY_ID.get(last)?.label;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={SMALL}
          onClick={() => flash(`${addTransitionsAt(lineCuts(), [last])}개 넣었습니다.`)}
        >
          줄마다 {lastLabel}
        </button>
        <button
          type="button"
          className={SMALL}
          disabled={!hasBeats}
          title={hasBeats ? "" : "비트 탭에서 먼저 비트를 분석하세요"}
          onClick={() => flash(`${addTransitionsAt(barCuts() ?? [], [last])}개 넣었습니다.`)}
        >
          마디마다
        </button>
        <span className="ml-auto text-[10px] text-zinc-500">{count}개</span>
      </div>
      <Flash text={msg} />
      {groups.map((g) => (
        <div key={g} className="space-y-1">
          <p className="text-[10px] font-semibold text-zinc-500">{g}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TRANSITIONS.filter((t) => t.group === g).map((t) => (
              <TransitionCard key={t.id} def={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdjustTab() {
  const addAdjust = useProjectStore((s) => s.addAdjust);
  const selectFx = usePropUiStore((s) => s.selectFx);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        조정 레이어
        <Tip>
          조정 레이어는 정해진 구간 동안 화면 전체에 효과를 덮습니다. 누르면 재생 위치부터 4초, 지금 가사 줄
          위에 있으면 그 줄 길이만큼 들어갑니다. 양 끝을 끌어 길이를, 인스펙터에서 강도와 서서히 들어오는
          시간을 바꿉니다.
        </Tip>
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {ADJUSTS.map((a) => (
          <button
            key={a.id}
            type="button"
            draggable
            onDragStart={(e) => setDrag(e, { lane: "adjust", kind: a.id })}
            onClick={() => {
              const t = now();
              const line = useProjectStore
                .getState()
                .lines.find((l) => !l.overlap && t >= l.startTime && t < l.endTime);
              const id = addAdjust(a.id, line ? line.startTime : t, line ? line.endTime : undefined);
              if (id) selectFx({ lane: "adjust", id });
            }}
            title={a.hint}
            className={`${CARD} px-2 py-1.5`}
          >
            <span className="block text-xs text-zinc-100">{a.label}</span>
            <span className="block truncate text-[10px] text-zinc-500">{a.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BeatsTab() {
  const beats = useProjectStore((s) => s.beats);
  const hasSong = useProjectStore((s) => s.audio.kind === "upload");
  const snapToBeats = useProjectStore((s) => s.style.snapToBeats);
  const setStyle = useProjectStore((s) => s.setStyle);
  const setBeats = useProjectStore((s) => s.setBeats);
  const snapLines = useProjectStore((s) => s.snapLinesToBeats);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();
  return (
    <div className="space-y-2 text-[11px] text-zinc-400">
      <p className="flex items-center gap-1.5">
        비트 마커
        <Tip>
          음악을 분석해 비트마다 타임라인에 눈금을 세웁니다(굵은 눈금이 마디 시작). 분석은 이 브라우저
          안에서만 이뤄집니다. 비트에 붙이기를 켜면 트랜지션·일러스트 구간이 비트에 달라붙습니다.
        </Tip>
      </p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={!hasSong || busy}
          onClick={async () => {
            setBusy(true);
            try {
              flash(await runBeatAnalysis());
            } catch {
              flash("음원을 읽지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? "분석 중…" : beats ? "다시 분석" : "비트 분석하기"}
        </button>
        {beats && (
          <button type="button" className={SMALL} onClick={() => setBeats(null)}>
            마커 지우기
          </button>
        )}
      </div>
      {!hasSong && <p className="text-zinc-500">음원을 올리면 분석할 수 있습니다.</p>}
      <Flash text={msg} />
      {beats && (
        <>
          <p className="text-zinc-300">
            약 <b className="font-mono">{Math.round(beats.bpm)}</b> BPM · 비트 {beats.times.length}개 · 마디{" "}
            {beatsEvery(beats, 4).length}개
          </p>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={snapToBeats}
              onChange={(e) => setStyle({ snapToBeats: e.target.checked })}
              className="accent-indigo-500"
            />
            구간을 끌 때 비트에 붙이기
          </label>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={SMALL}
              onClick={() => flash(`${snapLines(beats.times, 0.15)}줄을 비트에 맞췄습니다.`)}
            >
              가사 줄 시작을 비트에
            </button>
            <button
              type="button"
              className={SMALL}
              onClick={() => (
                setStyle({ bpm: Math.round(beats.bpm) }),
                flash("박자 효과에 BPM을 넣었습니다.")
              )}
            >
              BPM을 박자 효과에
            </button>
          </div>
        </>
      )}
    </div>
  );
}
