import { useEffect, useRef } from "react";
import { create } from "zustand";

/** One row of a right-click menu, or a divider. */
export type MenuItem =
  { label: string; onSelect: () => void; hint?: string; danger?: boolean; disabled?: boolean } | "sep";

interface MenuStore {
  menu: { x: number; y: number; title?: string; items: MenuItem[] } | null;
  open: (x: number, y: number, items: MenuItem[], title?: string) => void;
  close: () => void;
}

export const useContextMenu = create<MenuStore>()((set) => ({
  menu: null,
  open: (x, y, items, title) => set({ menu: { x, y, items, title } }),
  close: () => set({ menu: null }),
}));

/** Opens a right-click menu at the pointer. */
export function openMenu(
  e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void },
  items: MenuItem[],
  title?: string,
) {
  e.preventDefault();
  e.stopPropagation();
  useContextMenu.getState().open(e.clientX, e.clientY, items, title);
}

/** The one menu on the page; rendered once by the editor shell. */
export function ContextMenuHost() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") close();
        return;
      }
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", away);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", away);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, close]);

  if (!menu) return null;
  const w = 240;
  const h = menu.items.length * 30 + (menu.title ? 28 : 8);
  const left = Math.min(menu.x, window.innerWidth - w - 8);
  const top = Math.min(menu.y, window.innerHeight - h - 8);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.title ?? "메뉴"}
      style={{ left, top, width: w }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
      }}
      className="fixed z-[70] overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 text-xs text-zinc-200 shadow-2xl shadow-black/60"
    >
      {menu.title && (
        <div className="truncate px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {menu.title}
        </div>
      )}
      {menu.items.map((it, i) =>
        it === "sep" ? (
          <div key={i} role="separator" className="my-1 border-t border-zinc-800" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              close();
              it.onSelect();
            }}
            className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-indigo-500/15 focus:bg-indigo-500/20 focus:outline-none disabled:opacity-40 ${it.danger ? "text-red-300" : ""}`}
          >
            <span className="truncate">{it.label}</span>
            {it.hint && <span className="shrink-0 font-mono text-[10px] text-zinc-500">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
