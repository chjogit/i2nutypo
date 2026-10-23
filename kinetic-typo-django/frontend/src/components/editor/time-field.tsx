import { useState } from "react";
import { usePlaybackStore } from "@/store/playback-store";

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/** Seconds typed in a box, saved on Enter or leaving it; "지금" takes the playhead time. */
export function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text);
    if (Number.isFinite(v) && v >= 0) onCommit(Math.round(v * 100) / 100);
    setText(null);
  };
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
      <span className="w-12 shrink-0">{label}</span>
      <input
        type="number"
        min={0}
        step={0.1}
        value={text ?? value.toFixed(2)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        aria-label={`${label} (초)`}
        className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 font-mono text-zinc-100 focus:border-indigo-500 focus:outline-none"
      />
      <span className="font-mono text-zinc-500">{fmtTime(value)}</span>
      <button
        type="button"
        onClick={() => onCommit(Math.round(usePlaybackStore.getState().currentTime * 100) / 100)}
        title="재생 위치의 시간 넣기"
        className="ml-auto rounded border border-zinc-800 px-1.5 text-zinc-300 hover:border-indigo-500"
      >
        ⏱ 지금
      </button>
    </span>
  );
}
