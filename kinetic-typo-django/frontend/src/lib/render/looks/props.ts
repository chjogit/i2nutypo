import type { PropClip } from "@/types/project";
import { clipAlpha } from "@/lib/props/clips";
import type { LookFrame } from "./frame";
import type { LoadedImage } from "./illustration";

/** A prop on the timeline with its decoded picture. */
export interface PropLayer {
  img: LoadedImage;
  clips: readonly PropClip[];
}

/** Draws the props on screen now that sit behind the lyrics (front false) or over them (front true). */
export function drawProps(f: LookFrame, front: boolean): void {
  if (!f.props) return;
  const { ctx, W, H } = f;
  for (const layer of f.props) {
    const clip = layer.clips.find((c) => f.timeSec >= c.start && f.timeSec < c.end);
    if (!clip || clip.front !== front || layer.img.height <= 0) continue;
    const alpha = clipAlpha(clip, f.timeSec);
    if (alpha <= 0) continue;
    const h = clip.scale * H;
    const w = (layer.img.width / layer.img.height) * h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(clip.x * W, clip.y * H);
    ctx.rotate((clip.rot * Math.PI) / 180);
    if (clip.flip) ctx.scale(-1, 1);
    ctx.drawImage(layer.img.source, 0, 0, layer.img.width, layer.img.height, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
