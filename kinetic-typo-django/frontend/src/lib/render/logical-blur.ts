// The renderer lays a frame out in logical units (1280×720 for 16:9) and
// draws it at the preview's or the export's pixel size through a scale
// transform. Canvas shadows (shadowBlur, shadowOffsetX/Y) and filter lengths
// (blur(…px)) ignore that transform, so a glow drawn for 720p would come out a
// third as wide in a 4K export. These setters scale those lengths by the
// context's current transform, so every size of the same frame looks alike.
// With the usual identity transform nothing changes.

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** How many pixels one unit of the current transform covers. */
export function transformScale(ctx: Pick<AnyCtx, "getTransform">): number {
  const m = ctx.getTransform();
  const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  return Number.isFinite(s) && s > 0 ? s : 1;
}

const BLUR = /blur\(\s*(-?[\d.]+)px\s*\)/g;
const DROP = /drop-shadow\(([^)]*)\)/g;

/** `filter` with its blur and drop-shadow lengths multiplied by k. */
export function scaleFilterLengths(filter: string, k: number): string {
  if (k === 1 || filter === "none" || !filter.includes("px")) return filter;
  return filter
    .replace(BLUR, (_, n: string) => `blur(${(Number(n) * k).toFixed(2)}px)`)
    .replace(
      DROP,
      (_, args: string) =>
        `drop-shadow(${args.replace(/(-?[\d.]+)px/g, (_m, n: string) => `${(Number(n) * k).toFixed(2)}px`)})`,
    );
}

const logicalFilter = new WeakMap<object, { native: string; logical: string }>();

function patch(proto: object | undefined): void {
  if (!proto || (proto as { __logicalBlur?: boolean }).__logicalBlur) return;
  const scaled = (name: "shadowBlur" | "shadowOffsetX" | "shadowOffsetY") => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d?.get || !d.set) return;
    const { get, set } = d;
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: d.enumerable,
      get(this: AnyCtx) {
        return (get.call(this) as number) / transformScale(this);
      },
      set(this: AnyCtx, v: number) {
        set.call(this, v * transformScale(this));
      },
    });
  };
  scaled("shadowBlur");
  scaled("shadowOffsetX");
  scaled("shadowOffsetY");
  const f = Object.getOwnPropertyDescriptor(proto, "filter");
  if (f?.get && f.set) {
    const { get, set } = f;
    Object.defineProperty(proto, "filter", {
      configurable: true,
      enumerable: f.enumerable,
      get(this: AnyCtx) {
        const native = get.call(this) as string;
        const saved = logicalFilter.get(this);
        return saved && saved.native === native ? saved.logical : native;
      },
      set(this: AnyCtx, v: string) {
        const native = scaleFilterLengths(String(v), transformScale(this));
        set.call(this, native);
        logicalFilter.set(this, { native: get.call(this) as string, logical: String(v) });
      },
    });
  }
  Object.defineProperty(proto, "__logicalBlur", { value: true });
}

/** Installs the scaling setters once, on both kinds of 2D context. */
export function installLogicalBlur(): void {
  if (typeof CanvasRenderingContext2D !== "undefined") patch(CanvasRenderingContext2D.prototype);
  if (typeof OffscreenCanvasRenderingContext2D !== "undefined")
    patch(OffscreenCanvasRenderingContext2D.prototype);
}

installLogicalBlur();
