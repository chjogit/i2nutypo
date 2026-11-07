import { useMemo, useState } from "react";
import { useProjectStore } from "@/store/project-store";
import { DIRECTIONS, recommendDirection } from "@/lib/direction/direction";
import { applyDirection, clearDirection, runBeatAnalysis } from "@/lib/actions/quick-actions";
import { detectSections } from "@/lib/structure/sections";
import { Tip } from "@/components/ui/tip";

const ON = "border-tide-500 bg-tide-500/10 text-zinc-100";
const OFF = "border-zinc-800 text-zinc-400 hover:border-tide-500";

/**
 * The overall direction: calm, impact, or calm verses with impact choruses,
 * with the one the song's tempo suggests marked. One click sets the camera,
 * particles, curve, finish and the beat layers and cuts together.
 */
export function DirectionControl({ compact = false }: { compact?: boolean }) {
  const bpm = useProjectStore((s) => s.beats?.bpm ?? null);
  const lines = useProjectStore((s) => s.lines);
  const sectionKinds = useProjectStore((s) => s.style.sectionKinds);
  const current = useProjectStore((s) => s.style.direction ?? "none");
  const hasSong = useProjectStore((s) => s.audio.kind === "upload");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasChorus = useMemo(
    () =>
      detectSections(
        lines.map((l) => ({
          startTime: l.startTime,
          endTime: l.endTime,
          overlap: l.overlap,
          text: l.cleanText,
        })),
        sectionKinds,
      ).some((s) => s.kind === "chorus"),
    [lines, sectionKinds],
  );
  const advice = recommendDirection(bpm, hasChorus);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
        연출 방향
        <Tip>
          곡에 맞는 연출을 한 번에 겁니다. 서정 연출은 느린 2.5D 카메라와 빛·입자로 분위기를 쌓고, 타격 연출은
          킥마다 화면을 튕기고 흔들며 그래픽으로 빈 곳을 채웁니다. 섞기는 절은 서정, 후렴은 타격으로 갑니다.
          다시 누르면 앞서 넣은 연출만 바꾸고, 직접 넣은 효과는 그대로 둡니다.
        </Tip>
      </div>
      <p className="text-xs leading-snug text-zinc-400">{advice.reason}</p>
      {bpm === null && hasSong && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(await runBeatAnalysis());
            setBusy(false);
          }}
          className="rounded-sm border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-tide-500 disabled:opacity-50"
        >
          {busy ? "비트 분석 중…" : "비트 분석해서 빠르기 보기"}
        </button>
      )}
      <div role="radiogroup" aria-label="연출 방향" className="flex w-full flex-col gap-1.5">
        {DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={current === d.id}
            title={d.hint}
            onClick={() => setMsg(applyDirection(d.id))}
            className={`block w-full rounded-md border px-2.5 py-2 text-left ${current === d.id ? ON : OFF}`}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              {d.label}
              {advice.id === d.id && (
                <span className="rounded-sm bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
                  추천
                </span>
              )}
            </span>
            {!compact && (
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">{d.hint}</span>
            )}
          </button>
        ))}
      </div>
      {current !== "none" && (
        <button
          type="button"
          onClick={() => {
            clearDirection();
            setMsg("연출 방향으로 넣은 효과와 전환을 뺐습니다.");
          }}
          className="text-xs text-zinc-400 hover:text-zinc-100 hover:underline"
        >
          연출 효과 빼기
        </button>
      )}
      {msg && (
        <p role="status" className="text-xs text-zinc-300">
          {msg}
        </p>
      )}
    </div>
  );
}
