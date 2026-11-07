import { useProjectStore } from "@/store/project-store";
import { AMBIENT_PARTICLES, MOTION_CURVES, sanitizeAmbient } from "@/lib/render/depth-fx";
import type { AmbientParticles } from "@/types/project";
import { Tip } from "@/components/ui/tip";

const COLORS: readonly [AmbientParticles["color"], string][] = [
  ["secondary", "보조색"],
  ["accent", "포인트색"],
  ["text", "글자색"],
];

const chip = (on: boolean) =>
  `px-2 py-1 ${on ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`;

/** Camera depth (2.5D parallax), a particle layer over any theme, and the motion styles' timing curve. */
export function DepthFxControl() {
  const parallax = useProjectStore((s) => s.style.parallax ?? 0);
  const ambient = sanitizeAmbient(useProjectStore((s) => s.style.ambientParticles));
  const curve = useProjectStore((s) => s.style.motionCurve ?? "style");
  const motionOn = useProjectStore((s) => (s.style.motionStyle ?? "smooth_reveal") !== "theme");
  const setStyle = useProjectStore((s) => s.setStyle);
  const setAmbient = (patch: Partial<AmbientParticles>) =>
    setStyle({ ambientParticles: { ...ambient, ...patch } });

  return (
    <div className="space-y-2.5">
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="inline-flex w-20 shrink-0 items-center gap-1">
          2.5D 카메라
          <Tip>
            배경, 뒤 일러스트, 가사, 앞 일러스트를 서로 다른 깊이에 두고 카메라가 천천히 움직입니다. 먼 배경은
            조금, 앞 소품은 많이 움직여 평면 그림이 공간처럼 보입니다. 배경과 소품(캐릭터)을 따로 올리면 가장
            잘 보입니다. 0%면 꺼집니다.
          </Tip>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={parallax}
          onChange={(e) => setStyle({ parallax: Number(e.target.value) })}
          onDoubleClick={() => setStyle({ parallax: 0 })}
          aria-label="2.5D 카메라 깊이"
          className="min-w-0 flex-1 accent-tide-500"
        />
        <span className="w-10 text-right font-mono text-zinc-300">{Math.round(parallax * 100)}%</span>
      </label>

      <div className="space-y-1.5">
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          입자 레이어
          <Tip>
            어느 테마에서나 화면에 입자를 흩뿌립니다. 대부분은 가사 뒤에, 몇 개는 가사 앞을 지나갑니다. 테마가
            원래 가진 입자와 따로 더해집니다.
          </Tip>
        </span>
        <div
          role="radiogroup"
          aria-label="입자 종류"
          className="grid grid-cols-5 overflow-hidden rounded-md border border-zinc-800 text-xs"
        >
          {AMBIENT_PARTICLES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={ambient.kind === p.id}
              onClick={() => setAmbient({ kind: p.id })}
              className={chip(ambient.kind === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {ambient.kind !== "none" && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={ambient.amount}
              onChange={(e) => setAmbient({ amount: Number(e.target.value) })}
              aria-label="입자 양"
              className="min-w-0 flex-1 accent-tide-500"
            />
            <span className="w-10 text-right font-mono text-zinc-300">
              {Math.round(ambient.amount * 100)}%
            </span>
            <span
              role="radiogroup"
              aria-label="입자 색"
              className="flex overflow-hidden rounded-md border border-zinc-800"
            >
              {COLORS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={ambient.color === id}
                  onClick={() => setAmbient({ color: id })}
                  className={chip(ambient.color === id)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
        )}
      </div>

      {motionOn && (
        <div className="space-y-1.5">
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            모션 곡선
            <Tip>
              글자가 들어올 때의 속도 변화입니다. 부드럽게는 느린 곡, 쫀득하게는 빠른 곡에 어울리고, 튕기게와
              탄성은 자리를 지나쳤다 돌아옵니다.
            </Tip>
          </span>
          <div
            role="radiogroup"
            aria-label="모션 곡선"
            className="grid grid-cols-3 overflow-hidden rounded-md border border-zinc-800 text-xs"
          >
            {MOTION_CURVES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={curve === c.id}
                title={c.hint}
                onClick={() => setStyle({ motionCurve: c.id })}
                className={chip(curve === c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
