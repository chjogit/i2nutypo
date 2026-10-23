import type { Ctx2D } from "./motifs";

/** An area of the canvas in canvas pixels. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where the last frame drew its lyrics, for the preview's text box handles. */
export interface TextBounds {
  lyrics: Box | null;
}

/** Text drawn fainter than this (ghost words, fades) does not grow the box. */
const MIN_ALPHA = 0.05;

/**
 * Runs draw and returns the canvas area covered by every fillText and
 * strokeText it made, through whatever transform was current, or null when it
 * drew no text. ctx's own methods are put back afterwards.
 */
export function recordTextBounds(ctx: Ctx2D, draw: () => void): Box | null {
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const fillText = ctx.fillText;
  const strokeText = ctx.strokeText;

  const add = (text: string, x: number, y: number, maxWidth?: number) => {
    if (ctx.globalAlpha < MIN_ALPHA || !text) return;
    const m = ctx.measureText(text);
    const squeeze = maxWidth !== undefined && m.width > maxWidth ? maxWidth / m.width : 1;
    const left = x - m.actualBoundingBoxLeft * squeeze;
    const right = x + m.actualBoundingBoxRight * squeeze;
    const top = y - m.actualBoundingBoxAscent;
    const bottom = y + m.actualBoundingBoxDescent;
    const t = ctx.getTransform();
    for (const [px, py] of [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ]) {
      const p = t.transformPoint({ x: px, y: py });
      box.x0 = Math.min(box.x0, p.x);
      box.y0 = Math.min(box.y0, p.y);
      box.x1 = Math.max(box.x1, p.x);
      box.y1 = Math.max(box.y1, p.y);
    }
  };

  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    add(text, x, y, maxWidth);
    fillText.call(ctx, text, x, y, maxWidth);
  };
  ctx.strokeText = (text: string, x: number, y: number, maxWidth?: number) => {
    add(text, x, y, maxWidth);
    strokeText.call(ctx, text, x, y, maxWidth);
  };
  try {
    draw();
  } finally {
    Reflect.deleteProperty(ctx, "fillText");
    Reflect.deleteProperty(ctx, "strokeText");
  }
  return Number.isFinite(box.x0) ? box : null;
}
