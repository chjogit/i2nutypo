import { create } from "zustand";

/**
 * What is picked in the illustration timeline: a prop clip (edited in the props
 * panel) or a character exit (its return place edited on the illustration
 * panel's stage). Not saved.
 */
interface PropUiStore {
  selected: { propId: string; clipId: string } | null;
  select: (sel: { propId: string; clipId: string } | null) => void;
  /** Index of the character cue being edited, or null. */
  cue: number | null;
  selectCue: (cue: number | null) => void;
  /** The character is picked: its settings show in the illustration section. */
  character: boolean;
  selectCharacter: (on: boolean) => void;
}

export const usePropUiStore = create<PropUiStore>()((set) => ({
  selected: null,
  // Picking a prop clip unpicks the character, and the other way round
  select: (selected) => set(selected ? { selected, character: false, cue: null } : { selected }),
  cue: null,
  selectCue: (cue) => set(cue === null ? { cue } : { cue, character: true, selected: null }),
  character: false,
  selectCharacter: (character) => set(character ? { character, selected: null } : { character, cue: null }),
}));
