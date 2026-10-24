import type { AutoContrast, LyricOrientation } from "@/types/project";
import { DEFAULT_ELEMENT_MOTION } from "@/lib/timeline-fx/defs";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

const MODES: ReadonlyArray<readonly [AutoContrast, string]> = [
  ["color", "색 맞추기"],
  ["outline", "테두리"],
  ["off", "끄기"],
];

/** Whether the lyrics keep readable on their own over light or dark backgrounds. */
export function AutoContrastControl() {
  const mode = useProjectStore((s) => s.style.autoContrast ?? "color");
  const amount = useProjectStore((s) => s.style.autoContrastAmount ?? 0.5);
  const setStyle = useProjectStore((s) => s.setStyle);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          글자 자동 대비
          <Tip>
            배경(그림·영상·테마 색)을 읽어서 가사가 묻힐 때만 가사 색을 밝게 또는 어둡게 바꾸거나(색 맞추기),
            반대색 테두리를 둘러(테두리) 잘 보이게 합니다. 잘 보이는 장면에서는 고른 색 그대로입니다. 투명
            배경으로 내보낼 때는 적용되지 않습니다.
          </Tip>
        </span>
        <span
          role="radiogroup"
          aria-label="글자 자동 대비"
          className="flex overflow-hidden rounded-md border border-zinc-800"
        >
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setStyle({ autoContrast: id })}
              className={`px-2 py-1 ${mode === id ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      {mode !== "off" && (
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="inline-flex w-14 shrink-0 items-center gap-1">
            세기
            <Tip>
              높일수록 배경과 더 확실히 구분되게 바꿉니다(색 맞추기는 더 밝게·어둡게, 테두리는 더 굵게). 50%가
              기본이고, 0%면 바꾸지 않습니다.
            </Tip>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={amount}
            onChange={(e) => setStyle({ autoContrastAmount: Number(e.target.value) })}
            aria-label="글자 자동 대비 세기"
            className="min-w-0 flex-1 accent-indigo-500"
          />
          <span className="w-10 text-right font-mono text-zinc-300">{Math.round(amount * 100)}%</span>
        </label>
      )}
    </div>
  );
}

/** One switch for the themes' decorations moving on their own (floating, hopping, drawing on). */
export function ElementMotionToggle() {
  const motion = useProjectStore((s) => s.style.elementMotion);
  const setStyle = useProjectStore((s) => s.setStyle);
  const on = motion.mode !== "still" || motion.marks > 0;
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        요소 움직임
        <Tip>
          켜면 테마의 장식(레코드, 원, 도장 등)이 한자리에 머물지 않고 떠다니거나 줄마다 자리를 옮기며 새로
          그려지고, 가장자리에 손그림 마크가 나타났다 사라집니다. 끄면 장식이 놓인 자리에 가만히 있습니다.
        </Tip>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) =>
          setStyle({
            elementMotion: e.target.checked ? DEFAULT_ELEMENT_MOTION : { ...motion, mode: "still", marks: 0 },
          })
        }
        aria-label="요소 움직임"
        className="h-4 w-4 accent-indigo-500"
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
            className={`px-2 py-1 ${value === id ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
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
        className="h-4 w-4 accent-indigo-500"
      />
    </label>
  );
}
