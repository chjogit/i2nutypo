import type { ColorFilter } from "@/types/project";
import type { Ctx2D } from "../motifs";

// Blue, yellow and black-and-white filters over the frame before the
// subtitles go on, so the subtitles keep their own colors.

export const COLOR_FILTERS: ReadonlyArray<{ kind: ColorFilter["kind"]; label: string }> = [
  { kind: "none", label: "없음" },
  { kind: "blue", label: "파랑" },
  { kind: "yellow", label: "노랑" },
  { kind: "mono", label: "흑백" },
];

const TINT: Record<"blue" | "yellow", string> = { blue: "#2f6bff", yellow: "#ffc23a" };

export function sanitizeColorFilter(saved: unknown): ColorFilter {
  const c = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const kind = COLOR_FILTERS.some((f) => f.kind === c.kind) ? (c.kind as ColorFilter["kind"]) : "none";
  const amount =
    typeof c.amount === "number" && Number.isFinite(c.amount) ? Math.min(1, Math.max(0, c.amount)) : 0.6;
  return { kind, amount };
}

type Scratch = OffscreenCanvas | HTMLCanvasElement;
let scratch: Scratch | null = null;

function scratchOf(w: number, h: number): Scratch | null {
  if (!scratch) {
    if (typeof OffscreenCanvas !== "undefined") scratch = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") scratch = document.createElement("canvas");
    else return null;
  }
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  return scratch;
}

/**
 * Tints what is on the canvas: blue or yellow color over it, or its color
 * taken out for black-and-white. Clear parts stay clear (the front layer).
 */
export function applyColorFilter(ctx: Ctx2D, filter: ColorFilter | undefined): void {
  if (!filter || filter.kind === "none" || filter.amount <= 0) return;
  const src = ctx.canvas;
  const s = scratchOf(src.width, src.height);
  const sc = s?.getContext("2d") as Ctx2D | null | undefined;
  if (!s || !sc) return;
  sc.save();
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "copy";
  sc.drawImage(src, 0, 0);
  sc.globalAlpha = filter.amount;
  if (filter.kind === "mono") {
    sc.globalCompositeOperation = "saturation";
    sc.fillStyle = "#808080";
  } else {
    sc.globalCompositeOperation = "color";
    sc.fillStyle = TINT[filter.kind];
  }
  sc.fillRect(0, 0, s.width, s.height);
  // Keep the original's see-through parts
  sc.globalAlpha = 1;
  sc.globalCompositeOperation = "destination-in";
  sc.drawImage(src, 0, 0);
  sc.restore();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(s, 0, 0);
  ctx.restore();
}
