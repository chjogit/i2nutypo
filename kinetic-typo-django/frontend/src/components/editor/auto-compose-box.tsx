import { useState } from "react";
import { freshSeed } from "@/lib/random";
import { useComposeStore } from "@/store/compose-store";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

const BTN =
  "rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * One click rolls a whole look: themes, colors, elements, strengths and each
 * unlocked line's motion. Earlier rolls stay one click away, and a seed
 * gives the same roll again.
 */
export function AutoComposeBox() {
  const autoCompose = useProjectStore((s) => s.autoCompose);
  const restore = useProjectStore((s) => s.restoreComposition);
  const { entries, at, push, step } = useComposeStore();
  const [seedText, setSeedText] = useState("");

  const roll = (seed: number) => {
    // The user's own look goes first so "이전 안" can always get back to it
    if (entries.length === 0) {
      const s = useProjectStore.getState();
      push({ seed: 0, style: s.style, lyricsText: s.lyricsText });
    }
    autoCompose(seed);
    const s = useProjectStore.getState();
    push({ seed, style: s.style, lyricsText: s.lyricsText });
    setSeedText(String(seed));
  };
  const go = (delta: -1 | 1) => {
    const c = step(delta);
    if (!c) return;
    restore(c);
    setSeedText(c.seed ? String(c.seed) : "");
  };
  const typed = Number(seedText);
  const validSeed = Number.isInteger(typed) && typed > 0;

  return (
    <div className="space-y-2 rounded-lg border border-indigo-500/40 bg-indigo-500/5 p-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => roll(freshSeed())}
          className="flex-1 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"
        >
          🎲 자동 구성
        </button>
        <button type="button" onClick={() => go(-1)} disabled={at <= 0} className={BTN}>
          ◀ 이전 안
        </button>
        <button type="button" onClick={() => go(1)} disabled={at >= entries.length - 1} className={BTN}>
          다음 안 ▶
        </button>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <label className="flex items-center gap-1.5">
          시드
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="숫자"
            aria-label="시드"
            className="w-20 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <button type="button" onClick={() => roll(typed)} disabled={!validSeed} className={BTN}>
          이 시드로
        </button>
        {entries.length > 0 && (
          <span className="ml-auto text-zinc-500">
            {at === 0 ? "원래 안" : `${at}번째 안`} / {entries.length - 1}
          </span>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        테마·색·움직임을 한 번에
        <Tip>
          테마·색·요소·강도와 줄마다의 움직임을 한 번에 정합니다. 타임라인에서 잠근 줄은 그대로 둡니다. 같은
          시드는 같은 결과를 냅니다.
        </Tip>
      </p>
    </div>
  );
}
