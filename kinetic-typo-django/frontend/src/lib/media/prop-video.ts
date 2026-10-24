import type { PropAsset, PropClip } from "@/types/project";
import type { LoadedImage } from "@/lib/render/looks/illustration";
import { loopTime, openVideoReader, type VideoFrameReader } from "./video-bg";

// Moving illustrations: a video on an illustration lane plays from the start
// of each of its clips and loops while the clip lasts. The preview keeps one
// muted <video> per such prop in step with the song; the export decodes the
// exact frame for every output frame.

/** Where in the video a prop is at song time t: from its clip's start, looped; null off its clips. */
export function propVideoTime(clips: readonly PropClip[], duration: number, t: number): number | null {
  const c = clips.find((x) => t >= x.start && t < x.end);
  return c ? loopTime(t - c.start, duration) : null;
}

const players = new Map<string, { url: string; el: HTMLVideoElement }>();

function player(p: PropAsset): HTMLVideoElement {
  let entry = players.get(p.id);
  if (!entry || entry.url !== p.objectUrl) {
    entry?.el.removeAttribute("src");
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.src = p.objectUrl;
    entry = { url: p.objectUrl, el };
    players.set(p.id, entry);
  }
  return entry.el;
}

/** This preview frame of every video illustration on screen, by prop id. */
export function previewPropVideos(
  props: readonly PropAsset[],
  t: number,
  playing: boolean,
): Map<string, LoadedImage> {
  const out = new Map<string, LoadedImage>();
  const live = new Set<string>();
  for (const p of props) {
    if (!p.video || !p.onTimeline) continue;
    live.add(p.id);
    const v = player(p);
    const want = propVideoTime(p.clips, p.video.duration || v.duration || 0, t);
    if (want === null) {
      if (!v.paused) v.pause();
      continue;
    }
    if (playing) {
      if (v.paused) void v.play().catch(() => undefined);
      if (Math.abs(v.currentTime - want) > 0.3 && !v.seeking) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.04 && !v.seeking) v.currentTime = want;
    }
    if (v.readyState >= 2 && v.videoWidth)
      out.set(p.id, { source: v, width: v.videoWidth, height: v.videoHeight });
  }
  // Props removed or taken off the timeline let go of their players
  for (const [id, entry] of players) {
    if (live.has(id)) continue;
    entry.el.pause();
    entry.el.removeAttribute("src");
    entry.el.load();
    players.delete(id);
  }
  return out;
}

/** Frame readers for the export's video illustrations; call next() once per output frame. */
export async function openPropVideoReaders(
  props: readonly PropAsset[],
  times: readonly number[],
  maxWidth: number,
): Promise<{ next: () => Promise<Map<string, LoadedImage>>; dispose: () => void }> {
  const readers: Array<{ id: string; reader: VideoFrameReader; on: boolean[] }> = [];
  for (const p of props) {
    if (!p.video || !p.onTimeline || p.clips.length === 0) continue;
    const dur = p.video.duration;
    const local = times.map((t) => propVideoTime(p.clips, dur, t));
    const reader = await openVideoReader(
      { fileName: p.fileName, objectUrl: p.objectUrl, width: p.width, height: p.height, duration: dur },
      // The reader loops by the video's length itself; off-clip frames read the first frame
      local.map((x) => x ?? 0),
      maxWidth,
    ).catch(() => null);
    if (reader) readers.push({ id: p.id, reader, on: local.map((x) => x !== null) });
  }
  let i = 0;
  const last = new Map<string, LoadedImage>();
  return {
    next: async () => {
      const out = new Map<string, LoadedImage>();
      for (const r of readers) {
        const frame = (await r.reader.next()) ?? last.get(r.id) ?? null;
        if (frame) last.set(r.id, frame);
        if (frame && r.on[i]) out.set(r.id, frame);
      }
      i++;
      return out;
    },
    dispose: () => {
      for (const r of readers) r.reader.dispose();
    },
  };
}
