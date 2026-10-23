import type { IllustrationSettings } from "@/types/project";
import type { LoadedImage, Rect } from "./illustration";

/** The frame is split into GRID x GRID cells for placing lyrics around the illustration. */
export const GRID = 4;
export const CELLS = GRID * GRID;

/** Cells are numbered 0..CELLS-1 left to right, top to bottom. */
export function cellRect(W: number, H: number, cell: number): Rect {
  return {
    x: ((cell % GRID) * W) / GRID,
    y: (Math.floor(cell / GRID) * H) / GRID,
    w: W / GRID,
    h: H / GRID,
  };
}
/** Where the character sits on screen, or null when it is not drawn. */
export function characterRect(
  ill: IllustrationSettings,
  img: Pick<LoadedImage, "width" | "height"> | null,
  W: number,
  H: number,
): Rect | null {
  if (!img || !ill.showCharacter || img.height <= 0) return null;
  const h = H * ill.characterScale;
  const w = (img.width / img.height) * h;
  return { x: ill.charX * W - w / 2, y: ill.charY * H - h, w, h };
}

/** Share of a cell's area a cell must be covered by the character to count as taken. */
const BLOCK_SHARE = 0.18;

/** Which cells the character covers. */
export function blockedCells(rect: Rect | null, W: number, H: number): boolean[] {
  return Array.from({ length: CELLS }, (_, c) => {
    if (!rect) return false;
    const r = cellRect(W, H, c);
    const ox = Math.max(0, Math.min(r.x + r.w, rect.x + rect.w) - Math.max(r.x, rect.x));
    const oy = Math.max(0, Math.min(r.y + r.h, rect.y + rect.h) - Math.max(r.y, rect.y));
    return (ox * oy) / (r.w * r.h) > BLOCK_SHARE;
  });
}

/**
 * One boolean per cell from saved data. Cells saved on the older 3x3 grid are
 * carried over: each new cell takes the old cell its center falls in.
 * Anything else becomes all free.
 */
export function sanitizeCells(saved: unknown): boolean[] {
  if (!Array.isArray(saved)) return Array<boolean>(CELLS).fill(false);
  if (saved.length === CELLS) return saved.map((b) => b === true);
  if (saved.length === 9) {
    const old = (i: number) => Math.floor(((i + 0.5) * 3) / GRID);
    return Array.from(
      { length: CELLS },
      (_, c) => saved[old(Math.floor(c / GRID)) * 3 + old(c % GRID)] === true,
    );
  }
  return Array<boolean>(CELLS).fill(false);
}

/** First free cell in order of preference; falls back to the first preference when all are taken. */
export function pickCell(blocked: readonly boolean[], preferred: readonly number[]): number {
  for (const c of preferred) if (!blocked[c]) return c;
  for (let c = 0; c < CELLS; c++) if (!blocked[c]) return c;
  return preferred[0];
}

/** The cell widened over free neighbors in its row, so text can use the open space. */
export function freeRowSpan(blocked: readonly boolean[], cell: number, W: number, H: number): Rect {
  const row = Math.floor(cell / GRID);
  let lo = cell % GRID;
  let hi = lo;
  while (lo > 0 && !blocked[row * GRID + lo - 1]) lo--;
  while (hi < GRID - 1 && !blocked[row * GRID + hi + 1]) hi++;
  const r = cellRect(W, H, row * GRID + lo);
  return { x: r.x, y: r.y, w: ((hi - lo + 1) * W) / GRID, h: r.h };
}

/**
 * A free row span grown by one row toward the middle of the frame when that
 * row is free across the same columns, so a lyric block keeps enough height.
 */
export function freeSpan(blocked: readonly boolean[], cell: number, W: number, H: number): Rect {
  const r = freeRowSpan(blocked, cell, W, H);
  const row = Math.floor(cell / GRID);
  const next = row < GRID / 2 ? row + 1 : row - 1;
  const lo = Math.round((r.x / W) * GRID);
  const hi = Math.round(((r.x + r.w) / W) * GRID) - 1;
  for (let col = lo; col <= hi; col++) if (blocked[next * GRID + col]) return r;
  return { ...r, y: Math.min(r.y, (next * H) / GRID), h: r.h * 2 };
}

/** Column 0..GRID-1 with the fewest taken cells, ties broken by preference order. */
export function pickColumn(blocked: readonly boolean[], preferred: readonly number[]): number {
  let best = preferred[0];
  let bestCount = Infinity;
  for (const col of preferred) {
    const n = Array.from({ length: GRID }, (_, r) => r).filter((r) => blocked[r * GRID + col]).length;
    if (n < bestCount) {
      best = col;
      bestCount = n;
    }
  }
  return best;
}
