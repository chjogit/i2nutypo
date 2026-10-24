import type { PropClip } from "@/types/project";
import { clipPresence } from "@/lib/props/clips";
import { clipReveal, revealAlpha } from "./cues";
import type { LookFrame } from "./frame";
import type { LoadedImage } from "./illustration";

/** An illustration on the timeline with its decoded picture. */
export interface PropLayer {
  img: LoadedImage;
  clips: readonly PropClip[];
}

const clipAt = (layer: PropLayer, t: number) => layer.clips.find((c) => t >= c.start && t < c.end);

/**
 * Red cells of the illustrations on screen at timeSec. A clip's cells hold
 * while at least half of it shows, so they let go halfway through its exit.
 */
export function propCellsAt(layers: readonly PropLayer[], timeSec: number): boolean[][] {
  const out: boolean[][] = [];
  for (const layer of layers) {
    const clip = clipAt(layer, timeSec);
    if (clip && clip.cells.some(Boolean) && clipPresence(clip, timeSec).reveal >= 0.5) out.push(clip.cells);
  }
  return out;
}

/**
 * Draws the illustrations on screen now that sit behind the lyrics (front
 * false) or over them (front true): coming on and going away with their
 * effects, swaying with their shake and bouncing on the beat.
 */
export function drawProps(f: LookFrame, front: boolean): void {
  if (!f.props) return;
  const { ctx, W, H } = f;
  for (const [n, layer] of f.props.entries()) {
    const clip = clipAt(layer, f.timeSec);
    if (!clip || clip.front !== front || layer.img.height <= 0) continue;
    const { reveal, effect } = clipPresence(clip, f.timeSec);
    const alpha = clip.opacity * revealAlpha(effect, reveal);
    if (alpha <= 0) continue;
    const h = clip.scale * H;
    const w = (layer.img.width / layer.img.height) * h;
    // Each illustration sways on its own phase
    const t = f.timeSec + n * 1.3;
    const sway = clip.shake * w * 0.04;
    const tilt = clip.shake * 4 * Math.sin(t * 1.9);
    const bounce = clip.beat * f.energy * h * 0.05;
    const cx = clip.x * W + Math.sin(t * 1.7) * sway;
    const cy = clip.y * H + Math.sin(t * 2.3 + 1) * sway * 0.3 - bounce;
    ctx.save();
    clipReveal(ctx, { x: cx - w / 2, y: cy - h / 2, w, h }, effect, reveal);
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(((clip.rot + tilt) * Math.PI) / 180);
    if (clip.flip) ctx.scale(-1, 1);
    // A beat squash keeps the bottom planted
    const squash = 1 + clip.beat * f.energy * 0.04;
    ctx.scale(1 / Math.sqrt(squash), squash);
    ctx.drawImage(layer.img.source, 0, 0, layer.img.width, layer.img.height, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
