import { useState } from "react";
import { freshSeed } from "@/lib/random";
import { useComposeStore } from "@/store/compose-store";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

// Every control in the box shares one height and one radius so the rows line up
const CTRL = "h-8 rounded-md text-xs";
const BTN = `${CTRL} border border-zinc-800 px-3 text-zinc-300 hover:border-tide-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300`;

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
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
      <button
        type="button"
        onClick={() => roll(freshSeed())}
        className={`${CTRL} col-span-2 bg-tide-500 px-3 font-semibold text-zinc-950 hover:bg-tide-400`}
      >
        자동 구성
      </button>
      <button type="button" onClick={() => go(-1)} disabled={at <= 0} className={BTN}>
        이전 안
      </button>
      <button type="button" onClick={() => go(1)} disabled={at >= entries.length - 1} className={BTN}>
        다음 안
      </button>
      <div className="col-span-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <label htmlFor="auto-compose-seed" className="text-xs text-zinc-400">
          시드
        </label>
        <input
          id="auto-compose-seed"
          value={seedText}
          onChange={(e) => setSeedText(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && validSeed) roll(typed);
          }}
          inputMode="numeric"
          placeholder="숫자 6자리까지"
          className={`${CTRL} min-w-0 border border-zinc-800 bg-zinc-950 px-2 font-mono tabular-nums text-zinc-100 placeholder:font-sans placeholder:text-zinc-600 focus:border-tide-500 focus:outline-none`}
        />
        <button type="button" onClick={() => roll(typed)} disabled={!validSeed} className={BTN}>
          이 시드로
        </button>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
        <p className="flex items-center gap-1.5">
          테마·색·움직임을 한 번에
          <Tip>
            테마·색·요소·강도와 줄마다의 움직임을 한 번에 정합니다. 타임라인에서 잠근 줄은 그대로 둡니다. 같은
            시드는 같은 결과를 냅니다.
          </Tip>
        </p>
        <span aria-live="polite" className="shrink-0 tabular-nums text-zinc-300">
          {entries.length > 0 ? `${at === 0 ? "원래 안" : `${at}번째 안`} / ${entries.length - 1}` : ""}
        </span>
      </div>
    </div>
  );
}
