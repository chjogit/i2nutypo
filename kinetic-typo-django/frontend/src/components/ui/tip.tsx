import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A small "?" that explains something on hover, focus or click, so long
 * explanations stay out of the panels. A click keeps it open until the next
 * click outside or Esc.
 */
export function Tip({
  children,
  label = "설명 보기",
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = hover || pinned;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const above = r.top > window.innerHeight * 0.55;
      setPos({
        left: Math.min(Math.max(8, r.left + r.width / 2 - 140), window.innerWidth - 288),
        top: above ? r.top - 6 : r.bottom + 6,
        above,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !btn.current?.contains(e.target as Node))
        setPinned(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [pinned]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={pinned}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((v) => !v);
        }}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[10px] font-bold leading-none text-zinc-400 hover:border-indigo-400 hover:text-indigo-200 focus:border-indigo-400 focus:outline-none ${pinned ? "border-indigo-400 text-indigo-200" : ""} ${className}`}
      >
        ?
      </button>
      {open && pos && (
        <div
          id={id}
          role="tooltip"
          style={{ left: pos.left, top: pos.top, transform: pos.above ? "translateY(-100%)" : undefined }}
          className="pointer-events-none fixed z-[60] w-[280px] rounded-md border border-zinc-700 bg-zinc-900/98 px-3 py-2 text-[11px] font-normal leading-relaxed text-zinc-200 shadow-xl shadow-black/50"
        >
          {children}
        </div>
      )}
    </>
  );
}

/** A heading with its explanation behind a "?". */
export function TipLabel({
  children,
  tip,
  className = "",
}: {
  children: ReactNode;
  tip: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {children}
      <Tip>{tip}</Tip>
    </span>
  );
}
