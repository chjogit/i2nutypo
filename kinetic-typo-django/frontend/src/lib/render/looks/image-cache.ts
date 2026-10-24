import type { IllustrationAssets, PropAsset } from "@/types/project";
import type { IllustrationImages, LoadedImage } from "./illustration";
import type { PropLayer } from "./props";

/**
 * Decoded <img> elements keyed by object URL. A URL starts loading on first
 * request and resolves to null until decoded, so the render loop never waits.
 */
const cache = new Map<string, { img: HTMLImageElement; ready: boolean }>();

export function getImage(objectUrl: string): LoadedImage | null {
  let entry = cache.get(objectUrl);
  if (!entry) {
    const img = new Image();
    entry = { img, ready: false };
    const e = entry;
    img.onload = () => {
      e.ready = true;
    };
    img.src = objectUrl;
    cache.set(objectUrl, entry);
  }
  return entry.ready
    ? { source: entry.img, width: entry.img.naturalWidth, height: entry.img.naturalHeight }
    : null;
}

/** Drops a decoded image; call before revoking its object URL. */
export function forgetImage(objectUrl: string): void {
  const entry = cache.get(objectUrl);
  if (!entry) return;
  entry.img.onload = null;
  entry.img.removeAttribute("src");
  cache.delete(objectUrl);
}

export function resolveIllustrationImages(assets: IllustrationAssets): IllustrationImages {
  return {
    background: assets.background ? getImage(assets.background.objectUrl) : null,
    character: assets.character ? getImage(assets.character.objectUrl) : null,
    cover: assets.cover ? getImage(assets.cover.objectUrl) : null,
  };
}

/** Props on the timeline whose pictures are decoded, in list order (later ones on top). */
export function resolvePropLayers(
  props: readonly PropAsset[],
  videoFrames?: ReadonlyMap<string, LoadedImage>,
): PropLayer[] {
  const out: PropLayer[] = [];
  for (const p of props) {
    if (!p.onTimeline || p.clips.length === 0) continue;
    // A video illustration draws its current frame; without one this frame it is skipped
    const img = p.video ? (videoFrames?.get(p.id) ?? null) : getImage(p.objectUrl);
    if (img) out.push({ img, clips: p.clips });
  }
  return out;
}
