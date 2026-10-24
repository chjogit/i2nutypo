import { useEffect, useMemo, useRef, useState } from "react";
import { quickActions, type QuickAction } from "@/lib/actions/quick-actions";
import { useLayoutStore } from "@/store/layout-store";
import { isTextEntry } from "@/lib/ui/text-entry";
import { FEATURES_NOW } from "@/lib/mode/mode";

// One-key shortcuts for the actions that carry them (T, W, A)
const SINGLE_KEYS = new Set(["t", "w", "a"]);

/** Every word of the query appears in the label or group, in any order. */
const matches = (a: QuickAction, q: string) => {
  const hay = `${a.label} ${a.group}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};

/**
 * Ctrl(⌘)+K: type a few letters and run a repeated editing step in one go,
 * instead of finding its button.
 */
export function CommandPalette() {
  const open = useLayoutStore((s) => s.paletteOpen);
  const setLayout = useLayoutStore((s) => s.set);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLayout({ paletteOpen: !useLayoutStore.getState().paletteOpen });
        return;
      }
      if (!FEATURES_NOW.themeMix || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTextEntry(e.target))
        return;
      const key = e.key.toLowerCase();
      if (!SINGLE_KEYS.has(key) || useLayoutStore.getState().paletteOpen) return;
      const a = quickActions().find((x) => x.hint?.toLowerCase() === key);
      if (a) {
        e.preventDefault();
        void a.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLayout]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Rebuilt when opened so labels that depend on the current state are right
  const all = useMemo(() => (open ? quickActions() : []), [open]);
  const list = all.filter((a) => matches(a, q));
  const close = () => setLayout({ paletteOpen: false });

  const run = async (a: QuickAction | undefined) => {
    if (!a || (a.enabled && !a.enabled())) return;
    close();
    await a.run();
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-label="빠른 작업"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(list.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              void run(list[active]);
            }
          }}
          placeholder="할 일 찾기 (예: 트랜지션, 비트, 레이아웃)"
          aria-label="빠른 작업 검색"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <ul role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {list.map((a, i) => {
            const off = a.enabled ? !a.enabled() : false;
            return (
              <li key={a.id} role="option" aria-selected={i === active} aria-disabled={off}>
                <button
                  type="button"
                  disabled={off}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void run(a)}
                  className={`flex w-full items-center gap-3 px-4 py-1.5 text-left text-xs ${i === active ? "bg-indigo-500/20 text-zinc-50" : "text-zinc-300"} disabled:text-zinc-600`}
                >
                  <span className="w-16 shrink-0 text-[10px] text-zinc-500">{a.group}</span>
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {a.hint && (
                    <kbd className="rounded border border-zinc-700 px-1 font-mono text-[10px] text-zinc-400">
                      {a.hint}
                    </kbd>
                  )}
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="px-4 py-3 text-xs text-zinc-500">맞는 작업이 없습니다.</li>}
        </ul>
      </div>
    </div>
  );
}
