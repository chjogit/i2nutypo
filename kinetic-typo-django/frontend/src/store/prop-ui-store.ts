import { create } from "zustand";
import type { TransitionKind } from "@/types/project";

/** A clip on one of the effect lanes (transitions, adjustment layers, sound effects). */
export interface FxPick {
  lane: "transition" | "adjust" | "sfx";
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
  selectFx: (pick: FxPick | null) => void;
  /** The transition last picked in the library, used by "add at the playhead". */
  lastTransition: TransitionKind;
  setLastTransition: (k: TransitionKind) => void;
}

export const usePropUiStore = create<PropUiStore>()((set) => ({
  selected: null,
  select: (selected) => set(selected ? { selected, themeClip: null, fx: null } : { selected }),
  themeClip: null,
  selectThemeClip: (themeClip) => set(themeClip ? { themeClip, selected: null, fx: null } : { themeClip }),
  fx: null,
  selectFx: (fx) => set(fx ? { fx, selected: null, themeClip: null } : { fx }),
  lastTransition: "whip",
  setLastTransition: (lastTransition) => set({ lastTransition }),
}));
