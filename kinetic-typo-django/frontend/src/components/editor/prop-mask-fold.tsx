import type { PropMask } from "@/types/project";
import { DEFAULT_PROP_MASK } from "@/lib/render/looks/prop-mask";
import { Tip } from "@/components/ui/tip";
import { Fold } from "./fold";

const CHIP_ON = "border-indigo-500 bg-indigo-500/15 text-zinc-100";
const CHIP_OFF = "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200";

const SLIDERS: ReadonlyArray<{
  key: "x" | "y" | "w" | "h" | "feather";
  label: string;
  min: number;
  max: number;
}> = [
  { key: "x", label: "가로 위치", min: 0, max: 1 },
  { key: "y", label: "세로 위치", min: 0, max: 1 },
  { key: "w", label: "너비", min: 0.02, max: 1.5 },
  { key: "h", label: "높이", min: 0.02, max: 1.5 },
  { key: "feather", label: "부드러움", min: 0, max: 1 },
];

function Chips<T extends string>({
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
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-400"
    >
      <span className="w-14 shrink-0">{label}</span>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`rounded-full border px-2 py-0.5 ${value === id ? CHIP_ON : CHIP_OFF}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Masking for the picked illustration clip: an area (rectangle or ellipse)
 * in the picture whose inside or outside is cut away, with a soft edge, and
 * the cut part filled with a chosen color or left see-through.
 */
export function PropMaskFold({
  mask,
  onChange,
}: {
  mask: PropMask | undefined;
  onChange: (m: PropMask) => void;
}) {
  const m = mask ?? { ...DEFAULT_PROP_MASK, on: false };
  const set = (patch: Partial<PropMask>) => onChange({ ...m, ...patch });
  return (
    <Fold
      title="마스킹"
      defaultOpen={m.on}
      className="space-y-1.5 border-t border-zinc-800/70 pt-2"
      right={
        <span className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-zinc-300">
            <input
              type="checkbox"
              checked={m.on}
              onChange={(e) => set({ on: e.target.checked })}
              className="accent-indigo-500"
            />
            마스킹 사용
          </label>
          <Tip>
            일러스트의 일부를 가리거나(사각·원 모양) 그 부분만 남깁니다. 가려진 부분은 투명하게 두거나 고른
            색으로 채울 수 있습니다. 영역은 그림 안의 위치라서 일러스트를 옮기거나 돌려도 함께 따라갑니다. 색
            채우기의 &apos;그림 모양&apos;은 그림이 있는 픽셀에만, &apos;영역 전체&apos;는 가린 영역 전체에
            색을 칠합니다. 슬라이더를 두 번 누르면 기본값으로 돌아갑니다.
          </Tip>
        </span>
      }
    >
      {m.on && (
        <>
          <Chips
            label="모양"
            value={m.shape}
            options={[
              ["ellipse", "원"],
              ["rect", "사각"],
            ]}
            onChange={(shape) => set({ shape })}
          />
          <Chips
            label="가릴 곳"
            value={m.target}
            options={[
              ["outside", "영역 밖"],
              ["inside", "영역 안"],
            ]}
            onChange={(target) => set({ target })}
          />
          {SLIDERS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="w-14 shrink-0">{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={0.01}
                value={m[s.key]}
                onChange={(e) => set({ [s.key]: Number(e.target.value) })}
                onDoubleClick={() => set({ [s.key]: DEFAULT_PROP_MASK[s.key] })}
                aria-label={`마스킹 ${s.label}`}
                className="min-w-0 flex-1 accent-indigo-500"
              />
              <span className="w-10 text-right font-mono text-zinc-300">{Math.round(m[s.key] * 100)}%</span>
            </label>
          ))}
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="w-14 shrink-0">영역 색</span>
            <input
              type="color"
              value={m.color}
              onChange={(e) =>
                set({ color: e.target.value, colorAlpha: m.colorAlpha > 0 ? m.colorAlpha : 1 })
              }
              aria-label="마스킹 영역 색"
              className="h-6 w-9 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={m.colorAlpha}
              onChange={(e) => set({ colorAlpha: Number(e.target.value) })}
              aria-label="마스킹 영역 색 진하기"
              className="min-w-0 flex-1 accent-indigo-500"
            />
            <span className="w-10 text-right font-mono text-zinc-300">
              {m.colorAlpha > 0 ? `${Math.round(m.colorAlpha * 100)}%` : "투명"}
            </span>
          </div>
          {m.colorAlpha > 0 && (
            <Chips
              label="색 채우기"
              value={m.fill}
              options={[
                ["picture", "그림 모양"],
                ["area", "영역 전체"],
              ]}
              onChange={(fill) => set({ fill })}
            />
          )}
        </>
      )}
    </Fold>
  );
}
