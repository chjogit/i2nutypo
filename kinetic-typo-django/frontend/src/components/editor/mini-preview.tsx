import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { usePlaybackStore } from "@/store/playback-store";
import {
  clampTo,
  keyResize,
  MINI_PRESET_LABELS,
  MINI_PRESETS,
  MINI_WIDTH_BIG_STEP,
  MINI_WIDTH_RANGE,
  MINI_WIDTH_STEP,
  nearestMiniPreset,
  nextMiniPreset,
  readMiniWidth,
} from "@/lib/ui/preview-size";
const EDGE = 12;
const SETTINGS_KEY = "kinetic-typo-mini-preview";
const AUTO_KEY = "kinetic-typo-mini-preview-auto";

interface MiniSettings {
  /** Width in CSS px (older saves kept a step index here). */
  size: number;
  /** Top-left corner, or null for the top-right default. */
  pos: { x: number; y: number } | null;
}

const DEFAULTS: MiniSettings = { size: MINI_PRESETS[0], pos: null };

function loadSettings(): MiniSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<MiniSettings>;
    return {
      size: readMiniWidth(v.size),
      pos: v.pos && Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y) ? { x: v.pos.x, y: v.pos.y } : null,
    };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: MiniSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the settings last for this page only
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A small floating copy of the preview, shown while the real preview is
 * scrolled out of view so changes made further down stay visible. It copies
 * the preview canvas each frame from a RAF loop (no re-render while playing),
 * can be dragged by its title bar, resized from its corner (or in three steps
 * with the size button) and closed.
 */
export function MiniPreview({
  sourceRef,
  frameRef,
  enabled,
}: {
  sourceRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLElement | null>;
  /** Off: never shown. */
  enabled: boolean;
}) {
  const [settings, setSettings] = useState<MiniSettings>(DEFAULTS);
  const [offscreen, setOffscreen] = useState(false);
  /** Closed with X: stays hidden until the preview has been on screen again. */
  const [dismissed, setDismissed] = useState(false);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const gripRef = useRef<{
    x: number;
    w: number;
    left: number;
    right: number;
    top: number;
    next: number;
  } | null>(null);

  // Read after mount so the server HTML matches the first paint
  useEffect(() => setSettings(loadSettings()), []);

  const update = (patch: Partial<MiniSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  };

  // Watch whether the preview is on screen
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const away = !entry.isIntersecting;
        setOffscreen(away);
        if (!away) setDismissed(false);
      },
      // Counts as away once less than a fifth of it shows
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [frameRef]);

  const visible = enabled && offscreen && !dismissed;
  const width = settings.size;

  // Copy the preview canvas while shown
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const src = sourceRef.current;
      if (!src || src.width === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width * dpr);
      const h = Math.round((w * src.height) / src.width);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(src, 0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, width, sourceRef]);

  // Keep the window inside the viewport when it or the window changes size
  useEffect(() => {
    if (!visible) return;
    const fit = () => {
      const el = boxRef.current;
      if (!el || !settings.pos) return;
      const r = el.getBoundingClientRect();
      const x = clamp(settings.pos.x, EDGE, Math.max(EDGE, window.innerWidth - r.width - EDGE));
      const y = clamp(settings.pos.y, EDGE, Math.max(EDGE, window.innerHeight - r.height - EDGE));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [visible, settings.pos, width]);

  if (!visible) return null;

  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = boxRef.current;
    if (e.button !== 0 || !el || (e.target as HTMLElement).closest("button")) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = boxRef.current;
    if (!d || !el) return;
    const x = clamp(d.left + e.clientX - d.x, EDGE, window.innerWidth - el.offsetWidth - EDGE);
    const y = clamp(d.top + e.clientY - d.y, EDGE, window.innerHeight - el.offsetHeight - EDGE);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = "auto";
  };
  const onBarUp = () => {
    const el = boxRef.current;
    if (!dragRef.current || !el) return;
    dragRef.current = null;
    const r = el.getBoundingClientRect();
    update({ pos: { x: Math.round(r.left), y: Math.round(r.top) } });
  };

  // Corner grip, on the side facing the middle of the screen: the opposite edge stays put
  // and the window grows toward the pointer
  const gripSide: "left" | "right" =
    settings.pos && settings.pos.x + width / 2 < window.innerWidth / 2 ? "right" : "left";
  const onGripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = boxRef.current;
    if (e.button !== 0 || !el) return;
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.right = "auto";
    gripRef.current = { x: e.clientX, w: r.width, left: r.left, right: r.right, top: r.top, next: r.width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gripRef.current;
    const el = boxRef.current;
    if (!g || !el) return;
    const dx = e.clientX - g.x;
    const wanted = gripSide === "right" ? g.w + dx : g.w - dx;
    const room = gripSide === "right" ? window.innerWidth - g.left - EDGE : g.right - EDGE;
    g.next = clampTo(Math.min(wanted, room), MINI_WIDTH_RANGE);
    // Only the box's CSS size moves while dragging; the copy loop picks the new size up after
    el.style.width = `${g.next}px`;
    if (gripSide === "left") el.style.left = `${g.right - g.next}px`;
  };
  const onGripUp = () => {
    const g = gripRef.current;
    if (!g) return;
    gripRef.current = null;
    const left = gripSide === "left" ? g.right - g.next : g.left;
    update({ size: g.next, pos: { x: Math.round(left), y: Math.round(g.top) } });
  };
  const onGripKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = keyResize(
      e.key,
      e.shiftKey,
      width,
      MINI_WIDTH_RANGE,
      { step: MINI_WIDTH_STEP, big: MINI_WIDTH_BIG_STEP },
      [gripSide === "right" ? "ArrowRight" : "ArrowLeft", "ArrowDown"],
      [gripSide === "right" ? "ArrowLeft" : "ArrowRight", "ArrowUp"],
    );
    if (next === null) return;
    e.preventDefault();
    // A window on the left keeps its left edge; one on the right keeps its right edge
    const el = boxRef.current;
    if (gripSide === "left" && settings.pos && el) {
      const r = el.getBoundingClientRect();
      update({ size: next, pos: { x: Math.max(EDGE, Math.round(r.right - next)), y: settings.pos.y } });
    } else update({ size: next });
  };

  const jumpToPreview = () => frameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  const btn = "rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100";

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="작은 미리보기"
      className="fixed z-30 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950/95 shadow-2xl shadow-black/60"
      style={
        settings.pos
          ? { left: settings.pos.x, top: settings.pos.y, width }
          : { right: EDGE, top: EDGE + 56, width }
      }
    >
      <div
        onPointerDown={onBarDown}
        onPointerMove={onBarMove}
        onPointerUp={onBarUp}
        onPointerCancel={onBarUp}
        title="끌어서 옮기기"
        className="flex cursor-move touch-none select-none items-center gap-1 border-b border-zinc-800 px-2 py-1 text-xs"
      >
        <span className="mr-auto font-medium text-zinc-300">미리보기</span>
        <button
          type="button"
          onClick={() =>
            isPlaying ? usePlaybackStore.getState().pause() : void usePlaybackStore.getState().play()
          }
          aria-label={isPlaying ? "일시정지" : "재생"}
          className={btn}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => update({ size: nextMiniPreset(width) })}
          title="창 크기 바꾸기 (아래 모서리를 끌어도 됩니다)"
          className={btn}
        >
          {MINI_PRESET_LABELS[nearestMiniPreset(width)]}
        </button>
        <button type="button" onClick={jumpToPreview} title="원래 미리보기로 이동" className={btn}>
          ↑
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="작은 미리보기 닫기"
          className={btn}
        >
          ✕
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onDoubleClick={jumpToPreview}
        title="두 번 클릭: 원래 미리보기로 이동"
        className="block h-auto w-full"
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="작은 미리보기 크기 조절"
        aria-valuenow={width}
        aria-valuemin={MINI_WIDTH_RANGE[0]}
        aria-valuemax={MINI_WIDTH_RANGE[1]}
        aria-valuetext={`폭 ${width}픽셀`}
        tabIndex={0}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        onKeyDown={onGripKey}
        onDoubleClick={() => update({ size: MINI_PRESETS[0] })}
        title="끌어서 창 크기 조절 (두 번 클릭하면 작게)"
        className={`group absolute bottom-0 flex h-5 w-5 touch-none items-end p-1 focus:outline-none ${gripSide === "right" ? "right-0 cursor-nwse-resize justify-end" : "left-0 cursor-nesw-resize justify-start"}`}
      >
        <span
          className={`h-2.5 w-2.5 border-b-2 border-zinc-500 ${gripSide === "right" ? "border-r-2" : "border-l-2"} group-hover:border-tide-300 group-focus:border-tide-300`}
        />
      </div>
    </div>
  );
}

/** Whether the small window shows on its own when the preview scrolls away; remembered per browser. */
export function useMiniPreviewEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(AUTO_KEY) === "0") setEnabled(false);
    } catch {
      // Storage blocked: keep it on
    }
  }, []);
  const change = (next: boolean) => {
    setEnabled(next);
    try {
      localStorage.setItem(AUTO_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked: the choice lasts for this page only
    }
  };
  return [enabled, change];
}
