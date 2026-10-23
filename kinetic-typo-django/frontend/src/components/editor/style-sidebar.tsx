import { useState } from "react";
import type { DetailSettings, LookElementState, LookPresetId, StyleSettings } from "@/types/project";
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
import { FinishPanel } from "./finish-panel";

const COLOR_FIELDS: Array<{
  key: keyof Pick<StyleSettings, "bgColor" | "textColor" | "accentColor" | "secondaryColor">;
  label: string;
}> = [
  { key: "bgColor", label: "배경" },
  { key: "textColor", label: "글자" },
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
function ThemeGrid() {
  const style = useProjectStore((s) => s.style);
  const toggleTheme = useProjectStore((s) => s.toggleTheme);
  const [open, setOpen] = useState(true);
  const picked = pickedLooks(style);
  const full = picked.length > MAX_MIX_LOOKS;
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
          <p className="text-[11px] leading-snug text-zinc-500">
            최대 3개까지 고르세요. 1번이 배경을 그립니다. 모두 해제하면 기본 테마(앨범 자켓)로 돌아갑니다.
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
                  onClick={() => toggleTheme(p.id)}
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
function ThemeBlock({ id, count }: { id: ThemedPresetId; count: number }) {
  const style = useProjectStore((s) => s.style);
  const setLookElement = useProjectStore((s) => s.setLookElement);
  const setStyle = useProjectStore((s) => s.setStyle);
  const setBaseLook = useProjectStore((s) => s.setBaseLook);
  const setLyricLook = useProjectStore((s) => s.setLyricLook);
  const applyPalette = useProjectStore((s) => s.applyPalette);
  const toggleTheme = useProjectStore((s) => s.toggleTheme);
  const p = getLookPreset(id);
  const isBase = style.lookPreset === id;
  const isLyric = lyricLookOf(style) === id;

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
    <div className="space-y-1.5 border-t border-zinc-800/70 pt-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
        <span className="truncate font-semibold text-zinc-200">
          {p.emoji} {p.label}
        </span>
        <span className="flex shrink-0 gap-2">
          <button type="button" onClick={reset} className="text-indigo-400 hover:underline">
            기본값
          </button>
          {count > 1 && (
            <button type="button" onClick={() => toggleTheme(id)} className="text-indigo-400 hover:underline">
              빼기
            </button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {roleButton(isBase ? "배경 테마" : "배경으로", isBase, () => setBaseLook(id))}
        {roleButton(isLyric ? "가사 테마" : "가사로", isLyric, () => setLyricLook(isBase ? null : id))}
        {roleButton("이 색 쓰기", false, () => applyPalette(id))}
      </div>
      {LOOK_ELEMENTS[id].map((def) => (
        <ElementRow
          key={def.id}
          def={def}
          state={getLookElement(style.lookElements, id, def.id)}
          active={elementInEffect(style, id, def)}
          onChange={(patch) => setLookElement(def.id, patch, id)}
        />
      ))}
    </div>
  );
}

function ThemeTab() {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const picked = pickedLooks(style);

  return (
    <div className="space-y-3">
      <ThemeGrid />
      {picked.some((id) => isThemedPresetId(id) && LOOK_ELEMENTS[id].some((d) => d.move)) && (
        <p className="text-[11px] leading-snug text-zinc-500">
          ⌖ 표시가 있는 요소(레코드, 커버, 원, 낙관 등)는 눌러서 위치를 옮기고 돌릴 수 있습니다.
        </p>
      )}

      {picked.map((id: LookPresetId) =>
        isThemedPresetId(id) ? <ThemeBlock key={id} id={id} count={picked.length} /> : null,
      )}

      {picked.includes("album_jacket") && (
        <div className="space-y-1.5 border-t border-zinc-800/70 pt-3">
          <p className="text-[11px] leading-snug text-zinc-500">
            앨범 자켓: 오른쪽 일러스트 칸에서 앨범 커버를 따로 올릴 수 있고, 없으면 배경 이미지가 커버로
            쓰입니다. 제목을 비워 두면 제목 줄은 그리지 않습니다.
          </p>
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
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/70 pt-3 text-xs text-zinc-400">
        {COLOR_FIELDS.map((c) => (
          <label key={c.key} className="inline-flex items-center gap-1.5">
            <input
              type="color"
              value={style[c.key]}
              onChange={(e) => setStyle({ [c.key]: e.target.value })}
              aria-label={`${c.label} 색`}
              className="h-6 w-8 cursor-pointer rounded border border-zinc-800 bg-zinc-950"
            />
            {c.label}
          </label>
        ))}
      </div>
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
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-zinc-400">효과</p>
        {DETAIL_SLIDERS.map((d) => slider(d.key, d.label, d.min, d.max, d.format))}
        <p className="text-[11px] leading-snug text-zinc-500">
          글리치는 슬라이스, RGB 분리, 화면 밀림에 걸립니다. 흔들림은 카메라 기울기, 창 흔들림, 캐릭터
          흔들림에 걸리고,
          {` ${Math.round(DEFAULT_DETAIL.shake * 100)}%`}보다 올리면 비트마다 화면 전체가 흔들립니다.
        </p>
      </div>

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="font-semibold">가사 위치 (전체)</span>
          <button
            type="button"
            onClick={() => setDetail({ lyricX: 0, lyricY: 0 })}
            className="text-indigo-400 hover:underline"
          >
            가운데로
          </button>
        </div>
        {slider("lyricX", "가로", -0.5, 0.5, signedPct)}
        {slider("lyricY", "세로", -0.5, 0.5, signedPct)}
        <p className="text-[11px] leading-snug text-zinc-500">
          줄마다 따로 옮기려면 아래 타임라인에서 자막 구간을 고르세요. 줄별 위치는 여기 전체 위치에
          더해집니다.
        </p>
      </div>

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="font-semibold">하단 자막 위치</span>
          <button
            type="button"
            onClick={() => setDetail({ subtitleX: 0, subtitleY: 0 })}
            className="text-indigo-400 hover:underline"
          >
            원래대로
          </button>
        </div>
        {slider("subtitleX", "가로", -0.5, 0.5, signedPct)}
        {slider("subtitleY", "세로", -0.5, 0.5, signedPct)}
      </div>
    </div>
  );
}
