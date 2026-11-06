import type { KineticBackground, KineticReveal, MotionStyleId } from "@/types/project";
import { useProjectStore } from "@/store/project-store";
import { css, derivePalette } from "@/lib/render/kinetic/color";
import { DEFAULT_MOTION_STYLE, KINETIC_BACKGROUNDS, MOTION_STYLES } from "@/lib/render/kinetic/styles";
import { Tip } from "@/components/ui/tip";

const ON = "border-indigo-500 bg-indigo-500/10 text-zinc-100";
const OFF = "border-zinc-800 text-zinc-400 hover:border-indigo-500";

const STYLE_CHOICES: readonly { id: MotionStyleId; label: string; hint: string }[] = [
  ...MOTION_STYLES.map(({ id, label, hint }) => ({ id, label, hint })),
  { id: "theme", label: "테마 고유", hint: "고른 테마가 원래 가진 가사 모양과 움직임 그대로" },
];

const REVEALS: readonly [KineticReveal, string, string][] = [
  ["sung", "부를 때", "단어가 불리는 순간에 하나씩 들어옵니다(싱크 그대로)."],
  ["line", "줄 시작에", "줄이 시작될 때 줄 전체가 물결처럼 차례로 들어옵니다."],
];

/**
 * How the lyrics move and are set (the motion styles of lib/render/kinetic),
 * with the background, camera and film base that go with them. The colors
 * stay the user's own: every style paints with the palette worked out from them.
 */
export function MotionStyleControl({ compact = false }: { compact?: boolean }) {
  const style = useProjectStore((s) => s.style);
  const setStyle = useProjectStore((s) => s.setStyle);
  const current = style.motionStyle ?? DEFAULT_MOTION_STYLE;
  const active = current !== "theme";
  const bg = style.kineticBg ?? "theme";
  const palette = derivePalette(style);
  const swatches: [string, string][] = [
    [css(palette.bgLift), "밝힌 배경"],
    [css(palette.aurora[0]), "오로라 1"],
    [css(palette.aurora[1]), "오로라 2"],
    [palette.glow, "글로우"],
    [css(palette.onAccent), "포인트 위 글자"],
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
        모션 스타일
        <Tip>
          가사가 글자나 단어 단위로 나뉘어 차례로 들어오는 방식입니다. 색은 바꾸지 않고, 고른 배경·글자·포인트
          색에서 그라데이션, 글로우, 대비 색을 계산해 씁니다. 강조 표시는 가사에 *, **, ! 로 표시한 단어에만
          붙습니다.
        </Tip>
      </div>
      <div role="radiogroup" aria-label="모션 스타일" className="flex w-full flex-col gap-1.5">
        {STYLE_CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={current === c.id}
            title={c.hint}
            onClick={() => setStyle({ motionStyle: c.id })}
            className={`block w-full rounded-md border px-2.5 py-2 text-left ${current === c.id ? ON : OFF}`}
          >
            <span className="block text-sm font-semibold">{c.label}</span>
            {!compact && (
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">{c.hint}</span>
            )}
          </button>
        ))}
      </div>

      {active && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <span>들어오는 때</span>
            <span
              role="radiogroup"
              aria-label="들어오는 때"
              className="flex overflow-hidden rounded-md border border-zinc-800"
            >
              {REVEALS.map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={(style.kineticReveal ?? "sung") === id}
                  title={hint}
                  onClick={() => setStyle({ kineticReveal: id })}
                  className={`px-2 py-1 ${(style.kineticReveal ?? "sung") === id ? "bg-zinc-200 font-semibold text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              배경
              <Tip>
                테마 배경 대신 고른 배경색으로 만든 배경을 씁니다. 스포트라이트는 배경색을 밝힌 빛이
                가운데에서 퍼지고, 오로라는 배경·포인트·보조 색에서 만든 빛 덩어리가 천천히 흐릅니다. 배경
                그림이나 영상이 있으면 그 위에 그대로 보입니다.
              </Tip>
            </div>
            <div role="radiogroup" aria-label="모션 스타일 배경" className="flex flex-wrap gap-1.5">
              {KINETIC_BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={bg === b.id}
                  title={b.hint}
                  onClick={() => setStyle({ kineticBg: b.id as KineticBackground })}
                  className={`rounded-sm border px-2.5 py-0.5 text-xs ${bg === b.id ? ON : OFF}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1" aria-label="고른 색에서 계산한 색">
              {swatches.map(([color, label]) => (
                <span
                  key={label}
                  title={label}
                  className="h-4 w-6 rounded-sm border border-zinc-700"
                  style={{ background: color }}
                />
              ))}
              <span className="ml-1 text-[11px] text-zinc-400">고른 색에서 계산</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-200">
            <input
              type="checkbox"
              checked={style.kineticCamera !== false}
              onChange={(e) => setStyle({ kineticCamera: e.target.checked })}
              className="accent-indigo-500"
            />
            가상 카메라
            <Tip>
              화면이 아주 천천히 다가갔다 물러나고, 강조 단어와 ! 줄에서 짧게 튕기듯 줌됩니다. 하이프 팝인은
              줄마다 튕깁니다. &quot;진동 모두 끄기&quot;를 켜면 함께 꺼집니다.
            </Tip>
            {style.noVibration && <span className="text-[11px] text-amber-300">진동 끄기로 멈춤</span>}
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-200">
            <input
              type="checkbox"
              checked={style.cinematicBase !== false}
              onChange={(e) => setStyle({ cinematicBase: e.target.checked })}
              className="accent-indigo-500"
            />
            필름 그레인 · 비네팅 바탕
            <Tip>
              화면 전체에 아주 옅은(약 4%) 필름 입자와, 배경색을 깊게 한 가장자리 그늘을 깝니다. 마무리 탭에서
              그레인이나 비네팅을 켜면 그쪽 설정을 대신 씁니다.
            </Tip>
          </label>
        </>
      )}
    </div>
  );
}
