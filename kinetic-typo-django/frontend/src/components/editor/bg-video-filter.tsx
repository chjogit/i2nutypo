import type { BgVideoFilter } from "@/types/project";
import {
  BG_FILTER_PRESETS,
  BG_FILTER_RANGES,
  isNeutralBgFilter,
  NEUTRAL_BG_FILTER,
} from "@/lib/render/bg-filter";
import { COLOR_FILTERS } from "@/lib/render/looks/color-filter";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

const CHIP_ON = "border-indigo-500 bg-indigo-500/15 text-zinc-100";
const CHIP_OFF = "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200";

type NumberKey = Exclude<keyof BgVideoFilter, "tint">;

const SLIDERS: ReadonlyArray<{ key: NumberKey; label: string; step: number; format: (v: number) => string }> =
  [
    { key: "brightness", label: "밝기", step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: "contrast", label: "대비", step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: "saturate", label: "채도", step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: "hue", label: "색조", step: 1, format: (v) => `${Math.round(v)}°` },
    { key: "blur", label: "흐림", step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  ];

const same = (a: BgVideoFilter, b: BgVideoFilter) =>
  (Object.keys(a) as Array<keyof BgVideoFilter>).every((k) => a[k] === b[k]);

/**
 * The background video's own filter: a ready-made look, then brightness,
 * contrast, saturation, hue, blur and a color tint. Only the video changes;
 * the lyrics, decorations and illustrations keep their colors.
 */
export function BgVideoFilterControls() {
  const filter = useProjectStore((s) => s.style.bgVideoFilter ?? NEUTRAL_BG_FILTER);
  const setStyle = useProjectStore((s) => s.setStyle);
  const set = (patch: Partial<BgVideoFilter>) => setStyle({ bgVideoFilter: { ...filter, ...patch } });

  return (
    <div className="space-y-1.5 rounded-md border border-zinc-800 p-2">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        <span className="font-semibold text-zinc-300">영상 필터</span>
        <Tip>
          배경 영상에만 거는 보정입니다. 가사·장식·일러스트·하단 자막 색은 그대로이고, 미리보기와 내보낸
          영상에 똑같이 들어갑니다. 화면 전체에 거는 필터는 테마 색 칸의 &apos;필터&apos;에 따로 있습니다.
          슬라이더를 두 번 누르면 원래 값으로 돌아갑니다.
        </Tip>
        {!isNeutralBgFilter(filter) && (
          <button
            type="button"
            onClick={() => setStyle({ bgVideoFilter: NEUTRAL_BG_FILTER })}
            className="ml-auto text-indigo-300 hover:underline"
          >
            원본으로
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {BG_FILTER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={same(filter, p.filter)}
            onClick={() => setStyle({ bgVideoFilter: p.filter })}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${same(filter, p.filter) ? CHIP_ON : CHIP_OFF}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {SLIDERS.map((s) => {
        const [min, max] = BG_FILTER_RANGES[s.key];
        return (
          <label key={s.key} className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="w-8 shrink-0">{s.label}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={s.step}
              value={filter[s.key]}
              onChange={(e) => set({ [s.key]: Number(e.target.value) })}
              onDoubleClick={() => set({ [s.key]: NEUTRAL_BG_FILTER[s.key] })}
              aria-label={`배경 영상 ${s.label}`}
              className="min-w-0 flex-1 accent-indigo-500"
            />
            <span className="w-10 text-right font-mono text-zinc-300">{s.format(filter[s.key])}</span>
          </label>
        );
      })}
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-400">
        <span className="w-8 shrink-0">색</span>
        {COLOR_FILTERS.map((c) => (
          <button
            key={c.kind}
            type="button"
            aria-pressed={filter.tint === c.kind}
            onClick={() => set({ tint: c.kind })}
            className={`rounded-full border px-2 py-0.5 ${filter.tint === c.kind ? CHIP_ON : CHIP_OFF}`}
          >
            {c.label}
          </button>
        ))}
        {filter.tint !== "none" && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={filter.tintAmount}
            onChange={(e) => set({ tintAmount: Number(e.target.value) })}
            aria-label="배경 영상 색 세기"
            className="min-w-0 flex-1 accent-indigo-500"
          />
        )}
      </div>
    </div>
  );
}
