import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { logicalSize } from "@/lib/render/canvas-size";
import { usePropUiStore } from "@/store/prop-ui-store";

/** The picked illustration in frame shares: center, size and turn. */
interface Placement {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  /** Shown at this moment (a clip outside the playhead is drawn dashed). */
  live: boolean;
}

type Gesture =
  | { kind: "move"; x: number; y: number; from: Placement }
  | { kind: "size"; cx: number; cy: number; dist: number; from: Placement }
  | { kind: "rot"; cx: number; cy: number; from: Placement };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Where the picked illustration clip sits, or null when nothing is picked. */
function placement(W: number, H: number): Placement | null {
  const project = useProjectStore.getState();
  const ui = usePropUiStore.getState();
  const t = usePlaybackStore.getState().currentTime;
  if (ui.selected) {
    const prop = project.props.find((p) => p.id === ui.selected?.propId && p.onTimeline);
    const clip = prop?.clips.find((c) => c.id === ui.selected?.clipId);
    if (!prop || !clip || prop.height <= 0) return null;
    const h = clip.scale;
    const w = ((prop.width / prop.height) * h * H) / W;
    return {
      cx: clip.x,
      cy: clip.y,
      w,
      h,
      rot: clip.rot,
      live: t >= clip.start && t < clip.end,
    };
  }
  return null;
}

/**
 * Box over the preview for the illustration picked in the 일러스트 section or
 * timeline: drag it to move, its corner to resize, and its top knob to turn. Follows the store from a RAF loop, like the lyric text box.
 */
export function IllustrationOverlay({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const placeRef = useRef<Placement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = boxRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas) return;
      const p = placement(logicalSize(canvas).width, logicalSize(canvas).height);
      placeRef.current = p;
      if (!p) {
        el.style.display = "none";
        return;
      }
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const w = Math.max(14, p.w * cw);
      const h = Math.max(14, p.h * ch);
      el.style.display = "block";
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${p.cx * cw - w / 2}px, ${p.cy * ch - h / 2}px) rotate(${p.rot}deg)`;
      el.style.borderStyle = p.live ? "solid" : "dashed";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);

  const center = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 };
  };

  const begin = (e: ReactPointerEvent<HTMLElement>, kind: Gesture["kind"]) => {
    const from = placeRef.current;
    if (e.button !== 0 || !from) return;
    e.stopPropagation();
    const { cx, cy } = center();
    gestureRef.current =
      kind === "move"
        ? { kind, x: e.clientX, y: e.clientY, from }
        : kind === "size"
          ? { kind, cx, cy, dist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)), from }
          : { kind, cx, cy, from };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const badge = (text: string | null) => {
    const b = badgeRef.current;
    if (!b) return;
    b.textContent = text ?? "";
    b.style.display = text ? "block" : "none";
  };

  /** Writes a new center, height share or turn to whatever the box edits. */
  const apply = (from: Placement, patch: { cx?: number; cy?: number; h?: number; rot?: number }) => {
    const project = useProjectStore.getState();
    const ui = usePropUiStore.getState();
    if (!ui.selected) return;
    project.updatePropClip(ui.selected.propId, ui.selected.clipId, {
      ...(patch.cx !== undefined && { x: round3(clamp(patch.cx, -0.2, 1.2)) }),
      ...(patch.cy !== undefined && { y: round3(clamp(patch.cy, -0.2, 1.2)) }),
      ...(patch.h !== undefined && { scale: round3(clamp(patch.h, 0.03, 1.5)) }),
      ...(patch.rot !== undefined && { rot: Math.round(patch.rot) }),
    });
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    if (g.kind === "move") {
      apply(g.from, {
        cx: g.from.cx + (e.clientX - g.x) / canvas.clientWidth,
        cy: g.from.cy + (e.clientY - g.y) / canvas.clientHeight,
      });
    } else if (g.kind === "size") {
      const k = Math.hypot(e.clientX - g.cx, e.clientY - g.cy) / g.dist;
      const h = g.from.h * k;
      apply(g.from, { h });
      badge(`크기 ${Math.round(h * 100)}%`);
    } else {
      const deg = (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI + 90;
      const rot = ((((e.shiftKey ? Math.round(deg / 15) * 15 : deg) + 540) % 360) - 180) as number;
      apply(g.from, { rot });
      badge(`회전 ${Math.round(rot)}°`);
    }
  };

  const onUp = () => {
    gestureRef.current = null;
    badge(null);
  };

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label="선택한 일러스트: 끌어서 옮기기, 모서리로 크기 조절"
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      title="끌기: 옮기기 · 모서리: 크기 · 위쪽 점: 회전(Shift로 15°씩)"
      className="group absolute left-0 top-0 z-20 hidden origin-center cursor-move touch-none border-2 border-emerald-400/90"
    >
      {(
        [
          "-left-1.5 -top-1.5 cursor-nwse-resize",
          "-right-1.5 -top-1.5 cursor-nesw-resize",
          "-left-1.5 -bottom-1.5 cursor-nesw-resize",
          "-right-1.5 -bottom-1.5 cursor-nwse-resize",
        ] as const
      ).map((pos) => (
        <span
          key={pos}
          aria-hidden
          onPointerDown={(e) => begin(e, "size")}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={`absolute h-3 w-3 rounded-sm border border-zinc-950 bg-white ${pos}`}
        />
      ))}
      <span
        aria-hidden
        onPointerDown={(e) => begin(e, "rot")}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="absolute -top-6 left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-zinc-950 bg-emerald-300"
      />
      <span
        ref={badgeRef}
        className="pointer-events-none absolute -top-7 left-0 hidden whitespace-nowrap rounded bg-zinc-900/90 px-1.5 py-0.5 text-[10px] text-zinc-100"
      />
    </div>
  );
}
