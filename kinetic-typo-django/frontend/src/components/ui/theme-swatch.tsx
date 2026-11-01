import { getLookPreset } from "@/lib/render/looks/presets";
import type { LookPresetId } from "@/types/project";

/**
 * A theme's own three colors as a small tile (background, lyric color and the
 * accent as a short bar), so a list of themes reads by color and not by icon.
 */
export function ThemeSwatch({ id, className = "" }: { id: LookPresetId; className?: string }) {
  const { palette } = getLookPreset(id);
  return (
    <span
      aria-hidden
      className={`inline-flex h-4 w-6 shrink-0 flex-col justify-center gap-[3px] rounded-[3px] border border-white/15 px-[3px] align-middle ${className}`}
      style={{ background: palette.bgColor }}
    >
      <span className="block h-[2px] w-full rounded-full" style={{ background: palette.textColor }} />
      <span className="block h-[2px] w-2/3 rounded-full" style={{ background: palette.accentColor }} />
    </span>
  );
}
