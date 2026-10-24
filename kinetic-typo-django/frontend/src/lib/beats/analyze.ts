import type { AudioSource, BeatGrid } from "@/types/project";
import { mixDown } from "@/lib/export/beat-envelope";
import { detectBeats } from "./detect";

/** Decodes the loaded song and finds its beats; null without a song. All in the browser. */
export async function analyzeSongBeats(audio: AudioSource): Promise<BeatGrid | null> {
  if (audio.kind !== "upload") return null;
  const data = await (await fetch(audio.objectUrl)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 22050);
  const song = await ctx.decodeAudioData(data);
  // Let the page show that the work started before the heavy part runs
  await new Promise((r) => setTimeout(r, 30));
  const mono = mixDown(Array.from({ length: song.numberOfChannels }, (_, c) => song.getChannelData(c)));
  return detectBeats(mono, song.sampleRate);
}
