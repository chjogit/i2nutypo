import { create } from "zustand";
import { ensureAudioGraph } from "@/lib/audio/audio-graph";

/**
 * High-frequency playback state, kept apart from the project store so the
 * playhead can tick every frame without re-rendering editor panels. Read
 * currentTime with a narrow selector, or via getState() inside a RAF loop.
 *
 * When a song is loaded, its <audio> element (rendered in the audio section)
 * is the clock: play/pause/seek go through it, and its events keep isPlaying
 * in sync whichever control the user touched.
 */
interface PlaybackStore {
  isPlaying: boolean;
  currentTime: number;
  audioEl: HTMLAudioElement | null;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (currentTime: number) => void;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  play: () => Promise<void>;
  pause: () => void;
  seek: (t: number) => void;
}

export const usePlaybackStore = create<PlaybackStore>()((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  audioEl: null,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setAudioElement: (audioEl) => set({ audioEl, isPlaying: false, currentTime: 0 }),

  play: async () => {
    const { audioEl, currentTime } = get();
    if (!audioEl) {
      set({ isPlaying: true });
      return;
    }
    await ensureAudioGraph(audioEl);
    if (Math.abs(audioEl.currentTime - currentTime) > 0.05) audioEl.currentTime = currentTime;
    // isPlaying follows the element's "play" event
    await audioEl.play().catch(() => undefined);
  },

  pause: () => {
    const { audioEl } = get();
    if (audioEl) audioEl.pause();
    else set({ isPlaying: false });
  },

  seek: (t) => {
    const { audioEl } = get();
    if (audioEl) audioEl.currentTime = t;
    set({ currentTime: t });
  },
}));
