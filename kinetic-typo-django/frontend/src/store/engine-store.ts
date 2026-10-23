import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_LOCAL_MODEL } from "@/lib/desktop/local-whisper";

/**
 * Which speech recognizer to use. A device preference rather than part of a
 * project, so it lives apart from the project store. "local" only applies in
 * the desktop app; the web build always uses the browser engine.
 */
export type RecognitionEngine = "browser" | "local";

interface EngineStore {
  engine: RecognitionEngine;
  localModelId: string;
  setEngine: (engine: RecognitionEngine) => void;
  setLocalModelId: (localModelId: string) => void;
}

export const useEngineStore = create<EngineStore>()(
  persist(
    (set) => ({
      engine: "browser",
      localModelId: DEFAULT_LOCAL_MODEL,
      setEngine: (engine) => set({ engine }),
      setLocalModelId: (localModelId) => set({ localModelId }),
    }),
    { name: "kinetic-typo-engine-v1", storage: createJSONStorage(() => localStorage) },
  ),
);
