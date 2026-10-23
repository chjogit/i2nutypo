import { useId, useState, type ReactNode } from "react";

/**
 * A section of controls that folds away: its title row toggles it, with an
 * optional slot on the right (a lock or reset button) that stays visible.
 */
export function Fold({
  title,
  right,
  defaultOpen = true,
  children,
  className = "space-y-2 border-t border-zinc-800/70 pt-3",
}: {
  title: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-zinc-300 hover:text-zinc-100"
        >
          <span aria-hidden className={`text-[10px] text-zinc-500 transition-transform ${open ? "" : "-rotate-90"}`}>
            ▾
          </span>
          <span className="truncate">{title}</span>
        </button>
        {right}
      </div>
      {open && (
        <div id={id} className="space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
