import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import type { VideoAsset } from "@/types/project";
import type { LoadedImage } from "@/lib/render/looks/illustration";

// A moving background drawn where the background picture goes. The preview
// plays a muted <video> that follows the song's clock; the export decodes the
// exact frame for each output frame with WebCodecs. The video loops when it
// is shorter than the song. Everything stays in the browser.

/** Time inside a looping video of length `dur` for song time t. */
export const loopTime = (t: number, dur: number): number => (dur > 0.05 ? ((t % dur) + dur) % dur : 0);

let el: HTMLVideoElement | null = null;
let elUrl = "";

function previewElement(asset: VideoAsset): HTMLVideoElement {
  if (!el) {
    el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.loop = true;
  }
  if (elUrl !== asset.objectUrl) {
    elUrl = asset.objectUrl;
    el.src = asset.objectUrl;
  }
  return el;
}

/** The preview's current background frame, kept in step with the song; null until it can draw. */
export function previewVideoFrame(asset: VideoAsset | null, t: number, playing: boolean): LoadedImage | null {
  if (!asset || typeof document === "undefined") {
    if (el && !el.paused) el.pause();
    return null;
  }
  const v = previewElement(asset);
  const want = loopTime(t, asset.duration || v.duration || 0);
  if (playing) {
    if (v.paused) void v.play().catch(() => undefined);
    if (Math.abs(v.currentTime - want) > 0.3 && !v.seeking) v.currentTime = want;
  } else {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - want) > 0.04 && !v.seeking) v.currentTime = want;
  }
  if (v.readyState < 2 || !v.videoWidth) return null;
  return { source: v, width: v.videoWidth, height: v.videoHeight };
}

/** Stops and lets go of the preview video (when the background video is removed). */
export function releasePreviewVideo(): void {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  elUrl = "";
}

/** Reads a video file's size and length. */
export function probeVideo(objectUrl: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = () => {
      v.onloadedmetadata = null;
      v.onerror = null;
      v.removeAttribute("src");
    };
    v.onloadedmetadata = () => {
      const r = { width: v.videoWidth, height: v.videoHeight, duration: v.duration };
      done();
      if (!r.width || !Number.isFinite(r.duration)) reject(new Error("영상 크기나 길이를 읽지 못했습니다."));
      else resolve(r);
    };
    v.onerror = () => {
      done();
      reject(new Error("이 브라우저가 재생할 수 없는 영상입니다."));
    };
    v.src = objectUrl;
  });
}

/** Frame source for an export: one call per output frame, in order. */
export interface VideoFrameReader {
  next: () => Promise<LoadedImage | null>;
  dispose: () => void;
}

/**
 * Decodes the frames at the given song times (looped into the video) with
 * mediabunny; falls back to seeking a <video> when the codec cannot be decoded.
 */
export async function openVideoReader(
  asset: VideoAsset,
  times: readonly number[],
  maxWidth: number,
): Promise<VideoFrameReader> {
  const blob = await (await fetch(asset.objectUrl)).blob();
  const dur = asset.duration;
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error("decode");
    const width = Math.min(maxWidth, track.displayWidth);
    const sink = new CanvasSink(track, { width, poolSize: 2 });
    const start = await track.getFirstTimestamp();
    const iter = sink.canvasesAtTimestamps(times.map((t) => start + loopTime(t, dur)));
    return {
      next: async () => {
        const r = await iter.next();
        const c = r.done ? null : r.value?.canvas;
        return c ? { source: c as CanvasImageSource, width: c.width, height: c.height } : null;
      },
      dispose: () => {
        void iter.return(undefined);
        input.dispose();
      },
    };
  } catch {
    return seekReader(asset, times);
  }
}

function seekReader(asset: VideoAsset, times: readonly number[]): VideoFrameReader {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.src = asset.objectUrl;
  let i = 0;
  return {
    next: async () => {
      const t = loopTime(times[i++] ?? 0, asset.duration);
      if (v.readyState < 1)
        await new Promise<void>((r) => v.addEventListener("loadedmetadata", () => r(), { once: true }));
      if (Math.abs(v.currentTime - t) > 0.001) {
        await new Promise<void>((r) => {
          const timer = setTimeout(r, 2000);
          v.addEventListener(
            "seeked",
            () => {
              clearTimeout(timer);
              r();
            },
            { once: true },
          );
          v.currentTime = t;
        });
      }
      return v.videoWidth ? { source: v, width: v.videoWidth, height: v.videoHeight } : null;
    },
    dispose: () => {
      v.removeAttribute("src");
      v.load();
    },
  };
}
