import type { FilterId, FinishSettings, GradeId } from "@/types/finish";
import { DEFAULT_FINISH, FILTERS, GRADES, sanitizeFinish, type BasicKey } from "@/lib/render/finish/settings";
import { useProjectStore } from "@/store/project-store";

const ON = "border-indigo-500 bg-indigo-500/10 text-zinc-100";
const OFF = "border-zinc-800 text-zinc-400 hover:border-indigo-500";

const BASIC: Array<{ key: BasicKey; label: string; left: string; right: string }> = [
  { key: "exposure", label: "밝기", left: "어둡게", right: "밝게" },
  { key: "contrast", label: "대비", left: "흐리게", right: "강하게" },
  { key: "saturation", label: "채도", left: "흑백 쪽", right: "진하게" },
  { key: "temperature", label: "색온도", left: "차갑게", right: "따뜻하게" },
  { key: "tint", label: "색조", left: "초록", right: "자홍" },
];

const pct = (v: number) => `${Math.round(v * 100)}`;
const signed = (v: number) => (v > 0 ? `+${pct(v)}` : pct(v));

/**
 * "마무리" tab: the last pass over the whole frame. One color grade with its
 * strength, basic correction, and any number of filters stacked on top. Applies
 * to the preview and the exported video alike.
 */
export function FinishPanel() {
  const raw = useProjectStore((s) => s.style.finish);
  const setStyle = useProjectStore((s) => s.setStyle);
  const finish = sanitizeFinish(raw);
  const update = (patch: Partial<FinishSettings>) => setStyle({ finish: { ...finish, ...patch } });
  const setFilter = (id: FilterId, on: boolean, amount: number) =>
    update({ filters: { ...finish.filters, [id]: { on, amount } } });

  const grades: Array<{ id: GradeId; label: string; hint: string }> = [
    { id: "none", label: "없음", hint: "색 보정을 하지 않음" },
    ...GRADES,
  ];
  const activeHint = grades.find((g) => g.id === finish.grade)?.hint;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="font-semibold">컬러 그레이딩</span>
          <button
            type="button"
            onClick={() => setStyle({ finish: DEFAULT_FINISH })}
            className="text-indigo-400 hover:underline"
          >
            전체 초기화
          </button>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">
          영상 전체의 색 분위기를 하나 고릅니다. 미리보기와 내보낸 영상에 똑같이 들어갑니다.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
          {grades.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={finish.grade === g.id}
              title={g.hint}
              onClick={() => update({ grade: g.id })}
              className={`rounded-md border px-2 py-1.5 text-left text-xs ${finish.grade === g.id ? ON : OFF}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        {activeHint && <p className="text-[11px] leading-snug text-zinc-500">{activeHint}</p>}
        {finish.grade !== "none" && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-16 shrink-0">강도</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={finish.gradeAmount}
              onChange={(e) => update({ gradeAmount: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-indigo-500"
            />
            <span className="w-10 text-right font-mono text-zinc-300">{pct(finish.gradeAmount)}</span>
          </label>
        )}
        {finish.grade === "splitTone" && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            {(
              [
                ["shadowTint", "그림자 색"],
                ["highlightTint", "하이라이트 색"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-1.5">
                <input
                  type="color"
                  value={finish[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border border-zinc-800 bg-zinc-950"
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="font-semibold">기본 보정</span>
          <button
            type="button"
            onClick={() => update({ exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 })}
            className="text-indigo-400 hover:underline"
          >
            초기화
          </button>
        </div>
        {BASIC.map((b) => (
          <label
            key={b.key}
            className="flex items-center gap-2 text-xs text-zinc-400"
            title={`${b.left} ↔ ${b.right}`}
          >
            <span className="w-16 shrink-0">{b.label}</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={finish[b.key]}
              onChange={(e) => update({ [b.key]: Number(e.target.value) })}
              onDoubleClick={() => update({ [b.key]: 0 })}
              className="min-w-0 flex-1 accent-indigo-500"
            />
            <span className="w-10 text-right font-mono text-zinc-300">{signed(finish[b.key])}</span>
          </label>
        ))}
        <p className="text-[11px] leading-snug text-zinc-500">막대를 두 번 클릭하면 0으로 돌아갑니다.</p>
      </div>

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <p className="text-[11px] font-semibold text-zinc-400">필터 (여러 개 겹쳐 쓰기 가능)</p>
        <div className="space-y-1.5">
          {FILTERS.map((def) => {
            const state = finish.filters[def.id];
            const on = state?.on ?? false;
            const amount = state?.amount ?? def.initial;
            return (
              <div key={def.id} className="flex items-center gap-2 text-xs">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-zinc-200">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setFilter(def.id, e.target.checked, amount)}
                    className="accent-indigo-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-keep leading-snug">{def.label}</span>
                    <span className="block text-[10px] leading-tight text-zinc-500">{def.hint}</span>
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={amount}
                  disabled={!on}
                  aria-label={`${def.label} 강도`}
                  onChange={(e) => setFilter(def.id, true, Number(e.target.value))}
                  className="w-20 accent-indigo-500 disabled:opacity-30"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
