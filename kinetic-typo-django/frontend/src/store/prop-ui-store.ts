import { create } from "zustand";

/**
 * What is picked in the timeline's illustration and theme lanes: an
 * illustration clip (edited in the illustration panel) or a theme clip
 * (edited in the theme tab). Picking one unpicks the other. Not saved.
 */
interface PropUiStore {
  selected: { propId: string; clipId: string } | null;
  select: (sel: { propId: string; clipId: string } | null) => void;
  /** The theme clip being edited, or null when the theme tab edits the whole video's themes. */
  themeClip: string | null;
  selectThemeClip: (id: string | null) => void;
}

export const usePropUiStore = create<PropUiStore>()((set) => ({
  selected: null,
  select: (selected) => set(selected ? { selected, themeClip: null } : { selected }),
  themeClip: null,
  selectThemeClip: (themeClip) => set(themeClip ? { themeClip, selected: null } : { themeClip }),
}));
