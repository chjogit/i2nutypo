import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { LookPresetId } from "@/types/project";
import type { TextBounds } from "@/lib/render/text-bounds";
import { getLookElement, LOOK_ELEMENTS, type ThemedPresetId } from "@/lib/render/looks/presets";
import { useProjectStore } from "@/store/project-store";

/** Same reach as the theme tab's position sliders. */
const MAX_SHIFT = 0.6;
const clamp = (v: number) => Math.min(MAX_SHIFT, Math.max(-MAX_SHIFT, v));

const keyOf = (s: { preset: string; id: string }) => `${s.preset}:${s.id}`;

function labelOf(preset: string, id: string): string {
  return LOOK_ELEMENTS[preset as ThemedPresetId]?.find((d) => d.id === id)?.label ?? id;
}

type Drag = { key: string; preset: string; id: string; x: number; y: number; fromX: number; fromY: number };

/**
 * Handles on the preview for the theme's movable elements (record, cover,
 * ring, seal…): drag one to move that element, double-click to put it back.
 * They show while the pointer is over the preview.
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
        const s = seen.get(k);
        if (!s) continue;
        const x = Math.min(canvas.clientWidth - 8, Math.max(8, s.x * sx));
        const y = Math.min(canvas.clientHeight - 8, Math.max(8, s.y * sy));
        el.style.transform = `translate(${x - 11}px, ${y - 11}px)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, boundsRef]);

  const down = (e: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    if (e.button !== 0) return;
    const [preset, id] = key.split(":");
    const st = getLookElement(useProjectStore.getState().style.lookElements, preset as LookPresetId, id);
    drag.current = { key, preset, id, x: e.clientX, y: e.clientY, fromX: st.x ?? 0, fromY: st.y ?? 0 };
    setDragging(key);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
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
        return (
          <button
            key={k}
            ref={(el) => {
              if (el) handles.current.set(k, el);
              else handles.current.delete(k);
            }}
            type="button"
            aria-label={`${label} 위치 옮기기`}
            title={`${label}: 끌어서 옮기기 · 두 번 클릭하면 원래 자리`}
            onPointerDown={(e) => down(e, k)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onDoubleClick={() =>
              useProjectStore.getState().setLookElement(id, { x: 0, y: 0 }, preset as LookPresetId)
            }
            className={`pointer-events-auto absolute left-0 top-0 flex h-[22px] w-[22px] cursor-move touch-none items-center justify-center rounded-full border text-[11px] shadow-md shadow-black/50 transition-opacity ${
              dragging === k
                ? "border-white bg-indigo-500 text-white opacity-100"
                : "border-white/80 bg-indigo-600/80 text-white opacity-0 group-hover/preview:opacity-100 focus:opacity-100"
            }`}
          >
            ⌖
          </button>
        );
      })}
    </div>
  );
}
