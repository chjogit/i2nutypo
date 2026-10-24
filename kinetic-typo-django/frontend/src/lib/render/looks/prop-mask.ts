import type { PropMask } from "@/types/project";
import type { LoadedImage } from "./illustration";

// Masking an illustration: a rectangle or ellipse in the picture's own box is
// cut away (inside or outside it), with a soft edge, and the cut part can be
// filled with a color instead of left see-through. The result is drawn where
// the picture would have been, so the clip's motion and effects still apply.

export const DEFAULT_PROP_MASK: PropMask = {
  on: true,
  shape: "ellipse",
  x: 0.5,
  y: 0.5,
  w: 0.6,
  h: 0.6,
  feather: 0.15,
  target: "outside",
  color: "#000000",
  colorAlpha: 0,
  fill: "picture",
};

/** Largest side the masked picture is worked at; enough for a full-frame illustration. */
const MAX_SIDE = 1600;

type Scratch = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
const pool: Scratch[] = [];

function scratch(i: number, w: number, h: number): Ctx | null {
  let s = pool[i];
  if (!s) {
    if (typeof OffscreenCanvas !== "undefined") s = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") s = document.createElement("canvas");
    else return null;
    pool[i] = s;
  }
  if (s.width !== w) s.width = w;
  if (s.height !== h) s.height = h;
  const c = s.getContext("2d") as Ctx | null;
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.filter = "none";
  c.clearRect(0, 0, w, h);
  return c;
}

/** The pixel size the masked picture is worked at. */
export function maskSize(img: Pick<LoadedImage, "width" | "height">): { w: number; h: number } {
  const k = Math.min(1, MAX_SIDE / Math.max(1, img.width, img.height));
  return { w: Math.max(1, Math.round(img.width * k)), h: Math.max(1, Math.round(img.height * k)) };
}

/** Paints the masked part (white, soft edged) on c at the picture size w×h. */
function paintMaskArea(c: Ctx, m: PropMask, w: number, h: number): void {
  const aw = m.w * w;
  const ah = m.h * h;
  const blur = m.feather * Math.min(aw, ah) * 0.5;
  c.fillStyle = "#fff";
  if (m.target === "outside") {
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "destination-out";
  }
  if (blur > 0.5) c.filter = `blur(${blur.toFixed(1)}px)`;
  c.beginPath();
  if (m.shape === "ellipse") c.ellipse(m.x * w, m.y * h, aw / 2, ah / 2, 0, 0, Math.PI * 2);
  else c.rect(m.x * w - aw / 2, m.y * h - ah / 2, aw, ah);
  c.fill();
  c.filter = "none";
  c.globalCompositeOperation = "source-over";
}

/**
 * The picture with its mask applied, at maskSize, or the picture itself when
 * the mask is off or no canvas is available.
 */
export function maskedPicture(img: LoadedImage, m: PropMask | undefined): LoadedImage {
  if (!m || !m.on || img.width <= 0 || img.height <= 0) return img;
  const { w, h } = maskSize(img);
  const area = scratch(0, w, h);
  const out = scratch(1, w, h);
  if (!area || !out) return img;
  paintMaskArea(area, m, w, h);
  // The picture with the masked part cut away
  out.drawImage(img.source, 0, 0, w, h);
  out.globalCompositeOperation = "destination-out";
  out.drawImage(area.canvas, 0, 0);
  out.globalCompositeOperation = "source-over";
  if (m.colorAlpha > 0) {
    const paint = scratch(2, w, h);
    if (paint) {
      if (m.fill === "picture") {
        // The picture's own shape in the color, so a cut-out character keeps its outline
        paint.drawImage(img.source, 0, 0, w, h);
        paint.globalCompositeOperation = "source-in";
      }
      paint.fillStyle = m.color;
      paint.fillRect(0, 0, w, h);
      paint.globalCompositeOperation = "destination-in";
      paint.drawImage(area.canvas, 0, 0);
      out.globalAlpha = m.colorAlpha;
      out.drawImage(paint.canvas, 0, 0);
      out.globalAlpha = 1;
    }
  }
  return { source: out.canvas, width: w, height: h };
}
