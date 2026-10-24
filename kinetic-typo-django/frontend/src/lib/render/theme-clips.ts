import type { StyleSettings, ThemeClip } from "@/types/project";
import { getLookPreset, isThemedPresetId, sanitizeMixLooks } from "./looks/presets";

/** The theme clip covering timeSec, if any. */
export function themeClipAt(clips: readonly ThemeClip[] | undefined, timeSec: number): ThemeClip | null {
  return clips?.find((c) => timeSec >= c.start && timeSec < c.end) ?? null;
}

/**
 * The style for a moment of the song: inside a theme clip its themes, with the
 * colors and fonts of its background theme; elsewhere the whole video's picks.
 */
export function themeAt(style: StyleSettings, timeSec: number): StyleSettings {
  const clip = themeClipAt(style.themeClips, timeSec);
  if (!clip) return style;
  return {
    ...style,
    ...getLookPreset(clip.lookPreset).palette,
    lookPreset: clip.lookPreset,
    mixLooks: clip.mixLooks,
    lyricLook: clip.lyricLook,
  };
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Well-formed theme clips from saved data, in time order and not overlapping. */
export function sanitizeThemeClips(saved: unknown): ThemeClip[] {
  if (!Array.isArray(saved)) return [];
  const out: ThemeClip[] = [];
  for (const v of saved) {
    if (!v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    const start = Math.max(0, num(c.start, NaN));
    const end = num(c.end, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (!isThemedPresetId(c.lookPreset)) continue;
    const mixLooks = sanitizeMixLooks(c.mixLooks)
      .filter((m) => m !== c.lookPreset)
      .slice(0, 2);
    out.push({
      id: typeof c.id === "string" ? c.id : `theme-${out.length}`,
      start,
      end,
      lookPreset: c.lookPreset,
      mixLooks,
      lyricLook: isThemedPresetId(c.lyricLook) && mixLooks.includes(c.lyricLook) ? c.lyricLook : null,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out.filter((c, i) => i === 0 || c.start >= out[i - 1].end);
}

type Themed = ThemeClip["lookPreset"];

/** A clip's picks with one theme picked or unpicked (at most three, never none). */
export function toggleClipTheme(clip: ThemeClip, id: Themed): Partial<ThemeClip> {
  const picked = [clip.lookPreset, ...clip.mixLooks];
  if (picked.includes(id)) {
    if (picked.length === 1) return {};
    const rest = picked.filter((p) => p !== id);
    return {
      lookPreset: rest[0],
      mixLooks: rest.slice(1),
      lyricLook: clip.lyricLook === id ? null : clip.lyricLook,
    };
  }
  if (picked.length >= 3) return {};
  return { mixLooks: [...clip.mixLooks, id] };
}

/** A clip's picks with a picked theme made its background theme. */
export function setClipBase(clip: ThemeClip, id: Themed): Partial<ThemeClip> {
  const picked = [clip.lookPreset, ...clip.mixLooks];
  if (!picked.includes(id) || clip.lookPreset === id) return {};
  return {
    lookPreset: id,
    mixLooks: picked.filter((p) => p !== id),
    lyricLook: clip.lyricLook === id ? null : clip.lyricLook,
  };
}
