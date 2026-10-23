import type { CharacterCue, CueEffect, IllustrationSettings } from "@/types/project";
import type { Ctx2D } from "../motifs";
import type { Rect } from "./illustration";

export const CUE_EFFECTS: ReadonlyArray<readonly [CueEffect, string]> = [
  ["fade", "흐려지기"],
  ["wipeDown", "위에서부터 지우기"],
  ["wipeSide", "옆으로 지우기"],
  ["iris", "동그랗게 오므리기"],
];

export const MIN_CUE_FADE = 0.1;
export const MAX_CUE_FADE = 3;

const isEffect = (v: unknown): v is CueEffect => CUE_EFFECTS.some(([id]) => id === v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps well-formed cues from saved data, in time order, each coming back after it leaves. */
export function sanitizeCues(saved: unknown): CharacterCue[] {
  if (!Array.isArray(saved)) return [];
  const out: CharacterCue[] = [];
  for (const v of saved) {
    if (!v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    const hideAt = Math.max(0, num(c.hideAt, NaN));
    if (!Number.isFinite(hideAt)) continue;
    out.push({
      hideAt,
      showAt: Math.max(hideAt, num(c.showAt, hideAt + 2)),
      effect: isEffect(c.effect) ? c.effect : "fade",
      fade: clamp(num(c.fade, 0.6), MIN_CUE_FADE, MAX_CUE_FADE),
      x: clamp(num(c.x, 0.5), -0.2, 1.2),
      y: clamp(num(c.y, 1), 0.15, 1.4),
    });
  }
  return sortCues(out);
}

export const sortCues = (cues: readonly CharacterCue[]): CharacterCue[] =>
  [...cues].sort((a, b) => a.hideAt - b.hideAt);

/**
 * Which no-lyric cells apply: the user's ("user"), none while the character
 * is gone ("off"), or the ones it covers where it came back ("moved").
 */
export type CueCells = "user" | "off" | "moved";

export interface CharacterMoment {
  /** Character center x and feet y as shares of the frame. */
  x: number;
  y: number;
  /** 1 fully shown, 0 gone. */
  reveal: number;
  /** Effect of the transition under way (or the last one). */
  effect: CueEffect;
  cells: CueCells;
}

/** Where the character is and how much of it shows at timeSec, from its cues. */
export function characterAt(ill: IllustrationSettings, timeSec: number): CharacterMoment {
  let at: CharacterMoment = { x: ill.charX, y: ill.charY, reveal: 1, effect: "fade", cells: "user" };
  for (const c of ill.charCues ?? []) {
    if (timeSec < c.hideAt) break;
    const leaveEnd = Math.min(c.hideAt + c.fade, c.showAt);
    if (timeSec < c.showAt) {
      // Leaving, then gone; the cells let go halfway through the exit
      const reveal = timeSec < leaveEnd ? 1 - (timeSec - c.hideAt) / Math.max(0.01, leaveEnd - c.hideAt) : 0;
      return { ...at, reveal, effect: c.effect, cells: reveal > 0.5 ? at.cells : "off" };
    }
    // Back at its new place; its cells there apply from the moment it starts to return
    at = {
      x: c.x,
      y: c.y,
      reveal: Math.min(1, (timeSec - c.showAt) / c.fade),
      effect: c.effect,
      cells: "moved",
    };
  }
  return at;
}

/**
 * Clips to the part of the character that shows at this reveal. The clip is
 * set on ctx; the caller wraps it in save/restore. Fade is left to alpha.
 */
export function clipReveal(ctx: Ctx2D, rect: Rect, effect: CueEffect, reveal: number): void {
  if (reveal >= 1 || effect === "fade") return;
  // A little slack around the rect for the beat bounce and tilt
  const pad = Math.max(rect.w, rect.h) * 0.1;
  const r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  ctx.beginPath();
  if (effect === "wipeDown") ctx.rect(r.x, r.y + r.h * (1 - reveal), r.w, r.h * reveal);
  else if (effect === "wipeSide") ctx.rect(r.x, r.y, r.w * reveal, r.h);
  else ctx.arc(r.x + r.w / 2, r.y + r.h / 2, (Math.hypot(r.w, r.h) / 2) * reveal, 0, Math.PI * 2);
  ctx.clip();
}

/** Alpha for the reveal: fades fully for "fade", and softens the other masks only at the very end. */
export function revealAlpha(effect: CueEffect, reveal: number): number {
  return effect === "fade" ? reveal : Math.min(1, reveal * 6);
}
