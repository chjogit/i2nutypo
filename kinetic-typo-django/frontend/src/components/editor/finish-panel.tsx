import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ColorWheel, FilmId, FilterId, FinishSettings, GradeId, GradeMask } from "@/types/finish";
import {
  DEFAULT_FINISH,
  FILMS,
  FILTERS,
  GAUGES,
  GRADES,
  sanitizeFinish,
  type BasicKey,
  type GaugeDef,
} from "@/lib/render/finish/settings";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";
import { Fold } from "./fold";

const ON = "border-indigo-500 bg-indigo-500/10 text-zinc-100";
const OFF = "border-zinc-800 text-zinc-400 hover:border-indigo-500";
const RESET = "text-[11px] font-normal text-indigo-400 hover:underline";

const BASIC: Array<{ key: BasicKey; label: string; left: string; right: string }> = [
  { key: "exposure", label: "밝기", left: "어둡게", right: "밝게" },
  { key: "contrast", label: "대비", left: "흐리게", right: "강하게" },
  { key: "saturation", label: "채도", left: "흑백 쪽", right: "진하게" },
  { key: "temperature", label: "색온도", left: "차갑게", right: "따뜻하게" },
  { key: "tint", label: "색조", left: "초록", right: "자홍" },
];

const TONE: Array<{ key: "shadows" | "highlights" | "vibrance"; label: string; hint: string }> = [
  { key: "shadows", label: "그림자", hint: "어두운 부분만 밝히거나 누름" },
  { key: "highlights", label: "하이라이트", hint: "밝은 부분만 살리거나 누름" },
  { key: "vibrance", label: "생동감", hint: "덜 진한 색 위주로 채도를 올림 (피부는 덜 건드림)" },
];

const MASKS: ReadonlyArray<readonly [GradeMask["kind"], string]> = [
  ["none", "화면 전체"],
  ["center", "가운데 원"],
  ["top", "위쪽"],
  ["bottom", "아래쪽"],
];

const WHEELS: ReadonlyArray<readonly [keyof FinishSettings["wheels"], string, string]> = [
  ["lift", "그림자", "어두운 부분의 색과 밝기 (리프트)"],
  ["gamma", "중간톤", "중간 밝기의 색과 밝기 (감마)"],
  ["gain", "하이라이트", "밝은 부분의 색과 밝기 (게인)"],
];

// Hues placed to match the shader's wheel axes: red to the right, green up-left, blue down-left
const WHEEL_BG =
  "radial-gradient(circle, rgb(63 63 70) 0%, rgb(63 63 70 / 0.2) 70%, transparent 71%), conic-gradient(#9f0 0deg, #ff0 30deg, #f00 90deg, #f0f 150deg, #00f 210deg, #0ff 270deg, #0f0 330deg, #9f0 360deg)";

const pct = (v: number) => `${Math.round(v * 100)}`;
const signed = (v: number) => (v > 0 ? `+${pct(v)}` : pct(v));

function Slider({
  label,
  value,
  min = -1,
  max = 1,
  reset = 0,
  hint,
  onChange,
  format = signed,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  reset?: number;
  hint?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400" title={hint}>
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(reset)}
        className="min-w-0 flex-1 accent-indigo-500"
      />
      <span className="w-10 text-right font-mono text-zinc-300">{format(value)}</span>
    </label>
  );
}

/** A color wheel: drag the dot toward a hue, the bar under it sets brightness; double-click resets. */
function Wheel({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: ColorWheel;
  onChange: (w: ColorWheel) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (e: ReactPointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    let x = ((e.clientX - r.left) / r.width) * 2 - 1;
    let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    onChange({ ...value, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  };
  return (
    <div className="flex flex-col items-center gap-1" title={hint}>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`${label} 색`}
        aria-valuetext={`가로 ${pct(value.x)}, 세로 ${pct(value.y)}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e);
        }}
        onPointerMove={(e) => dragging.current && at(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onDoubleClick={() => onChange({ x: 0, y: 0, l: value.l })}
        onKeyDown={(e) => {
          const step = 0.05;
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const m = d[e.key];
          if (!m) return;
          e.preventDefault();
          let x = value.x + m[0];
          let y = value.y + m[1];
          const len = Math.hypot(x, y);
          if (len > 1) {
            x /= len;
            y /= len;
          }
          onChange({ ...value, x, y });
        }}
        className="relative h-16 w-16 cursor-crosshair touch-none rounded-full border border-zinc-700 opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        style={{ background: WHEEL_BG }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow"
          style={{ left: `${50 + value.x * 50}%`, top: `${50 - value.y * 50}%` }}
        />
      </div>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value.l}
        aria-label={`${label} 밝기`}
        onChange={(e) => onChange({ ...value, l: Number(e.target.value) })}
        onDoubleClick={() => onChange({ ...value, l: 0 })}
        className="w-16 accent-indigo-500"
      />
      <span className="text-[10px] text-zinc-400">{label}</span>
    </div>
  );
}

/**
 * "마무리" tab: the last pass over the whole frame. A look, basic and
 * three-way color correction with an optional mask, a film stock with its
 * gauge's texture, and any number of filters on top. Applies to the preview
 * and the exported video alike.
 */
export function FinishPanel() {
  const raw = useProjectStore((s) => s.style.finish);
  const setStyle = useProjectStore((s) => s.setStyle);
  const finish = sanitizeFinish(raw);
  const update = (patch: Partial<FinishSettings>) => setStyle({ finish: { ...finish, ...patch } });
  const setFilter = (id: FilterId, on: boolean, amount: number) =>
    update({ filters: { ...finish.filters, [id]: { on, amount } } });
  const applyGauge = (g: GaugeDef) => {
    const filters = { ...finish.filters };
    for (const [id, amount] of Object.entries(g.filters) as Array<[FilterId, number]>)
      filters[id] = { on: true, amount };
    update({ grainSize: g.grainSize, weave: g.weave, breath: g.breath, filters });
  };

  const grades: Array<{ id: GradeId; label: string; hint: string }> = [
    { id: "none", label: "없음", hint: "색 보정을 하지 않음" },
    ...GRADES,
  ];
  const films: Array<{ id: FilmId; label: string; hint: string }> = [
    { id: "none", label: "없음", hint: "필름 색감을 쓰지 않음" },
    ...FILMS,
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5 font-semibold">
          마무리 보정
          <Tip>
            영상 전체에 마지막으로 입히는 색과 질감입니다. 미리보기와 내보낸 영상에 똑같이 들어갑니다. 막대와
            색 휠은 두 번 클릭하면 0으로 돌아갑니다. 순서: 룩 → 기본 보정 → 색 휠 → 필름 → 필터.
          </Tip>
        </span>
        <button type="button" onClick={() => setStyle({ finish: DEFAULT_FINISH })} className={RESET}>
          전체 초기화
        </button>
      </div>

      <Fold title="룩 (색 분위기)" className="space-y-2">
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
        {finish.grade !== "none" && (
          <Slider
            label="강도"
            value={finish.gradeAmount}
            min={0}
            reset={0.7}
            format={pct}
            onChange={(gradeAmount) => update({ gradeAmount })}
          />
        )}
        {(finish.grade === "splitTone" || finish.filters.twoTone?.on) && (
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
      </Fold>

      <Fold
        title="기본 보정"
        right={
          <button
            type="button"
            onClick={() =>
              update({
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                shadows: 0,
                highlights: 0,
                vibrance: 0,
              })
            }
            className={RESET}
          >
            초기화
          </button>
        }
      >
        {BASIC.map((b) => (
          <Slider
            key={b.key}
            label={b.label}
            hint={`${b.left} ↔ ${b.right}`}
            value={finish[b.key]}
            onChange={(v) => update({ [b.key]: v })}
          />
        ))}
        {TONE.map((b) => (
          <Slider
            key={b.key}
            label={b.label}
            hint={b.hint}
            value={finish[b.key]}
            onChange={(v) => update({ [b.key]: v })}
          />
        ))}
      </Fold>

      <Fold
        title={<span className="inline-flex items-center gap-1.5">색 휠 · 세부 보정</span>}
        defaultOpen={false}
        right={
          <button
            type="button"
            onClick={() =>
              update({
                wheels: DEFAULT_FINISH.wheels,
                cmy: DEFAULT_FINISH.cmy,
                toning: DEFAULT_FINISH.toning,
                compression: 0,
                mask: DEFAULT_FINISH.mask,
              })
            }
            className={RESET}
          >
            초기화
          </button>
        }
      >
        <div className="flex items-start justify-between gap-1">
          {WHEELS.map(([key, label, hint]) => (
            <Wheel
              key={key}
              label={label}
              hint={hint}
              value={finish.wheels[key]}
              onChange={(w) => update({ wheels: { ...finish.wheels, [key]: w } })}
            />
          ))}
        </div>
        <p className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-zinc-400">
          인화 필터
          <Tip>
            사진관 인화기의 색 필터처럼 시안·마젠타·옐로를 더하거나 뺍니다. 필름 색감을 미세하게 맞출 때
            씁니다.
          </Tip>
        </p>
        <Slider
          label="시안"
          hint="빨강 ↔ 시안"
          value={finish.cmy.c}
          onChange={(c) => update({ cmy: { ...finish.cmy, c } })}
        />
        <Slider
          label="마젠타"
          hint="초록 ↔ 마젠타"
          value={finish.cmy.m}
          onChange={(m) => update({ cmy: { ...finish.cmy, m } })}
        />
        <Slider
          label="옐로"
          hint="파랑 ↔ 노랑"
          value={finish.cmy.y}
          onChange={(y) => update({ cmy: { ...finish.cmy, y } })}
        />
        <p className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-zinc-400">
          밝기별 온도
          <Tip>그림자·중간·밝은 곳을 따로 차갑게(−) 또는 따뜻하게(+) 물들입니다.</Tip>
        </p>
        <Slider
          label="그림자"
          value={finish.toning.shadows}
          onChange={(shadows) => update({ toning: { ...finish.toning, shadows } })}
        />
        <Slider
          label="중간"
          value={finish.toning.mids}
          onChange={(mids) => update({ toning: { ...finish.toning, mids } })}
        />
        <Slider
          label="밝은 곳"
          value={finish.toning.highs}
          onChange={(highs) => update({ toning: { ...finish.toning, highs } })}
        />
        <Slider
          label="눌러 담기"
          hint="필름처럼 아주 밝은 곳이 하얗게 날아가지 않고 부드럽게 눌림"
          value={finish.compression}
          min={0}
          format={pct}
          onChange={(compression) => update({ compression })}
        />
        <div className="space-y-1.5 border-t border-zinc-800/60 pt-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
            보정 범위
            <Tip>
              색 휠·기본 보정·룩이 들어갈 곳을 정합니다. 가운데 원은 인물·가사에, 위·아래는 하늘이나 바닥에
              씁니다.
            </Tip>
          </p>
          <div className="flex flex-wrap gap-1">
            {MASKS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={finish.mask.kind === kind}
                onClick={() => update({ mask: { ...finish.mask, kind } })}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${finish.mask.kind === kind ? ON : OFF}`}
              >
                {label}
              </button>
            ))}
          </div>
          {finish.mask.kind !== "none" && (
            <>
              <Slider
                label="경계 부드럽게"
                value={finish.mask.feather}
                min={0}
                reset={0.5}
                format={pct}
                onChange={(feather) => update({ mask: { ...finish.mask, feather } })}
              />
              <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={finish.mask.invert}
                  onChange={(e) => update({ mask: { ...finish.mask, invert: e.target.checked } })}
                  className="accent-indigo-500"
                />
                바깥쪽에 적용
              </label>
            </>
          )}
        </div>
      </Fold>

      <Fold title="필름 색감 · 질감" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          {films.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={finish.film === f.id}
              title={f.hint}
              onClick={() => update({ film: f.id })}
              className={`rounded-md border px-2 py-1.5 text-left text-xs ${finish.film === f.id ? ON : OFF}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {finish.film !== "none" && (
          <>
            <Slider
              label="강도"
              value={finish.filmAmount}
              min={0}
              reset={0.8}
              format={pct}
              onChange={(filmAmount) => update({ filmAmount })}
            />
            <Slider
              label="현상"
              hint="− 감도 낮춰 현상(부드럽게) ↔ + 증감 현상(진하고 거칠게)"
              value={finish.push}
              onChange={(push) => update({ push })}
            />
          </>
        )}
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-zinc-400">
          <span className="font-semibold">필름 크기</span>
          <Tip>
            누르면 그 필름 크기에 맞는 입자 크기·흔들림·깜빡임·번짐·먼지를 한 번에 맞춥니다. 아래 막대로 다시
            다듬을 수 있습니다.
          </Tip>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {GAUGES.map((g) => (
            <button
              key={g.id}
              type="button"
              title={g.hint}
              onClick={() => applyGauge(g)}
              className={`rounded-md border px-1 py-1 text-xs ${Math.abs(finish.grainSize - g.grainSize) < 0.01 && Math.abs(finish.weave - g.weave) < 0.01 ? ON : OFF}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <Slider
          label="입자 크기"
          value={finish.grainSize}
          min={0.5}
          max={4}
          reset={1.3}
          format={(v) => v.toFixed(1)}
          onChange={(grainSize) => update({ grainSize })}
        />
        <Slider
          label="화면 흔들림"
          hint="필름이 영사기 안에서 미세하게 흔들림"
          value={finish.weave}
          min={0}
          format={pct}
          onChange={(weave) => update({ weave })}
        />
        <Slider
          label="깜빡임"
          hint="프레임마다 노출이 살짝 달라지는 필름 숨쉬기"
          value={finish.breath}
          min={0}
          format={pct}
          onChange={(breath) => update({ breath })}
        />
      </Fold>

      <Fold
        title={`필터 (${FILTERS.filter((d) => finish.filters[d.id]?.on).length}개 켜짐)`}
        defaultOpen={false}
      >
        <div className="space-y-1.5">
          {FILTERS.map((def) => {
            const state = finish.filters[def.id];
            const on = state?.on ?? false;
            const amount = state?.amount ?? def.initial;
            return (
              <div key={def.id} className="flex items-center gap-2 text-xs">
                <label
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-zinc-200"
                  title={def.hint}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setFilter(def.id, e.target.checked, amount)}
                    className="accent-indigo-500"
                  />
                  <span className="min-w-0 flex-1 truncate">{def.label}</span>
                </label>
                <Tip label={`${def.label} 설명`}>{def.hint}</Tip>
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
      </Fold>
    </div>
  );
}
