import type { TransitionKind } from "@/types/project";
import { useProjectStore } from "@/store/project-store";
import { usePlaybackStore } from "@/store/playback-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { useLayoutStore } from "@/store/layout-store";
import { beatsEvery } from "@/lib/beats/detect";
import { analyzeSongBeats } from "@/lib/beats/analyze";
import { makeSfxClip, soundLength } from "@/lib/sfx/library";
import { fitClip, sortClips } from "@/lib/props/clips";
import { sanitizeElementMotion, TRANSITION_BY_ID, transitionsAtCuts } from "@/lib/timeline-fx/defs";
import { MOTION_PACKS, SFX_FOR_TRANSITION, type MotionPack } from "@/lib/timeline-fx/packs";
import { DEFAULT_FINISH, sanitizeFinish } from "@/lib/render/finish/settings";
import type { FilterId } from "@/types/finish";

// Repeated editing steps done in one go (the workspace-shortcut idea of
// workflow extensions): each action reads and writes the stores directly,
// and the command palette, right-click menus and panels all call these.

export interface QuickAction {
  id: string;
  label: string;
  group: "트랜지션" | "효과음" | "조정 레이어" | "비트" | "가사" | "모션 팩" | "화면";
  /** Short note shown on the right of the palette. */
  hint?: string;
  run: () => void | Promise<void>;
  enabled?: () => boolean;
}

const project = () => useProjectStore.getState();
const now = () => usePlaybackStore.getState().currentTime;

/** Where the lyric lines change: every ordinary line's start after the first. */
export function lineCuts(): number[] {
  const lines = project().lines.filter((l) => !l.overlap);
  return lines.slice(1).map((l) => l.startTime);
}

/** Bar starts from the found beats, or null without beats. */
export function barCuts(): number[] | null {
  const b = project().beats;
  return b ? beatsEvery(b, 4) : null;
}

export function addTransitionsAt(
  cuts: readonly number[],
  kinds: readonly TransitionKind[],
  color?: "accent" | "bg" | "white" | "black",
): number {
  const s = project();
  const before = s.style.transitions ?? [];
  let next = transitionsAtCuts(before, cuts, kinds, s.duration);
  if (color) {
    const old = new Set(before.map((c) => c.id));
    next = next.map((c) => (old.has(c.id) ? c : { ...c, color }));
  }
  s.setTransitions(next);
  return next.length - before.length;
}

/** A matching sound effect at the start of every transition that has none. */
export function sfxOnTransitions(fixed?: string): number {
  const s = project();
  let clips = [...s.sfx];
  let added = 0;
  for (const tr of s.style.transitions ?? []) {
    const sound = fixed ?? SFX_FOR_TRANSITION[tr.kind];
    const len = soundLength(sound, s.sounds) ?? 0.5;
    // Lead into the cut: the sound peaks around the transition's middle
    const at = Math.max(0, (tr.start + tr.end) / 2 - Math.min(len * 0.55, 0.6));
    if (clips.some((c) => at < c.end && at + len > c.start)) continue;
    const made = makeSfxClip(sound, at, len, s.duration);
    clips = sortClips([...clips, fitClip(made, made, clips, s.duration)]);
    added++;
  }
  s.setSfxClips(clips);
  return added;
}

export async function runBeatAnalysis(): Promise<string> {
  const s = project();
  if (s.audio.kind !== "upload") return "먼저 음원을 올려 주세요.";
  const grid = await analyzeSongBeats(s.audio);
  if (!grid || grid.times.length === 0) return "비트를 찾지 못했습니다.";
  project().setBeats(grid);
  return `비트 ${grid.times.length}개를 찾았습니다 (약 ${Math.round(grid.bpm)} BPM).`;
}

export function applyPack(pack: MotionPack): string {
  const s = project();
  const cuts = pack.on === "bars" ? (barCuts() ?? lineCuts()) : lineCuts();
  s.setTransitions([]);
  addTransitionsAt(cuts, pack.transitions, pack.color);
  if (pack.sfx !== null) sfxOnTransitions(pack.sfx);
  const base = sanitizeFinish(s.style.finish);
  const { filterAmounts, ...rest } = pack.finish;
  const filters = { ...base.filters };
  for (const [id, amount] of Object.entries(filterAmounts ?? {}))
    filters[id as FilterId] = { on: true, amount: amount ?? 0.5 };
  project().setStyle({
    elementMotion: sanitizeElementMotion(pack.element),
    lyricRoam: pack.lyricRoam,
    exitMotion: true,
    finish: { ...base, ...rest, filters },
  });
  return `'${pack.label}' 팩을 적용했습니다.`;
}

export function quickActions(): QuickAction[] {
  const ui = usePropUiStore.getState();
  const layout = useLayoutStore.getState();
  const hasBeats = () => project().beats !== null;
  const hasSong = () => project().audio.kind === "upload";
  const lastLabel = TRANSITION_BY_ID.get(ui.lastTransition)?.label ?? "";
  return [
    {
      id: "tr.here",
      label: `재생 위치에 트랜지션 (${lastLabel})`,
      group: "트랜지션",
      hint: "T",
      run: () => {
        const id = project().addTransition(usePropUiStore.getState().lastTransition, now());
        if (id) usePropUiStore.getState().selectFx({ lane: "transition", id });
      },
    },
    {
      id: "tr.lines",
      label: "가사 줄이 바뀌는 곳마다 트랜지션",
      group: "트랜지션",
      run: () => void addTransitionsAt(lineCuts(), [usePropUiStore.getState().lastTransition]),
    },
    {
      id: "tr.lines.mix",
      label: "가사 줄마다 트랜지션 (여러 종류 섞기)",
      group: "트랜지션",
      run: () => void addTransitionsAt(lineCuts(), ["whip", "zoom", "flash", "glitch", "circle", "diagonal"]),
    },
    {
      id: "tr.bars",
      label: "마디마다 트랜지션 (비트 분석 필요)",
      group: "트랜지션",
      enabled: hasBeats,
      run: () => void addTransitionsAt(barCuts() ?? [], [usePropUiStore.getState().lastTransition]),
    },
    {
      id: "tr.clear",
      label: "트랜지션 모두 지우기",
      group: "트랜지션",
      run: () => project().setTransitions([]),
    },
    {
      id: "sfx.tr",
      label: "트랜지션마다 어울리는 효과음 붙이기",
      group: "효과음",
      run: () => void sfxOnTransitions(),
    },
    {
      id: "sfx.here",
      label: "재생 위치에 '휙' 효과음",
      group: "효과음",
      hint: "W",
      run: () => {
        const id = project().addSfx("whoosh_soft", now(), soundLength("whoosh_soft", []) ?? 0.7);
        if (id) usePropUiStore.getState().selectFx({ lane: "sfx", id });
      },
    },
    { id: "sfx.clear", label: "효과음 모두 지우기", group: "효과음", run: () => project().setSfxClips([]) },
    {
      id: "adj.here",
      label: "재생 위치에 조정 레이어 (카메라 흔들림)",
      group: "조정 레이어",
      hint: "A",
      run: () => {
        const id = project().addAdjust("shake", now());
        if (id) usePropUiStore.getState().selectFx({ lane: "adjust", id });
      },
    },
    {
      id: "adj.line",
      label: "지금 줄 구간에 조정 레이어 (흑백)",
      group: "조정 레이어",
      run: () => {
        const t = now();
        const line = project().lines.find((l) => !l.overlap && t >= l.startTime && t < l.endTime);
        if (!line) return;
        const id = project().addAdjust("mono", line.startTime, line.endTime);
        if (id) usePropUiStore.getState().selectFx({ lane: "adjust", id });
      },
    },
    {
      id: "beat.run",
      label: "비트 분석하기",
      group: "비트",
      enabled: hasSong,
      run: async () => void (await runBeatAnalysis()),
    },
    {
      id: "beat.snap",
      label: "가사 줄 시작을 가까운 비트에 맞추기",
      group: "비트",
      enabled: hasBeats,
      run: () => void project().snapLinesToBeats(project().beats?.times ?? [], 0.15),
    },
    {
      id: "beat.bpm",
      label: "찾은 BPM을 박자 효과에 쓰기",
      group: "비트",
      enabled: hasBeats,
      run: () => {
        const b = project().beats;
        if (b) project().setStyle({ bpm: Math.round(b.bpm) });
      },
    },
    {
      id: "beat.snapOn",
      label: project().style.snapToBeats ? "구간 끌 때 비트에 붙이기 끄기" : "구간 끌 때 비트에 붙이기 켜기",
      group: "비트",
      enabled: hasBeats,
      run: () => project().setStyle({ snapToBeats: !project().style.snapToBeats }),
    },
    ...MOTION_PACKS.map((p): QuickAction => ({
      id: `pack.${p.id}`,
      label: `모션 팩: ${p.label}`,
      group: "모션 팩",
      run: () => void applyPack(p),
    })),
    {
      id: "finish.reset",
      label: "마무리 색 보정 모두 초기화",
      group: "화면",
      run: () => project().setStyle({ finish: DEFAULT_FINISH }),
    },
    {
      id: "layout.standard",
      label: "레이아웃: 기본",
      group: "화면",
      run: () => layout.set({ preset: "standard", leftOpen: true, rightOpen: true }),
    },
    {
      id: "layout.preview",
      label: "레이아웃: 미리보기 크게",
      group: "화면",
      run: () => layout.set({ preset: "preview" }),
    },
    {
      id: "layout.timeline",
      label: "레이아웃: 타임라인 크게",
      group: "화면",
      run: () => layout.set({ preset: "timeline" }),
    },
    {
      id: "contrast",
      label: layout.contrast === "high" ? "대비: 보통으로" : "대비: 높게",
      group: "화면",
      run: () => layout.set({ contrast: layout.contrast === "high" ? "normal" : "high" }),
    },
  ];
}
