import type { ReactNode } from "react";
import type { AdjustKind, TransitionColor, TransitionKind } from "@/types/project";
import { ADJUSTS, TRANSITION_BY_ID, TRANSITION_COLORS, TRANSITIONS } from "@/lib/timeline-fx/defs";
import { SFX, SFX_GROUPS, soundLabel, soundLength } from "@/lib/sfx/library";
import { playClip, stopAllSfx, wakeSfx } from "@/lib/sfx/player";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { useProjectStore } from "@/store/project-store";
import { usePlaybackStore } from "@/store/playback-store";
import { usePropUiStore } from "@/store/prop-ui-store";

const FIELD =
  "w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[11px] text-zinc-400">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-indigo-500"
      />
      <span className="w-10 text-right font-mono text-zinc-300">{format(value)}</span>
    </span>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${v.toFixed(2)}s`;

/**
 * The picked effect clip's settings in one place, like an editor's inspector:
 * pick a clip on the transition, adjustment or sound lane and change it here
 * without hunting through panels.
 */
export function Inspector() {
  const fx = usePropUiStore((s) => s.fx);
  const selectFx = usePropUiStore((s) => s.selectFx);
  const style = useProjectStore((s) => s.style);
  const sfx = useProjectStore((s) => s.sfx);
  const sounds = useProjectStore((s) => s.sounds);
  const updateTransition = useProjectStore((s) => s.updateTransition);
  const updateAdjust = useProjectStore((s) => s.updateAdjust);
  const updateSfx = useProjectStore((s) => s.updateSfx);
  const removeTransition = useProjectStore((s) => s.removeTransition);
  const removeAdjust = useProjectStore((s) => s.removeAdjust);
  const removeSfx = useProjectStore((s) => s.removeSfx);
  const seek = usePlaybackStore((s) => s.seek);
  if (!fx) return null;

  const tr = fx.lane === "transition" ? style.transitions.find((c) => c.id === fx.id) : undefined;
  const adj = fx.lane === "adjust" ? style.adjustClips.find((c) => c.id === fx.id) : undefined;
  const snd = fx.lane === "sfx" ? sfx.find((c) => c.id === fx.id) : undefined;
  const clip = tr ?? adj ?? snd;
  if (!clip) return null;

  const title = tr ? "트랜지션" : adj ? "조정 레이어" : "효과음";
  const remove = () => {
    if (tr) removeTransition(tr.id);
    else if (adj) removeAdjust(adj.id);
    else if (snd) removeSfx(snd.id);
    selectFx(null);
  };

  return (
    <section aria-label={`${title} 설정`} className="space-y-2.5 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-300">{title}</h2>
        <button
          type="button"
          onClick={() => seek(Math.max(0, clip.start - 0.5))}
          className="font-mono text-[10px] text-zinc-500 hover:text-indigo-300"
          title="이 구간 조금 앞으로 이동"
        >
          {formatLrcTime(clip.start)} – {formatLrcTime(clip.end)}
        </button>
        <button
          type="button"
          onClick={remove}
          className="ml-auto text-[11px] text-red-300 hover:underline"
          title="Delete"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={() => selectFx(null)}
          aria-label="닫기"
          className="text-zinc-500 hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      {tr && (
        <>
          <Row label="종류">
            <select
              value={tr.kind}
              onChange={(e) => {
                const kind = e.target.value as TransitionKind;
                usePropUiStore.getState().setLastTransition(kind);
                updateTransition(tr.id, { kind });
              }}
              className={FIELD}
            >
              {(["빛", "카메라", "도형", "디지털"] as const).map((g) => (
                <optgroup key={g} label={g}>
                  {TRANSITIONS.filter((t) => t.group === g).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Row>
          {TRANSITION_BY_ID.get(tr.kind)?.colored && (
            <Row label="색">
              <span className="flex gap-1">
                {TRANSITION_COLORS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tr.color === id}
                    onClick={() => updateTransition(tr.id, { color: id as TransitionColor })}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${tr.color === id ? "border-indigo-500 bg-indigo-500/15 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </Row>
          )}
          <Row label="길이">
            <Slider
              label="트랜지션 길이"
              value={tr.end - tr.start}
              min={0.15}
              max={2}
              step={0.05}
              format={sec}
              onChange={(len) => {
                const mid = (tr.start + tr.end) / 2;
                updateTransition(tr.id, { start: Math.max(0, mid - len / 2), end: mid + len / 2 });
              }}
            />
          </Row>
        </>
      )}

      {adj && (
        <>
          <Row label="종류">
            <select
              value={adj.kind}
              onChange={(e) => updateAdjust(adj.id, { kind: e.target.value as AdjustKind })}
              className={FIELD}
            >
              {ADJUSTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="강도">
            <Slider
              label="강도"
              value={adj.amount}
              min={0}
              max={1}
              step={0.01}
              format={pct}
              onChange={(amount) => updateAdjust(adj.id, { amount })}
            />
          </Row>
          <Row label="들고 나기">
            <Slider
              label="서서히 들어오고 나가는 시간"
              value={adj.fade}
              min={0}
              max={Math.max(0.05, Math.min(2, (adj.end - adj.start) / 2))}
              step={0.05}
              format={sec}
              onChange={(fade) => updateAdjust(adj.id, { fade })}
            />
          </Row>
        </>
      )}

      {snd && (
        <>
          <Row label="소리">
            <span className="flex gap-1.5">
              <select
                value={snd.sound}
                onChange={(e) => {
                  const sound = e.target.value;
                  const len = soundLength(sound, sounds) ?? snd.end - snd.start;
                  updateSfx(snd.id, { sound, end: snd.start + len });
                }}
                className={FIELD}
              >
                {SFX_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {SFX.filter((s) => s.group === g).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {sounds.length > 0 && (
                  <optgroup label="내 소리">
                    {sounds.map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {soundLabel(`user:${u.id}`, sounds)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                aria-label="들어 보기"
                onClick={() => {
                  wakeSfx();
                  stopAllSfx();
                  void playClip(snd, sounds);
                }}
                className="shrink-0 rounded-md border border-zinc-800 px-2 text-zinc-300 hover:border-indigo-500"
              >
                ▶
              </button>
            </span>
          </Row>
          <Row label="크기">
            <Slider
              label="효과음 크기"
              value={snd.gain}
              min={0}
              max={1.5}
              step={0.05}
              format={pct}
              onChange={(gain) => updateSfx(snd.id, { gain })}
            />
          </Row>
        </>
      )}
    </section>
  );
}
