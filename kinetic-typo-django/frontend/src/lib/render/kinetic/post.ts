import type { StyleSettings } from "@/types/project";
import type { Ctx2D } from "../motifs";
import { hash01 } from "../looks/noise";
import { transformScale } from "../logical-blur";
import { css, derivePalette, shift, type Rgb } from "./color";
import { motionStyleOf } from "./styles";

// The cinematic base under the motion styles: a faint film grain (about 4%)
// that changes 24 times a second and a vignette in the user's own background
// color taken deep, so a bright pick never floats flat. Skipped when the
// finish tab already adds grain or a vignette, so the two never stack.
//
// Both are laid out in logical units (one grain speck covers the same share
// of the frame at 720p and at 4K) but kept as canvases at the output's pixel
// size, so each frame only copies pixels instead of resampling or filling a
// gradient over the whole picture.

type Scratch = HTMLCanvasElement | OffscreenCanvas;
type ScratchCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Logical size of one grain tile, and how many different tiles take turns. */
const TILE = 128;
const TILES = 6;
const GRAIN_ALPHA = 0.045;

function makeCanvas(w: number, h: number): Scratch | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

/** Grain tiles at `k` device px per logical px, from hashed values (same specks at every size). */
let grain: { k: number; tiles: Scratch[] } | null = null;
function grainTiles(k: number): Scratch[] {
  const kk = Math.round(k * 100) / 100;
  if (grain && grain.k === kk) return grain.tiles;
  const size = Math.max(1, Math.round(TILE * kk));
  const tiles: Scratch[] = [];
  for (let t = 0; t < TILES; t++) {
    const c = makeCanvas(size, size);
    const g = c?.getContext("2d") as ScratchCtx | null;
    if (!c || !g) break;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        // Nearest logical speck: light specks as see-through white, dark ones as black (plain blending)
        const i = Math.floor(y / kk) * TILE + Math.floor(x / kk);
        const v = hash01(i, t * 7919 + 13) * 2 - 1;
        const o = (y * size + x) * 4;
        const on = v > 0 ? 255 : 0;
        img.data[o] = on;
        img.data[o + 1] = on;
        img.data[o + 2] = on;
        img.data[o + 3] = Math.round(Math.abs(v) * 255);
      }
    g.putImageData(img, 0, 0);
    tiles.push(c);
  }
  grain = { k: kk, tiles };
  return tiles;
}

/** The vignette at the output's pixel size, made again only when the size or color changes. */
let vignette: { key: string; canvas: Scratch } | null = null;
function vignetteCanvas(w: number, h: number, deep: Rgb, alpha: number): Scratch | null {
  const key = `${w}x${h}|${css(deep, alpha)}`;
  if (vignette?.key === key) return vignette.canvas;
  const c = makeCanvas(w, h);
  const g = c?.getContext("2d") as ScratchCtx | null;
  if (!c || !g) return null;
  const grad = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) * 0.58,
  );
  grad.addColorStop(0, css(deep, 0));
  grad.addColorStop(1, css(deep, alpha));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  vignette = { key, canvas: c };
  return c;
}

/** True when the cinematic base is drawn for this style. */
export function wantsCinematicBase(style: Pick<StyleSettings, "motionStyle" | "cinematicBase" | "finish">): {
  grain: boolean;
  vignette: boolean;
} {
  if (!motionStyleOf(style) || style.cinematicBase === false) return { grain: false, vignette: false };
  const f = style.finish?.filters ?? {};
  return { grain: !f.grain?.on, vignette: !f.vignette?.on };
}

/** Draws the grain and vignette over everything drawn so far. */
export function drawCinematicBase(
  ctx: Ctx2D,
  style: Pick<
    StyleSettings,
    "motionStyle" | "cinematicBase" | "finish" | "bgColor" | "textColor" | "accentColor" | "secondaryColor"
  >,
  timeSec: number,
): void {
  const want = wantsCinematicBase(style);
  if (!want.grain && !want.vignette) return;
  const device = (ctx as CanvasRenderingContext2D).canvas as { width?: number; height?: number } | undefined;
  // Where there is no real canvas (tests) there is nothing to copy pixels onto
  if (!device?.width || !device.height || typeof ctx.getTransform !== "function") return;
  const p = derivePalette(style);
  const k = transformScale(ctx);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  if (want.vignette) {
    const deep = shift(p.bg, { l: -0.5, s: 0.1 });
    const v = vignetteCanvas(device.width, device.height, deep, p.lightBg ? 0.18 : 0.42);
    if (v) ctx.drawImage(v as CanvasImageSource, 0, 0);
  }
  if (want.grain) {
    const tiles = grainTiles(k);
    const frame = Math.floor(timeSec * 24);
    const tile = tiles[frame % Math.max(1, tiles.length)];
    const pattern = tile ? ctx.createPattern(tile as CanvasImageSource, "repeat") : null;
    if (pattern) {
      // A new offset every frame so the grain never sits still in one place
      const size = (tile as { width: number }).width;
      const ox = Math.floor(hash01(frame, 3) * size);
      const oy = Math.floor(hash01(frame, 4) * size);
      ctx.globalAlpha = GRAIN_ALPHA;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, device.width + size, device.height + size);
    }
  }
  ctx.restore();
}
