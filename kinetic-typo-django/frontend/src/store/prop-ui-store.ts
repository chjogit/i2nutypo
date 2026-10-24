import { create } from "zustand";
import type { TransitionKind } from "@/types/project";

/** A clip on one of the effect lanes (transitions, adjustment layers). */
export interface FxPick {
  lane: "transition" | "adjust";
  id: string;
}

/**
 * What is picked in the timeline's lanes: an illustration clip (edited in the
 * illustration panel), a theme clip (edited in the theme tab) or an effect
 * clip (edited in the inspector). Picking one unpicks the others. Not saved.
 */
interface PropUiStore {
  selected: { propId: string; clipId: string } | null;
  select: (sel: { propId: string; clipId: string } | null) => void;
  /** The theme clip being edited, or null when the theme tab edits the whole video's themes. */
  themeClip: string | null;
  selectThemeClip: (id: string | null) => void;
  fx: FxPick | null;
  /** Picks only this clip (or nothing), dropping any group. */
  selectFx: (pick: FxPick | null) => void;
  /**
   * Every effect clip picked together (Ctrl/Shift click), the main pick
   * included; empty or one entry when only one clip is picked.
   */
  fxGroup: FxPick[];
  /** Adds the clip to the group, or takes it out when it is already in. */
  toggleFx: (pick: FxPick) => void;
  /** Seconds the picked group is being dragged by, shown by every lane until it is dropped. */
  fxShift: number;
  setFxShift: (dt: number) => void;
  /** The transition last picked in the library, used by "add at the playhead". */
  lastTransition: TransitionKind;
  setLastTransition: (k: TransitionKind) => void;
}

/** True when the clip is the main pick or part of the picked group. */
export const isFxPicked = (
  s: Pick<PropUiStore, "fx" | "fxGroup">,
  lane: FxPick["lane"],
  id: string,
): boolean =>
  (s.fx?.lane === lane && s.fx.id === id) || s.fxGroup.some((p) => p.lane === lane && p.id === id);

export const usePropUiStore = create<PropUiStore>()((set) => ({
  selected: null,
  select: (selected) => set(selected ? { selected, themeClip: null, fx: null } : { selected }),
  themeClip: null,
  selectThemeClip: (themeClip) => set(themeClip ? { themeClip, selected: null, fx: null } : { themeClip }),
  fx: null,
  selectFx: (fx) => set(fx ? { fx, fxGroup: [fx], selected: null, themeClip: null } : { fx, fxGroup: [] }),
  fxGroup: [],
  toggleFx: (pick) =>
    set((s) => {
      const base = s.fxGroup.length > 0 ? s.fxGroup : s.fx ? [s.fx] : [];
      const has = base.some((p) => p.lane === pick.lane && p.id === pick.id);
      const fxGroup = has ? base.filter((p) => !(p.lane === pick.lane && p.id === pick.id)) : [...base, pick];
      return {
        fxGroup,
        fx: has ? (fxGroup[fxGroup.length - 1] ?? null) : pick,
        selected: null,
        themeClip: null,
      };
    }),
  fxShift: 0,
  setFxShift: (fxShift) => set({ fxShift }),
  lastTransition: "whip",
  setLastTransition: (lastTransition) => set({ lastTransition }),
}));
