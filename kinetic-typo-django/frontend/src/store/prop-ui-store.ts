import { create } from "zustand";

/** The prop clip picked in the illustration timeline, edited in the props panel. Not saved. */
interface PropUiStore {
  selected: { propId: string; clipId: string } | null;
  select: (sel: { propId: string; clipId: string } | null) => void;
}

export const usePropUiStore = create<PropUiStore>()((set) => ({
  selected: null,
  select: (selected) => set({ selected }),
}));
