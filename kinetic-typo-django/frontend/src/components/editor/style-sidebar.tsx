import { useEffect, useState } from "react";
import type {
  DetailSettings,
  LookElementState,
  LookPresetId,
  StyleSettings,
  ThemeClip,
} from "@/types/project";
import { DEFAULT_DETAIL } from "@/lib/render/detail";
import {
  elementInEffect,
  getLookElement,
  getLookPreset,
  LOOK_ELEMENTS,
  isThemedPresetId,
  LOOK_PRESETS,
  lookElementKey,
  lyricLookOf,
  MAX_MIX_LOOKS,
  pickedLooks,
  type ElementRole,
  type LookElementDef,
  type ThemedPresetId,
} from "@/lib/render/looks/presets";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { setClipBase, themeClipAt, toggleClipTheme } from "@/lib/render/theme-clips";
import { usePlaybackStore } from "@/store/playback-store";
import { activeMotions, motionLabel, MOTIONS_PER_SONG, THEME_MOTIONS } from "@/lib/render/looks/motions";
import { freshSeed, mulberry32, pickSome } from "@/lib/random";
import { FEATURES_NOW } from "@/lib/mode/mode";
import { COLOR_FILTERS } from "@/lib/render/looks/color-filter";
import { AutoComposeBox } from "./auto-compose-box";
import { Fold } from "./fold";
import { Tip } from "@/components/ui/tip";
import { ELEMENT_MOTIONS } from "@/lib/timeline-fx/defs";
import type { ElementMotionMode } from "@/types/project";
import { FinishPanel } from "./finish-panel";

const COLOR_FIELDS: Array<{
  key: keyof Pick<StyleSettings, "bgColor" | "textColor" | "accentColor" | "secondaryColor">;
  label: string;
}> = [
  { key: "bgColor", label: "배경" },
  { key: "textColor", label: "가사 글자" },
  { key: "accentColor", label: "포인트" },
  { key: "secondaryColor", label: "보조" },
];

const ROLE_LABEL: Record<ElementRole, string> = {
  scene: "배경",
  decor: "장식",
  lyrics: "가사",
  overlay: "화면 효과",
};

/** When an element that is not in effect would start to apply. */
const ROLE_HINT: Partial<Record<ElementRole, string>> = {
  scene: "배경 테마일 때 적용",
  lyrics: "가사 테마일 때 적용",
};

type Tab = "theme" | "detail" | "finish";

const ON = "border-indigo-500 bg-indigo-500/10 text-zinc-100";
const OFF = "border-zinc-800 text-zinc-400 hover:border-indigo-500";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-md border border-zinc-800 text-xs">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`flex-1 px-2.5 py-1 ${value === id ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Left column. Pick up to three themes, choose which one draws the picture
 * and which one the lyrics, and switch every element of each on or off.
 * The detail tab holds glitch, shake and position; the finish tab the color grade and filters.
 */
export function StyleSidebar() {
  const [tab, setTab] = useState<Tab>("theme");
  // Picking a theme clip in the timeline opens the theme tab, where it is edited
  const themeClip = usePropUiStore((s) => s.themeClip);
  useEffect(() => {
    if (themeClip) setTab("theme");
  }, [themeClip]);
  return (
    <section className="px-4 py-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-400">영상 스타일</h2>
      <div className="space-y-3">
        <Segmented
          label="스타일 보기"
          value={tab}
          options={[
            ["theme", "테마·요소"],
            ["detail", "상세"],
            ["finish", "마무리"],
          ]}
          onChange={setTab}
        />
        {tab === "theme" ? <ThemeTab /> : tab === "detail" ? <DetailTab /> : <FinishPanel />}
      </div>
    </section>
  );
}

/**
 * All themes in a panel that folds away; a click picks or unpicks one. Picked
 * ones show their order, 1 being the background. Folded, it lists the picks.
 */
function ThemeGrid({ target }: { target: ThemeTarget }) {
  const [open, setOpen] = useState(true);
  const picked = target.picked;
  const full = picked.length > MAX_MIX_LOOKS && (target.clip !== null || !FEATURES_NOW.themeMix);
  return (
    <div className="rounded-md border border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="theme-grid"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-900/60"
      >
        <span className="shrink-0 font-semibold text-zinc-200">테마</span>
        <span className="shrink-0 font-mono text-[10px] text-zinc-500">
          {picked.length}/{MAX_MIX_LOOKS + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">
          {picked.map((id) => `${getLookPreset(id).emoji} ${getLookPreset(id).label}`).join(" · ")}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div id="theme-grid" className="space-y-1.5 border-t border-zinc-800 p-2">
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            최대 3개 · 1번이 배경
            <Tip>
              {target.clip
                ? "이 구간에 쓸 테마를 최대 3개까지 고르세요. 1번이 배경을 그립니다."
                : "최대 3개까지 고르세요. 1번이 배경을 그립니다. 모두 해제하면 기본 테마(앨범 자켓)로 돌아갑니다. 새로 고른 테마는 재생 위치의 빈 구간(테마 줄이 비어 있으면 곡 전체)에 테마 줄로 올라갑니다."}
            </Tip>
          </p>
          {/* As many columns as the sidebar width fits */}
          <div className="grid max-h-[50vh] grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1.5 overflow-y-auto pr-0.5">
            {LOOK_PRESETS.map((p) => {
              const order = picked.indexOf(p.id);
              const on = order >= 0;
              const blocked = !on && full;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => target.toggle(p.id)}
                  aria-pressed={on}
                  disabled={blocked}
                  title={p.description}
                  className={`relative rounded-md border px-2 py-1.5 text-left disabled:opacity-40 ${on ? ON : OFF}`}
                >
                  {on && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
                      {order + 1}
                    </span>
                  )}
                  <span className="block break-keep pr-5 text-xs font-semibold text-zinc-200">
                    {p.emoji} {p.label}
                  </span>
                  <span className="block break-keep text-[10px] leading-snug text-zinc-500">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const MOVE_SLIDERS: Array<{
  key: "x" | "y" | "rot";
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}> = [
  {
    key: "x",
    label: "가로",
    min: -0.6,
    max: 0.6,
    step: 0.01,
    format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`,
  },
  {
    key: "y",
    label: "세로",
    min: -0.6,
    max: 0.6,
    step: 0.01,
    format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`,
  },
  { key: "rot", label: "회전", min: -180, max: 180, step: 1, format: (v) => `${Math.round(v)}°` },
];

/** Position and turn of a movable element; a double click on a slider puts it back. */
function MoveControls({
  label,
  state,
  onChange,
}: {
  label: string;
  state: LookElementState;
  onChange: (patch: Partial<LookElementState>) => void;
}) {
  return (
    <div className="ml-5 space-y-1 rounded-md border border-zinc-800 px-2 py-1.5">
      {MOVE_SLIDERS.map((m) => (
        <label key={m.key} className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="w-8 shrink-0">{m.label}</span>
          <input
            type="range"
            min={m.min}
            max={m.max}
            step={m.step}
            value={state[m.key] ?? 0}
            onChange={(e) => onChange({ [m.key]: Number(e.target.value) })}
            onDoubleClick={() => onChange({ [m.key]: 0 })}
            aria-label={`${label} ${m.label}`}
            className="min-w-0 flex-1 accent-indigo-500"
          />
          <span className="w-10 text-right font-mono text-zinc-300">{m.format(state[m.key] ?? 0)}</span>
        </label>
      ))}
      <button
        type="button"
        onClick={() => onChange({ x: 0, y: 0, rot: 0 })}
        className="text-[11px] text-indigo-400 hover:underline"
      >
        원래 자리로
      </button>
    </div>
  );
}

/** One element switch with its strength slider; dimmed with a hint while its theme's role does not use it. */
function ElementRow({
  def,
  state,
  active,
  onChange,
}: {
  def: LookElementDef;
  state: LookElementState;
  active: boolean;
  onChange: (patch: Partial<LookElementState>) => void;
}) {
  const [moving, setMoving] = useState(false);
  const moved = (state.x ?? 0) !== 0 || (state.y ?? 0) !== 0 || (state.rot ?? 0) !== 0;
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 text-xs ${active ? "" : "opacity-50"}`}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-zinc-200">
          <input
            type="checkbox"
            checked={state.on}
            onChange={(e) => onChange({ on: e.target.checked })}
            className="accent-indigo-500"
          />
          {/* Name and role on two lines, so a narrow sidebar never hides the name */}
          <span className="min-w-0 flex-1">
            <span className="block break-keep leading-snug">{def.label}</span>
            <span className="block text-[10px] leading-tight text-zinc-500">
              {active ? ROLE_LABEL[def.role] : (ROLE_HINT[def.role] ?? ROLE_LABEL[def.role])}
            </span>
          </span>
        </label>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={state.amount}
          disabled={!state.on}
          onChange={(e) => onChange({ amount: Number(e.target.value) })}
          aria-label={`${def.label} 적용 정도`}
          className="w-20 accent-indigo-500 disabled:opacity-30"
        />
        <span className={`w-9 text-right font-mono ${state.on ? "text-zinc-300" : "text-zinc-600"}`}>
          {Math.round(state.amount * 100)}%
        </span>
        {def.move ? (
          <button
            type="button"
            onClick={() => setMoving((v) => !v)}
            aria-expanded={moving}
            aria-label={`${def.label} 위치 · 회전`}
            title="위치 · 회전"
            className={`w-6 shrink-0 rounded border text-[11px] ${
              moving || moved
                ? "border-indigo-500 text-indigo-200"
                : "border-zinc-800 text-zinc-500 hover:border-indigo-500"
            }`}
          >
            ⌖
          </button>
        ) : (
          <span aria-hidden className="w-6 shrink-0" />
        )}
      </div>
      {def.move && moving && <MoveControls label={def.label} state={state} onChange={onChange} />}
    </div>
  );
}

/** A picked theme: its roles (background, lyrics, colors) and every element it has. */
function ThemeBlock({ id, count, target }: { id: ThemedPresetId; count: number; target: ThemeTarget }) {
  const style = useProjectStore((s) => s.style);
  const setLookElement = useProjectStore((s) => s.setLookElement);
  const setStyle = useProjectStore((s) => s.setStyle);
  const applyPalette = useProjectStore((s) => s.applyPalette);
  const p = getLookPreset(id);
  const isBase = target.style.lookPreset === id;
  const isLyric = lyricLookOf(target.style) === id;

  const reset = () => {
    const prefix = lookElementKey(id, "");
    setStyle({
      lookElements: Object.fromEntries(
        Object.entries(style.lookElements).filter(([k]) => !k.startsWith(prefix)),
      ),
    });
  };
  const roleButton = (label: string, on: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-[11px] ${on ? ON : OFF}`}
    >
      {label}
    </button>
  );

  return (
    <Fold
      className="space-y-1.5 border-t border-zinc-800/70 pt-3"
      title={`${p.emoji} ${p.label}`}
      right={
        <span className="flex shrink-0 gap-2">
          <button type="button" onClick={reset} className="text-indigo-400 hover:underline">
            기본값
          </button>
          {count > 1 && (
            <button
              type="button"
              onClick={() => target.toggle(id)}
              className="text-indigo-400 hover:underline"
            >
              빼기
            </button>
          )}
        </span>
      }
    >
      <div className="flex flex-wrap gap-1">
        {roleButton(isBase ? "배경 테마" : "배경으로", isBase, () => target.setBase(id))}
        {roleButton(isLyric ? "가사 테마" : "가사로", isLyric, () => target.setLyric(isBase ? null : id))}
        {!target.clip && roleButton("이 색 쓰기", false, () => applyPalette(id))}
      </div>
      <MotionChips id={id} isLyric={isLyric} />
      {LOOK_ELEMENTS[id].map((def) => (
        <ElementRow
          key={def.id}
          def={def}
          state={getLookElement(style.lookElements, id, def.id)}
          active={elementInEffect(target.style, id, def)}
          onChange={(patch) => setLookElement(def.id, patch, id)}
        />
      ))}
    </Fold>
  );
}

/**
 * The theme's twelve lyric motions as chips: the lit ones are used (six per
 * song, picked again when another song is loaded), and a click turns one on
 * or off.
 */
function MotionChips({ id, isLyric }: { id: ThemedPresetId; isLyric: boolean }) {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const on = activeMotions(style, id);
  const save = (list: string[]) =>
    setStyle({
      motionPicks: { ...style.motionPicks, [id]: THEME_MOTIONS[id].filter((m) => list.includes(m)) },
    });
  return (
    <div className="space-y-1 rounded-md border border-zinc-800/70 px-2 py-1.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="flex-1 font-semibold text-zinc-300">
          가사 움직임 {on.length}/{THEME_MOTIONS[id].length}
          {!isLyric && <span className="ml-1 font-normal text-zinc-500">(가사 테마일 때 적용)</span>}
        </span>
        <button
          type="button"
          onClick={() => save(pickSome(THEME_MOTIONS[id], MOTIONS_PER_SONG, mulberry32(freshSeed())))}
          className="text-indigo-400 hover:underline"
        >
          🎲 섞기
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {THEME_MOTIONS[id].map((m) => {
          const lit = on.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={lit}
              onClick={() => save(lit ? on.filter((x) => x !== m) : [...on, m])}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${lit ? ON : OFF}`}
            >
              {motionLabel(m)}
            </button>
          );
        })}
      </div>
      {on.length === 0 && <p className="text-[11px] text-zinc-500">모두 끄면 테마 기본 움직임만 씁니다.</p>}
    </div>
  );
}

/**
 * What the theme tab edits: the whole video's themes, or those of the theme
 * clip picked in the timeline's theme lane.
 */
interface ThemeTarget {
  clip: ThemeClip | null;
  /** The picks as a style, for roles and which elements take effect. */
  style: StyleSettings;
  picked: LookPresetId[];
  toggle: (id: LookPresetId) => void;
  setBase: (id: ThemedPresetId) => void;
  setLyric: (id: ThemedPresetId | null) => void;
}

function useThemeTarget(): ThemeTarget {
  const style = useProjectStore((s) => s.style);
  const toggleTheme = useProjectStore((s) => s.toggleTheme);
  const setBaseLook = useProjectStore((s) => s.setBaseLook);
  const setLyricLook = useProjectStore((s) => s.setLyricLook);
  const updateThemeClip = useProjectStore((s) => s.updateThemeClip);
  const placeTheme = useProjectStore((s) => s.placeTheme);
  const selectThemeClip = usePropUiStore((s) => s.selectThemeClip);
  const clipId = usePropUiStore((s) => s.themeClip);
  const clip = style.themeClips.find((c) => c.id === clipId) ?? null;
  if (!clip)
    return {
      clip: null,
      style,
      picked: pickedLooks(style),
      toggle: (id) => {
        // With a theme timeline, a newly picked theme goes onto it at the playhead
        if (!FEATURES_NOW.themeMix || !isThemedPresetId(id) || pickedLooks(style).includes(id))
          return toggleTheme(id);
        const at = usePlaybackStore.getState().currentTime;
        const over = themeClipAt(style.themeClips, at);
        if (over) {
          updateThemeClip(over.id, toggleClipTheme(over, id));
          selectThemeClip(over.id);
          return;
        }
        const made = placeTheme(id, at);
        if (made) selectThemeClip(made);
        else toggleTheme(id);
      },
      setBase: setBaseLook,
      setLyric: setLyricLook,
    };
  const clipStyle = {
    ...style,
    lookPreset: clip.lookPreset,
    mixLooks: clip.mixLooks,
    lyricLook: clip.lyricLook,
  };
  return {
    clip,
    style: clipStyle,
    picked: pickedLooks(clipStyle),
    toggle: (id) => {
      if (isThemedPresetId(id)) updateThemeClip(clip.id, toggleClipTheme(clip, id));
    },
    setBase: (id) => updateThemeClip(clip.id, setClipBase(clip, id)),
    setLyric: (id) => updateThemeClip(clip.id, { lyricLook: id }),
  };
}

/** Shown while a theme clip is being edited: its time, and ways out. */
function ThemeClipBanner({ clip }: { clip: ThemeClip }) {
  const selectThemeClip = usePropUiStore((s) => s.selectThemeClip);
  const removeThemeClip = useProjectStore((s) => s.removeThemeClip);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/50 bg-amber-500/5 px-2.5 py-1.5 text-[11px]">
      <span className="min-w-0 flex-1 font-semibold text-amber-200">
        🎨 테마 구간 {formatLrcTime(clip.start)} ~ {formatLrcTime(clip.end)} 편집 중
      </span>
      <button
        type="button"
        onClick={() => {
          removeThemeClip(clip.id);
          selectThemeClip(null);
        }}
        className="text-indigo-400 hover:underline"
      >
        현재 구간 삭제
      </button>
      <button type="button" onClick={() => selectThemeClip(null)} className="text-indigo-400 hover:underline">
        전체 테마로
      </button>
    </div>
  );
}

/**
 * The theme colors: the whole video's, or the picked theme clip's own over
 * its background theme's palette. The subtitles keep the colors set in the
 * subtitle panel. Below, a color filter for everything but the subtitles.
 */
function ThemeColorsFold({ target }: { target: ThemeTarget }) {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const updateThemeClip = useProjectStore((s) => s.updateThemeClip);
  const applyPalette = useProjectStore((s) => s.applyPalette);
  const clip = target.clip;
  const palette = clip ? getLookPreset(clip.lookPreset).palette : null;
  const value = (key: (typeof COLOR_FIELDS)[number]["key"]) =>
    clip ? (clip.colors?.[key] ?? palette?.[key] ?? style[key]) : style[key];
  const set = (key: (typeof COLOR_FIELDS)[number]["key"], v: string) => {
    if (clip) updateThemeClip(clip.id, { colors: { ...clip.colors, [key]: v } });
    else setStyle({ [key]: v });
  };
  const reset = () => {
    if (clip) updateThemeClip(clip.id, { colors: undefined });
    else applyPalette(style.lookPreset);
  };
  const filter = style.colorFilter;
  return (
    <Fold
      className="space-y-2 border-t border-zinc-800/70 pt-3"
      title={clip ? "🎨 이 구간 테마 색상" : "🎨 테마 색상"}
      right={
        <button type="button" onClick={reset} className="text-indigo-400 hover:underline">
          테마 기본 색
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        {COLOR_FIELDS.map((c) => (
          <label key={c.key} className="inline-flex items-center gap-1.5">
            <input
              type="color"
              value={value(c.key)}
              onChange={(e) => set(c.key, e.target.value)}
              aria-label={`테마 ${c.label} 색`}
              className="h-6 w-8 cursor-pointer rounded border border-zinc-800 bg-zinc-950"
            />
            {c.label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          필터
          <Tip>
            위 색은 배경·가사 글자·장식에 쓰고, 하단 자막 색은 아래 자막 칸에서 따로 정합니다. 필터는 영상
            전체에 걸리고, 하단 자막에는 걸리지 않습니다.
          </Tip>
        </span>
        <div className="grid grid-cols-4 overflow-hidden rounded-md border border-zinc-800">
          {COLOR_FILTERS.map((f) => (
            <button
              key={f.kind}
              type="button"
              aria-pressed={filter.kind === f.kind}
              onClick={() => setStyle({ colorFilter: { ...filter, kind: f.kind } })}
              className={`px-2 py-1 ${filter.kind === f.kind ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filter.kind !== "none" && (
          <label className="flex items-center gap-1.5">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={filter.amount}
              onChange={(e) => setStyle({ colorFilter: { ...filter, amount: Number(e.target.value) } })}
              aria-label="필터 강도"
              className="w-20 accent-indigo-500"
            />
            <span className="w-8 font-mono text-zinc-300">{Math.round(filter.amount * 100)}%</span>
          </label>
        )}
      </div>
    </Fold>
  );
}

/**
 * How the themes' decorations move on their own, so they do not sit in the
 * same place all song: drift, hop to a new spot each line, draw themselves on,
 * or a mix of all three, plus hand-drawn marks that come and go around the
 * edges. Also where the lyrics sit from line to line and how they leave.
 */
function ElementMotionFold() {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const em = style.elementMotion;
  const set = (patch: Partial<typeof em>) => setStyle({ elementMotion: { ...em, ...patch } });
  const row = (label: string, value: number, onChange: (v: number) => void, tip?: string) => (
    <label className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="inline-flex w-24 shrink-0 items-center gap-1">
        {label}
        {tip && <Tip>{tip}</Tip>}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="min-w-0 flex-1 accent-indigo-500"
      />
      <span className="w-10 text-right font-mono text-zinc-300">{Math.round(value * 100)}%</span>
    </label>
  );
  return (
    <Fold
      className="space-y-2 border-t border-zinc-800/70 pt-3"
      title="✎ 요소 움직임 · 가사 배치"
      defaultOpen={false}
    >
      <div className="flex flex-wrap gap-1">
        {ELEMENT_MOTIONS.map(([mode, label, hint]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={em.mode === mode}
            title={hint}
            onClick={() => set({ mode: mode as ElementMotionMode })}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${em.mode === mode ? ON : OFF}`}
          >
            {label}
          </button>
        ))}
      </div>
      {em.mode !== "still" && row("움직임 크기", em.amount, (amount) => set({ amount }))}
      {row(
        "손그림 마크",
        em.marks,
        (marks) => set({ marks }),
        "가장자리에 동그라미·밑줄·별 같은 손그림이 줄마다 다른 곳에 그려졌다 사라집니다. 0이면 그리지 않습니다.",
      )}
      {row(
        "가사 자리 옮기기",
        style.lyricRoam,
        (lyricRoam) => setStyle({ lyricRoam }),
        "줄이 바뀔 때마다 가사가 화면의 다른 자리에 놓입니다. 0이면 늘 같은 자리입니다.",
      )}
      <label className="flex items-center gap-2 text-xs text-zinc-200">
        <input
          type="checkbox"
          checked={style.exitMotion}
          onChange={(e) => setStyle({ exitMotion: e.target.checked })}
          className="accent-indigo-500"
        />
        가사가 나갈 때도 움직임
        <Tip>줄이 끝날 때 등장 움직임에 맞춰 날아가거나 접히며 사라집니다. 끄면 흐려지며 사라집니다.</Tip>
      </label>
    </Fold>
  );
}

function ThemeTab() {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const target = useThemeTarget();
  const picked = target.picked;

  return (
    <div className="space-y-3">
      {target.clip && <ThemeClipBanner clip={target.clip} />}
      {!target.clip && FEATURES_NOW.themeMix && <AutoComposeBox />}
      <ThemeGrid target={target} />
      <ThemeColorsFold target={target} />
      {!target.clip && <ElementMotionFold />}
      {picked.some((id) => isThemedPresetId(id) && LOOK_ELEMENTS[id].some((d) => d.move)) && (
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          ⌖ 요소는 옮기고 돌릴 수 있음
          <Tip>⌖ 표시가 있는 요소(레코드, 커버, 원, 낙관 등)는 눌러서 위치를 옮기고 돌릴 수 있습니다.</Tip>
        </p>
      )}

      {picked.map((id: LookPresetId) =>
        isThemedPresetId(id) ? <ThemeBlock key={id} id={id} count={picked.length} target={target} /> : null,
      )}

      {picked.includes("album_jacket") && (
        <Fold
          className="space-y-1.5 border-t border-zinc-800/70 pt-3"
          title="앨범 자켓 제목 · 크레딧"
          right={
            <Tip>
              앨범 자켓: 오른쪽 일러스트 칸에서 앨범 커버를 따로 올릴 수 있고, 없으면 배경 이미지가 커버로
              쓰입니다. 제목을 비워 두면 제목 줄은 그리지 않습니다.
            </Tip>
          }
        >
          <input
            value={style.coverTitle}
            onChange={(e) => setStyle({ coverTitle: e.target.value })}
            placeholder="곡 제목"
            aria-label="곡 제목"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
          <input
            value={style.coverCredit}
            onChange={(e) => setStyle({ coverCredit: e.target.value })}
            placeholder="크레딧 (예: Vocal 이름 / Mix 이름)"
            aria-label="크레딧"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </Fold>
      )}
    </div>
  );
}

const DETAIL_SLIDERS: Array<{
  key: keyof DetailSettings;
  label: string;
  min: number;
  max: number;
  format: (v: number) => string;
}> = [
  { key: "glitch", label: "글리치 강도", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  { key: "shake", label: "흔들림 강도", min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
];

const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function DetailTab() {
  const detail = useProjectStore((s) => s.style.detail);
  const setDetail = useProjectStore((s) => s.setDetail);
  const frameStep = useProjectStore((s) => s.style.frameStep);
  const centerClear = useProjectStore((s) => s.style.centerClear);
  const setStyle = useProjectStore((s) => s.setStyle);

  const slider = (
    key: keyof DetailSettings,
    label: string,
    min: number,
    max: number,
    format: (v: number) => string,
  ) => (
    <label key={key} className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={detail[key]}
        onChange={(e) => setDetail({ [key]: Number(e.target.value) })}
        onDoubleClick={() => setDetail({ [key]: DEFAULT_DETAIL[key] })}
        aria-label={label}
        className="min-w-0 flex-1 accent-indigo-500"
      />
      <span className="w-11 text-right font-mono text-zinc-300">{format(detail[key])}</span>
    </label>
  );

  return (
    <div className="space-y-3">
      <Fold
        title="효과"
        className="space-y-2"
        right={
          <Tip>
            글리치는 슬라이스, RGB 분리, 화면 밀림에 걸립니다. 흔들림은 카메라 기울기, 창 흔들림, 캐릭터
            흔들림에 걸리고,
            {` ${Math.round(DEFAULT_DETAIL.shake * 100)}%`}보다 올리면 비트마다 화면 전체가 흔들립니다.
          </Tip>
        }
      >
        {DETAIL_SLIDERS.map((d) => slider(d.key, d.label, d.min, d.max, d.format))}
      </Fold>

      <Fold title="움직임 느낌 · 배치" className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="w-24 shrink-0">움직임 끊기</span>
          <div role="radiogroup" aria-label="움직임 끊기" className="flex rounded-md border border-zinc-800">
            {(
              [
                [1, "부드럽게"],
                [2, "2프레임"],
                [3, "3프레임"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={frameStep === v}
                onClick={() => setStyle({ frameStep: v })}
                className={`px-2 py-1 ${frameStep === v ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Tip>
            2·3프레임은 움직임을 24fps 기준 두세 장씩 멈췄다 넘겨 손그림 애니메이션 같은 느낌을 냅니다.
          </Tip>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-200">
          <input
            type="checkbox"
            checked={centerClear}
            onChange={(e) => setStyle({ centerClear: e.target.checked })}
            className="accent-indigo-500"
          />
          가운데 비우기
          <Tip>
            화면 가운데를 캐릭터 자리로 비우고, 가사를 줄마다 왼쪽·오른쪽(세로 화면은 위·아래)으로 번갈아
            놓습니다.
          </Tip>
        </label>
      </Fold>

      <Fold
        title="가사 위치 (전체)"
        right={
          <span className="flex items-center gap-2">
            <Tip>
              줄마다 따로 옮기려면 아래 타임라인에서 자막 구간을 고르세요. 줄별 위치는 여기 전체 위치에
              더해집니다.
            </Tip>
            <button
              type="button"
              onClick={() => setDetail({ lyricX: 0, lyricY: 0 })}
              className="text-indigo-400 hover:underline"
            >
              가운데로
            </button>
          </span>
        }
      >
        {slider("lyricX", "가로", -0.5, 0.5, signedPct)}
        {slider("lyricY", "세로", -0.5, 0.5, signedPct)}
      </Fold>

      <Fold
        title="하단 자막 위치"
        right={
          <button
            type="button"
            onClick={() => setDetail({ subtitleX: 0, subtitleY: 0 })}
            className="text-indigo-400 hover:underline"
          >
            원래대로
          </button>
        }
      >
        {slider("subtitleX", "가로", -0.5, 0.5, signedPct)}
        {slider("subtitleY", "세로", -0.5, 0.5, signedPct)}
      </Fold>
    </div>
  );
}
