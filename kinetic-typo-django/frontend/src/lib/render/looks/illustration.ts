import type { Ctx2D } from "../motifs";

/** A decoded image ready to draw, with its natural size. */
export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface IllustrationImages {
  background: LoadedImage | null;
  character: LoadedImage | null;
  /** Album cover picked apart from the background (album jacket theme). */
  cover?: LoadedImage | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Framing {
  /** Pan in -1..1 of the free margin on each axis. */
  panX: number;
  panY: number;
  /** 1 = just covering the frame. */
  zoom: number;
  /** Ken Burns amount 0..1; 0 holds the framing still. */
  motion: number;
}

/**
 * Source rectangle of an image that covers dest at the user's framing, with a
 * slow Ken Burns zoom/pan around it when motion is above 0.
 */
export function kenBurnsSource(
  img: LoadedImage,
  dest: Rect,
  timeSec: number,
  framing: Framing,
  energy: number,
): Rect {
  const { motion } = framing;
  const cover = Math.max(dest.w / img.width, dest.h / img.height);
  // One slow breath every ~40s plus a small kick on the beat
  const breathe =
    motion * (0.03 + 0.09 * (0.5 - 0.5 * Math.cos((timeSec * Math.PI * 2) / 40)) + energy * 0.012);
  const zoom = Math.max(1, framing.zoom) * (1 + breathe);
  const sw = dest.w / (cover * zoom);
  const sh = dest.h / (cover * zoom);
  const panX = Math.max(-1, Math.min(1, framing.panX + Math.sin(timeSec * 0.031) * motion * 0.5));
  const panY = Math.max(-1, Math.min(1, framing.panY + Math.cos(timeSec * 0.023) * motion * 0.3));
  return {
    x: (img.width - sw) / 2 + (panX * (img.width - sw)) / 2,
    y: (img.height - sh) / 2 + (panY * (img.height - sh)) / 2,
    w: sw,
    h: sh,
  };
}

export function drawImageRect(ctx: Ctx2D, img: LoadedImage, src: Rect, dest: Rect): void {
  ctx.drawImage(img.source, src.x, src.y, src.w, src.h, dest.x, dest.y, dest.w, dest.h);
}

/** Redraws one horizontal band of an already-placed image shifted sideways (glitch displacement). */
export function drawImageBand(
  ctx: Ctx2D,
  img: LoadedImage,
  src: Rect,
  dest: Rect,
  bandY: number,
  bandH: number,
  shiftX: number,
): void {
  const ky = src.h / dest.h;
  ctx.drawImage(
    img.source,
    src.x,
    src.y + (bandY - dest.y) * ky,
    src.w,
    bandH * ky,
    dest.x + shiftX,
    bandY,
    dest.w,
    bandH,
  );
}

/** Draws the character PNG into its rect (feet on the bottom edge), with beat squash and optional mirror. */
export function drawCharacter(
  ctx: Ctx2D,
  img: LoadedImage,
  rect: Rect,
  opts: { bounce: number; tilt: number; flip: boolean; alpha?: number },
): void {
  // Squash and stretch on the beat, anchored at the feet
  const squash = 1 - opts.bounce * 0.06;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h - opts.bounce * rect.h * 0.05);
  ctx.rotate(opts.tilt);
  ctx.scale((opts.flip ? -1 : 1) / squash, squash);
  ctx.drawImage(img.source, 0, 0, img.width, img.height, -rect.w / 2, -rect.h, rect.w, rect.h);
  ctx.restore();
}
