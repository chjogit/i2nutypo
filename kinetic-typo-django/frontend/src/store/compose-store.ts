import { create } from "zustand";
import type { StyleSettings } from "@/types/project";

/** One automatic composition, kept so the user can go back to it. */
export interface Composition {
  /** 0 for the user's own picks from before the first roll. */
  seed: number;
  style: StyleSettings;
  lyricsText: string;
}

const MAX_KEPT = 30;

interface ComposeStore {
  entries: Composition[];
  /** Index of the composition on screen, -1 before any. */
  at: number;
  /** Adds a composition after the current one (dropping any "next" ones) and makes it current. */
  push: (c: Composition) => void;
  /** Moves to the previous (-1) or next (+1) composition and returns it, or null at either end. */
  step: (delta: -1 | 1) => Composition | null;
}

/** Compositions of this page session (not saved). */
export const useComposeStore = create<ComposeStore>((set, get) => ({
  entries: [],
  at: -1,
  push: (c) =>
    set((s) => {
      const entries = [...s.entries.slice(0, s.at + 1), c].slice(-MAX_KEPT);
      return { entries, at: entries.length - 1 };
    }),
  step: (delta) => {
    const { entries, at } = get();
    const next = at + delta;
    if (next < 0 || next >= entries.length) return null;
    set({ at: next });
    return entries[next];
  },
}));
