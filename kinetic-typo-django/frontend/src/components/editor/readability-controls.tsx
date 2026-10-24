import type { AutoContrast } from "@/types/project";
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
  const setStyle = useProjectStore((s) => s.setStyle);
  return (
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
