import { useId } from "react";
import type { AutoContrast, LookPresetId, LyricOrientation, ThemeContrast } from "@/types/project";
import { getLookPreset, lyricLookOf } from "@/lib/render/looks/presets";
import { contrastFor } from "@/lib/render/looks/theme-contrast";
import { DEFAULT_ELEMENT_MOTION } from "@/lib/timeline-fx/defs";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";
import { LYRIC_GLASS } from "@/lib/render/looks/lyric-surface";

// Shared row layout for the theme color panel: a fixed label column, then the
// control, so every label and every control starts on the same line. Controls
// are 32px tall like the auto-compose box.
const ROW = "grid items-center gap-x-2 gap-y-2 text-xs";
export const FIELD_ROW = `${ROW} grid-cols-[3.5rem_minmax(0,1fr)]`;
/** The same row with room for longer labels such as "가사 자리 옮기기". */
export const FIELD_ROW_WIDE = `${ROW} grid-cols-[6.5rem_minmax(0,1fr)]`;
export const FIELD_LABEL = "inline-flex min-w-0 items-center gap-1 text-zinc-400";
export const SEGMENTS = "grid h-8 overflow-hidden rounded-md border border-zinc-800";
export const segmentClass = (on: boolean) =>
  `min-w-0 truncate px-1 focus-visible:relative focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tide-400 ${
    on ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
  }`;
export const SLIDER_CELL = "flex h-8 min-w-0 items-center gap-2";
export const SLIDER_VALUE = "w-10 shrink-0 text-right font-mono tabular-nums text-zinc-300";
export const SWATCH =
  "h-8 w-full cursor-pointer rounded-md border border-zinc-800 bg-zinc-950 p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tide-400";

const MODES: ReadonlyArray<readonly [AutoContrast, string]> = [
  ["color", "색 맞추기"],
  ["outline", "테두리"],
  ["off", "끄기"],
];

/**
 * Whether a theme's lyrics keep readable on their own over light or dark
 * backgrounds. Each theme keeps its own setting; `preset` is the theme whose
 * lyrics are edited (the whole video's lyric theme when missing).
 */
export function AutoContrastControl({ preset }: { preset?: LookPresetId }) {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const theme = preset ?? lyricLookOf(style);
  const { mode, amount } = contrastFor(style, theme);
  const own = style.themeContrast?.[theme] !== undefined;
  const amountId = useId();
  const set = (patch: Partial<ThemeContrast>) =>
    setStyle({ themeContrast: { ...style.themeContrast, [theme]: { mode, amount, ...patch } } });
  const reset = () => {
    const next = { ...style.themeContrast };
    delete next[theme];
    setStyle({ themeContrast: next });
  };
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-zinc-400">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-zinc-300">글자 자동 대비</span>
          <span className="truncate">· {getLookPreset(theme).label}</span>
          <Tip>
            배경(그림·영상·테마 색)을 읽어서 가사가 묻힐 때만 가사 색을 밝게 또는 어둡게 바꾸거나(색 맞추기),
            반대색 테두리를 둘러(테두리) 잘 보이게 합니다. 잘 보이는 장면에서는 고른 색 그대로입니다. 테마마다
            따로 저장되어, 타임라인에서 테마가 바뀌면 그 테마의 설정으로 바뀝니다. 테마마다 어울리는 기본값이
            있고(빛나는 글자는 테두리, 단색 포스터형은 끄기), &apos;테마 기본&apos;으로 되돌립니다. 투명
            배경으로 내보낼 때는 적용되지 않습니다.
          </Tip>
        </span>
        {own && (
          <button type="button" onClick={reset} className="shrink-0 text-xs text-tide-400 hover:underline">
            테마 기본
          </button>
        )}
      </div>
      <div className={FIELD_ROW}>
        <span className={FIELD_LABEL}>방식</span>
        <div role="radiogroup" aria-label="글자 자동 대비" className={`${SEGMENTS} grid-cols-3`}>
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => set({ mode: id })}
              className={segmentClass(mode === id)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode !== "off" && (
          <>
            <span className={FIELD_LABEL}>
              <label htmlFor={amountId}>세기</label>
              <Tip>
                높일수록 배경과 더 확실히 구분되게 바꿉니다(색 맞추기는 더 밝게·어둡게, 테두리는 더 굵게).
                50%가 기본이고, 0%면 바꾸지 않습니다.
              </Tip>
            </span>
            <div className={SLIDER_CELL}>
              <input
                id={amountId}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={amount}
                onChange={(e) => set({ amount: Number(e.target.value) })}
                aria-label="글자 자동 대비 세기"
                className="min-w-0 flex-1 accent-tide-500"
              />
              <span className={SLIDER_VALUE}>{Math.round(amount * 100)}%</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One switch for the themes' decorations moving on their own (floating, hopping, drawing on). */
export function ElementMotionToggle() {
  const motion = useProjectStore((s) => s.style.elementMotion);
  const setStyle = useProjectStore((s) => s.setStyle);
  const on = motion.mode !== "still";
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        요소 움직임
        <Tip>
          켜면 테마의 장식(레코드, 원, 도장 등)이 한자리에 머물지 않고 떠다니거나 줄마다 자리를 옮기며 새로
          그려집니다. 끄면 장식이 놓인 자리에 가만히 있습니다.
        </Tip>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) =>
          setStyle({
            elementMotion: e.target.checked ? DEFAULT_ELEMENT_MOTION : { ...motion, mode: "still" },
          })
        }
        aria-label="요소 움직임"
        className="h-4 w-4 accent-tide-500"
      />
    </label>
  );
}

export const ORIENTATIONS: ReadonlyArray<readonly [LyricOrientation, string]> = [
  ["auto", "테마대로"],
  ["horizontal", "가로"],
  ["vertical", "세로"],
];

/** Lyrics across or in columns for the whole video; each line can still pick its own on the timeline. */
export function LyricOrientationControl() {
  const value = useProjectStore((s) => s.style.lyricOrientation ?? "auto");
  const setStyle = useProjectStore((s) => s.setStyle);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        가사 방향
        <Tip>
          가사를 가로로 쓸지 세로로(위에서 아래로, 오른쪽 줄부터) 쓸지 정합니다. &apos;테마대로&apos;는
          테마마다 정해 둔 방향입니다. 테마와 다른 방향을 고르면 그 테마 색으로 기본 배치를 씁니다. 줄마다
          따로 정하려면 타임라인에서 줄을 골라 &apos;이 줄 스타일&apos;의 방향을 바꾸세요.
        </Tip>
      </span>
      <span
        role="radiogroup"
        aria-label="가사 방향"
        className="flex overflow-hidden rounded-md border border-zinc-800"
      >
        {ORIENTATIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => setStyle({ lyricOrientation: id })}
            className={`px-2 py-1 ${value === id ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            {label}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * One switch that stills everything left shaking after the shake sliders are
 * down: beat pulses, the jolt of flash lines, hand-drawn boil, illustration
 * sway, camera shake clips and film gate weave.
 */
export function NoVibrationToggle() {
  const on = useProjectStore((s) => s.style.noVibration === true);
  const setStyle = useProjectStore((s) => s.setStyle);
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        진동 모두 끄기
        <Tip>
          흔들림을 0으로 내려도 남는 떨림을 한 번에 없앱니다. 비트에 맞춰 튀고 커지는 움직임, 강조 줄(!)의
          화면 튐, 손그림 테두리의 떨림, 일러스트 흔들림, 타임라인의 카메라 흔들림 구간, 필름 화면 흔들림이
          모두 멈춥니다. 가사 등장 움직임과 요소 움직임은 각자 설정을 따릅니다.
        </Tip>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => setStyle({ noVibration: e.target.checked })}
        aria-label="진동 모두 끄기"
        className="h-4 w-4 accent-tide-500"
      />
    </label>
  );
}

/** What the lyrics sit on: a glass pane behind each line, and how far the line stands out in depth. */
export function LyricSurfaceControl() {
  const glass = useProjectStore((s) => s.style.lyricGlass ?? "off");
  const depth = useProjectStore((s) => s.style.lyricDepth ?? 0);
  const setStyle = useProjectStore((s) => s.setStyle);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          유리판
          <Tip>
            줄마다 가사 뒤에 둥근 유리판을 깝니다. 판 가장자리가 렌즈처럼 뒤 그림을 휘게 하고, 위쪽 테두리에
            빛이 맺힙니다. 맑은 유리는 뒤가 비쳐 보이고, 젖빛 유리는 뒤를 흐리게 가려 글자가 더 잘 읽힙니다.
          </Tip>
        </span>
        <span
          role="radiogroup"
          aria-label="유리판"
          className="flex overflow-hidden rounded-md border border-zinc-800"
        >
          {LYRIC_GLASS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={glass === id}
              onClick={() => setStyle({ lyricGlass: id })}
              className={`px-2 py-1 ${glass === id ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="inline-flex w-14 shrink-0 items-center gap-1">
          깊이감
          <Tip>
            가사를 공간에 놓인 카드처럼 보이게 합니다. 줄이 시작될 때 멀리서 기울어진 채 다가와 자리를 잡고,
            부르는 동안 천천히 흔들리며 조금씩 가까워집니다. 뒤 배경은 초점이 빠진 것처럼 흐려집니다. 0%면
            평평한 원래 모습입니다.
          </Tip>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={depth}
          onChange={(e) => setStyle({ lyricDepth: Number(e.target.value) })}
          onDoubleClick={() => setStyle({ lyricDepth: 0 })}
          aria-label="가사 깊이감"
          className="min-w-0 flex-1 accent-tide-500"
        />
        <span className="w-10 text-right font-mono text-zinc-300">{Math.round(depth * 100)}%</span>
      </label>
    </div>
  );
}
