import type { LyricLine } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { effectiveStyle } from "../style-mode";
import { recordTextBounds, type Box } from "../text-bounds";
import type { LookFrame, LookRenderer } from "./frame";
import { withAlpha } from "./noise";

// Overlapping ("&") lines are drawn by the lyric theme like any line, on a
// scratch canvas, then copied smaller next to the main line with a tint of
// the accent color, so a chorus or second voice reads as a second layer.

/** Size of an overlapping line next to the main one. */
const OVERLAP_SCALE = 0.6;
/** Widest an overlapping line may be, as a share of the frame. */
const MAX_WIDTH_SHARE = 0.9;
const TINT_ALPHA = 0.35;
const LAYER_ALPHA = 0.92;

let scratch: OffscreenCanvas | null = null;

function scratchContext(w: number, h: number): OffscreenCanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  if (!scratch || scratch.width !== w || scratch.height !== h) scratch = new OffscreenCanvas(w, h);
  return scratch.getContext("2d");
}

/** The frame for drawing one overlapping line on its own. */
function overlapFrame(f: LookFrame, line: LyricLine, ctx: Ctx2D): LookFrame {
  const elapsed = f.timeSec - line.startTime;
  const dur = Math.max(0.01, line.endTime - line.startTime);
  return {
    ...f,
    ctx,
    line,
    nextLine: null,
    overlaps: [],
    lineElapsed: elapsed,
    lineProgress: Math.min(1, Math.max(0, elapsed / dur)),
    style: effectiveStyle(f.style, line),
    textBounds: undefined,
  };
}

/**
 * Draws f.overlaps beside the main line's text (mainBox, in canvas pixels):
 * under it, or above it when there is no room below. Each line's own position
 * offset moves it from there. Without OffscreenCanvas nothing is drawn; the
 * subtitles still show the line.
 */
export function drawOverlapLines(r: LookRenderer, f: LookFrame, mainBox: Box | null): void {
  const overlaps = f.overlaps ?? [];
  if (overlaps.length === 0) return;
  const { ctx } = f;
  const base = ctx.getTransform();
  const sx = Math.hypot(base.a, base.b) || 1;
  const sy = Math.hypot(base.c, base.d) || 1;
  const cw = Math.round(f.W * sx);
  const ch = Math.round(f.H * sy);
  const sctx = scratchContext(cw, ch);
  if (!sctx) return;

  const gap = Math.min(cw, ch) * 0.025;
  const bottomLimit = ch * (f.subtitleVisible ? 0.8 : 0.95);
  const topLimit = ch * (f.subtitleTop ? 0.2 : 0.04);
  // Lines stack away from the main text, each one past the last
  let below = mainBox ? mainBox.y1 + gap : ch * 0.5;
  let above = mainBox ? mainBox.y0 - gap : ch * 0.5;
  const centerX = mainBox ? (mainBox.x0 + mainBox.x1) / 2 : cw / 2;

  for (const line of overlaps) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, cw, ch);
    sctx.setTransform(sx, 0, 0, sy, 0, 0);
    const of = overlapFrame(f, line, sctx);
    const box = recordTextBounds(sctx, () => r.lyrics(of));
    if (!box) continue;

    const pad = Math.min(cw, ch) * 0.03;
    const x0 = Math.max(0, Math.floor(box.x0 - pad));
    const y0 = Math.max(0, Math.floor(box.y0 - pad));
    const x1 = Math.min(cw, Math.ceil(box.x1 + pad));
    const y1 = Math.min(ch, Math.ceil(box.y1 + pad));
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) continue;

    // Tint only what the theme drew
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = "source-atop";
    sctx.fillStyle = withAlpha(f.style.accentColor, TINT_ALPHA);
    sctx.fillRect(x0, y0, bw, bh);
    sctx.globalCompositeOperation = "source-over";

    const scale = Math.min(OVERLAP_SCALE, (cw * MAX_WIDTH_SHARE) / bw);
    const dw = bw * scale;
    const dh = bh * scale;
    let dy: number;
    if (below + dh <= bottomLimit || above - dh < topLimit) {
      dy = Math.min(below, bottomLimit - dh);
      below = dy + dh + gap;
    } else {
      dy = above - dh;
      above = dy - gap;
    }
    const margin = cw * 0.03;
    const dx = Math.min(cw - margin - dw, Math.max(margin, centerX - dw / 2)) + line.offsetX * cw;
    dy += line.offsetY * ch;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = LAYER_ALPHA;
    ctx.drawImage(sctx.canvas, x0, y0, bw, bh, dx, dy, dw, dh);
    ctx.restore();
  }
}
