import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { LookPresetId } from "@/types/project";
import type { TextBounds } from "@/lib/render/text-bounds";
import {
  getLookElement,
  LOOK_ELEMENTS,
  MAX_ELEMENT_SIZE,
  MIN_ELEMENT_SIZE,
  type ThemedPresetId,
} from "@/lib/render/looks/presets";
import { useProjectStore } from "@/store/project-store";

/** Same reach as the theme tab's position sliders. */
const MAX_SHIFT = 0.6;
const clamp = (v: number) => Math.min(MAX_SHIFT, Math.max(-MAX_SHIFT, v));

const keyOf = (s: { preset: string; id: string }) => `${s.preset}:${s.id}`;

function labelOf(preset: string, id: string): string {
  return LOOK_ELEMENTS[preset as ThemedPresetId]?.find((d) => d.id === id)?.label ?? id;
}

const clampSize = (v: number) =>
  Math.round(Math.min(MAX_ELEMENT_SIZE, Math.max(MIN_ELEMENT_SIZE, v)) * 100) / 100;

type Drag = {
  key: string;
  preset: string;
  id: string;
  /** Moving the element, or sizing it with the ⤡ handle. */
  mode: "move" | "size";
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  fromSize: number;
};

/** The element's size changed by a factor, kept in range. */
function resize(key: string, factor: number): void {
  const [preset, id] = key.split(":");
  const st = getLookElement(useProjectStore.getState().style.lookElements, preset as LookPresetId, id);
  useProjectStore
    .getState()
    .setLookElement(id, { size: clampSize((st.size ?? 1) * factor) }, preset as LookPresetId);
}

/**
 * Handles on the preview for the theme's movable elements (record, cover,
 * ring, seal…): drag ⌖ to move that element and double-click it to put it
 * back; drag the ⤡ beside it (or turn the wheel over ⌖) to size it, and
 * double-click ⤡ for the theme's own size. They show while the pointer is
 * over the preview.
 */
export function ElementOverlay({
  canvasRef,
  boundsRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  boundsRef: RefObject<TextBounds>;
}) {
  const [keys, setKeys] = useState<string[]>([]);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Follow where each element was drawn this frame
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      const spots = boundsRef.current?.elements ?? [];
      if (!canvas) return;
      const seen = new Map<string, { x: number; y: number }>();
      for (const s of spots) if (!seen.has(keyOf(s))) seen.set(keyOf(s), s);
      // A dragged element keeps its handle even if it leaves the frame for a moment
      const list = [...seen.keys()];
      if (drag.current && !seen.has(drag.current.key)) list.push(drag.current.key);
      const joined = list.join("|");
      if (joined !== last) {
        last = joined;
        setKeys(list);
      }
      const sx = canvas.clientWidth / canvas.width;
      const sy = canvas.clientHeight / canvas.height;
      for (const [k, el] of handles.current) {
        const s = seen.get(k.replace(/#size$/, ""));
        if (!s) continue;
        const x = Math.min(canvas.clientWidth - 8, Math.max(8, s.x * sx));
        const y = Math.min(canvas.clientHeight - 8, Math.max(8, s.y * sy));
        // The size handle sits to the lower right of the move handle
        el.style.transform = k.endsWith("#size")
          ? `translate(${x + 7}px, ${y + 7}px)`
          : `translate(${x - 11}px, ${y - 11}px)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, boundsRef]);

  const down = (e: ReactPointerEvent<HTMLButtonElement>, key: string, mode: Drag["mode"]) => {
    if (e.button !== 0) return;
    const [preset, id] = key.split(":");
    const st = getLookElement(useProjectStore.getState().style.lookElements, preset as LookPresetId, id);
    drag.current = {
      key,
      preset,
      id,
      mode,
      x: e.clientX,
      y: e.clientY,
      fromX: st.x ?? 0,
      fromY: st.y ?? 0,
      fromSize: st.size ?? 1,
    };
    setDragging(key);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    if (d.mode === "size") {
      // Down and to the right grows, up and to the left shrinks; a fifth of the preview doubles it
      const along = (e.clientX - d.x + (e.clientY - d.y)) / Math.max(1, canvas.clientWidth * 0.2);
      useProjectStore
        .getState()
        .setLookElement(d.id, { size: clampSize(d.fromSize * 2 ** along) }, d.preset as LookPresetId);
      return;
    }
    useProjectStore.getState().setLookElement(
      d.id,
      {
        x: Math.round(clamp(d.fromX + (e.clientX - d.x) / canvas.clientWidth) * 1000) / 1000,
        y: Math.round(clamp(d.fromY + (e.clientY - d.y) / canvas.clientHeight) * 1000) / 1000,
      },
      d.preset as LookPresetId,
    );
  };
  const up = () => {
    drag.current = null;
    setDragging(null);
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {keys.map((k) => {
        const [preset, id] = k.split(":");
        const label = labelOf(preset, id);
        const shown = (on: boolean) =>
          on
            ? "border-white bg-indigo-500 text-white opacity-100"
            : "border-white/80 bg-indigo-600/80 text-white opacity-0 group-hover/preview:opacity-100 focus:opacity-100";
        const sizeKey = `${k}#size`;
        return (
          <span key={k}>
            <button
              ref={(el) => {
                if (el) handles.current.set(k, el);
                else handles.current.delete(k);
              }}
              type="button"
              aria-label={`${label} 위치 옮기기`}
              title={`${label}: 끌어서 옮기기 · 휠로 크기 · 두 번 클릭하면 원래 자리`}
              onPointerDown={(e) => down(e, k, "move")}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onWheel={(e) => resize(k, e.deltaY < 0 ? 1.06 : 1 / 1.06)}
              onDoubleClick={() =>
                useProjectStore.getState().setLookElement(id, { x: 0, y: 0 }, preset as LookPresetId)
              }
              className={`pointer-events-auto absolute left-0 top-0 flex h-[22px] w-[22px] cursor-move touch-none items-center justify-center rounded-full border text-[11px] shadow-md shadow-black/50 transition-opacity ${shown(dragging === k)}`}
            >
              ⌖
            </button>
            <button
              ref={(el) => {
                if (el) handles.current.set(sizeKey, el);
                else handles.current.delete(sizeKey);
              }}
              type="button"
              aria-label={`${label} 크기 바꾸기`}
              title={`${label}: 끌어서 크기 바꾸기 · 두 번 클릭하면 원래 크기`}
              onPointerDown={(e) => down(e, k, "size")}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onDoubleClick={() =>
                useProjectStore.getState().setLookElement(id, { size: 1 }, preset as LookPresetId)
              }
              className={`pointer-events-auto absolute left-0 top-0 flex h-[16px] w-[16px] cursor-nwse-resize touch-none items-center justify-center rounded-sm border text-[10px] shadow-md shadow-black/50 transition-opacity ${shown(dragging === k)}`}
            >
              ⤡
            </button>
          </span>
        );
      })}
    </div>
  );
}
