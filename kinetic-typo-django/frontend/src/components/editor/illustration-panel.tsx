import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { AspectRatio, CharacterCue, IllustrationSettings, ImageAsset } from "@/types/project";
import type { LoadedImage } from "@/lib/render/looks/illustration";
import { drawCharacter, drawImageRect, kenBurnsSource } from "@/lib/render/looks/illustration";
import { characterAt, CUE_EFFECTS, MAX_CUE_FADE, MIN_CUE_FADE, sortCues } from "@/lib/render/looks/cues";
import { forgetImage, resolveIllustrationImages } from "@/lib/render/looks/image-cache";
import { blockedCells, cellRect, CELLS, characterRect, GRID, sanitizeCells } from "@/lib/render/looks/layout";
import { pickedLooks } from "@/lib/render/looks/presets";
import { usePlaybackStore } from "@/store/playback-store";
import { TimeField } from "./time-field";
import { useProjectStore } from "@/store/project-store";

type ImageSlot = "background" | "character" | "cover";
type StageTool = "move" | "cells";

const STAGE_W = 288;
const STAGE_H: Record<AspectRatio, number> = { "16:9": 162, "9:16": 512, "1:1": 288 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}

function Slider(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  label: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label={props.label}
        className="w-24 accent-indigo-500 disabled:opacity-30"
      />
      <span className="w-10 text-right font-mono text-zinc-300">{props.format(props.value)}</span>
    </span>
  );
}

function LockToggle({
  locked,
  onChange,
  label,
}: {
  locked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!locked)}
      aria-pressed={locked}
      aria-label={`${label} ${locked ? "고정 풀기" : "고정"}`}
      className={`rounded-md border px-2 py-0.5 text-[11px] ${
        locked
          ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {locked ? "🔒 고정" : "✋ 이동"}
    </button>
  );
}

/**
 * Right column: background and character layers. The mini stage shows the
 * frame split 4x4; in move mode drag the character or the background, in
 * cell mode click or drag over cells to mark where lyrics must not go.
 */
export function IllustrationPanel() {
  const images = useProjectStore((s) => s.images);
  const ill = useProjectStore((s) => s.style.illustration);
  const aspectRatio = useProjectStore((s) => s.style.aspectRatio);
  const setIllustration = useProjectStore((s) => s.setIllustration);
  const setImage = useProjectStore((s) => s.setImage);
  const albumPicked = useProjectStore((s) => pickedLooks(s.style).includes("album_jacket"));
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<StageTool>("move");
  /** The cue whose return place the stage is editing, or null for the character's own place. */
  const [cueSel, setCueSel] = useState<number | null>(null);
  const cues = ill.charCues ?? [];
  const editCue = cueSel !== null && cueSel < cues.length ? cueSel : null;
  const cells = sanitizeCells(ill.noTextCells);
  const urlsRef = useRef<Record<ImageSlot, string | null>>({
    background: null,
    character: null,
    cover: null,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    target: "character" | "background" | "cue";
    startX: number;
    startY: number;
    from: IllustrationSettings;
  } | null>(null);
  // Cell painting: the value the first clicked cell flipped to, applied to every cell dragged over
  const paintRef = useRef<boolean | null>(null);
  const stageH = STAGE_H[aspectRatio];

  // Revoke picked images with the panel
  useEffect(
    () => () => {
      for (const url of Object.values(urlsRef.current)) {
        if (!url) continue;
        forgetImage(url);
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  // Mini stage: background framing, 4x4 grid, cells taken by the character, and the character
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const loaded = resolveIllustrationImages(images);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#18181b";
      ctx.fillRect(0, 0, W, H);
      if (loaded.background) {
        const dest = { x: 0, y: 0, w: W, h: H };
        const src = kenBurnsSource(
          loaded.background,
          dest,
          0,
          { panX: ill.bgX, panY: ill.bgY, zoom: ill.bgZoom, motion: 0 },
          0,
        );
        drawImageRect(ctx, loaded.background, src, dest);
      }
      const cue = editCue !== null ? (ill.charCues[editCue] ?? null) : null;
      const cueIll = cue ? { ...ill, charX: cue.x, charY: cue.y } : null;
      const cueRect = cueIll ? characterRect(cueIll, loaded.character, W, H) : null;
      const charRect = characterRect(ill, loaded.character, W, H);
      // Editing a return place: its cells (which win over the user's then) in violet, the user's dimmed
      if (cue) {
        blockedCells(cueRect, W, H).forEach((b, c) => {
          if (!b || !ill.avoidCharacter) return;
          const r = cellRect(W, H, c);
          ctx.fillStyle = "rgba(139, 92, 246, 0.3)";
          ctx.fillRect(r.x, r.y, r.w, r.h);
        });
      }
      if (!cue)
        sanitizeCells(ill.noTextCells).forEach((b, c) => {
          if (!b) return;
          const r = cellRect(W, H, c);
          ctx.fillStyle = ill.avoidCharacter ? "rgba(239, 68, 68, 0.32)" : "rgba(239, 68, 68, 0.1)";
          ctx.fillRect(r.x, r.y, r.w, r.h);
          if (ill.avoidCharacter) {
            ctx.strokeStyle = "rgba(248, 113, 113, 0.9)";
            ctx.lineWidth = 2;
            ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          }
        });
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (let i = 1; i < GRID; i++) {
        ctx.beginPath();
        ctx.moveTo((W * i) / GRID, 0);
        ctx.lineTo((W * i) / GRID, H);
        ctx.moveTo(0, (H * i) / GRID);
        ctx.lineTo(W, (H * i) / GRID);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (loaded.character && charRect) {
        drawCharacter(ctx, loaded.character, charRect, {
          bounce: 0,
          tilt: 0,
          flip: ill.charFlip,
          alpha: cue ? 0.3 : 1,
        });
        if (!cue) {
          ctx.strokeStyle = ill.charLocked ? "rgba(245,158,11,0.9)" : "rgba(129,140,248,0.95)";
          ctx.strokeRect(charRect.x, charRect.y, charRect.w, charRect.h);
        }
      }
      if (loaded.character && cueRect) {
        drawCharacter(ctx, loaded.character, cueRect, { bounce: 0, tilt: 0, flip: ill.charFlip });
        ctx.strokeStyle = "rgba(167,139,250,0.95)";
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(cueRect.x, cueRect.y, cueRect.w, cueRect.h);
        ctx.setLineDash([]);
      }
      // Decoding is async; redraw until the picked images are ready
      const pending =
        (images.background !== null && !loaded.background) ||
        (images.character !== null && !loaded.character);
      if (pending) timer = setTimeout(draw, 120);
    };
    draw();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [images, ill, stageH, editCue]);

  /** Marks the cells the character covers now, at the stage's own frame size. */
  const cellsFromCharacter = (character: LoadedImage | null) =>
    blockedCells(characterRect(ill, character, STAGE_W, stageH), STAGE_W, stageH);

  const release = (slot: ImageSlot) => {
    const url = urlsRef.current[slot];
    if (!url) return;
    forgetImage(url);
    URL.revokeObjectURL(url);
    urlsRef.current[slot] = null;
  };

  const handleFile = (slot: ImageSlot, file: File) => {
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      release(slot);
      urlsRef.current[slot] = objectUrl;
      const asset: ImageAsset = { fileName: file.name, objectUrl };
      setImage(slot, asset);
      // A first character fills the empty grid once; after that the cells are the user's
      if (slot === "character" && !cells.some(Boolean)) {
        const marked = cellsFromCharacter({
          source: probe,
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        });
        if (marked.some(Boolean)) setIllustration({ noTextCells: marked });
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("이 파일은 열 수 없는 이미지 형식입니다.");
    };
    probe.src = objectUrl;
  };

  const clear = (slot: ImageSlot) => {
    release(slot);
    setImage(slot, null);
  };

  const toCanvas = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e);
    const canvas = e.currentTarget;
    const col = clamp(Math.floor((p.x / canvas.width) * GRID), 0, GRID - 1);
    const row = clamp(Math.floor((p.y / canvas.height) * GRID), 0, GRID - 1);
    return row * GRID + col;
  };

  const paintCell = (cell: number, value: boolean) => {
    if (cells[cell] === value) return;
    const next = [...cells];
    next[cell] = value;
    setIllustration({ noTextCells: next });
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    if (tool === "cells") {
      const cell = cellAt(e);
      paintRef.current = !cells[cell];
      canvas.setPointerCapture(e.pointerId);
      paintCell(cell, paintRef.current);
      return;
    }
    const p = toCanvas(e);
    const loaded = resolveIllustrationImages(images);
    if (editCue !== null) {
      // Anywhere on the stage drags the return place
      canvas.setPointerCapture(e.pointerId);
      dragRef.current = { target: "cue", startX: p.x, startY: p.y, from: ill };
      return;
    }
    const r = characterRect(ill, loaded.character, canvas.width, canvas.height);
    const onChar = r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    let target: "character" | "background" | null = null;
    if (onChar && !ill.charLocked) target = "character";
    else if (loaded.background && !ill.bgLocked) target = "background";
    if (!target) return;
    canvas.setPointerCapture(e.pointerId);
    dragRef.current = { target, startX: p.x, startY: p.y, from: ill };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (paintRef.current !== null) {
      paintCell(cellAt(e), paintRef.current);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const canvas = e.currentTarget;
    const p = toCanvas(e);
    const dx = (p.x - drag.startX) / canvas.width;
    const dy = (p.y - drag.startY) / canvas.height;
    if (drag.target === "cue" && editCue !== null) {
      const from = drag.from.charCues[editCue];
      if (!from) return;
      setIllustration({
        charCues: cues.map((c, i) =>
          i === editCue ? { ...c, x: clamp(from.x + dx, -0.2, 1.2), y: clamp(from.y + dy, 0.15, 1.4) } : c,
        ),
      });
    } else if (drag.target === "character") {
      setIllustration({
        charX: clamp(drag.from.charX + dx, -0.2, 1.2),
        charY: clamp(drag.from.charY + dy, 0.15, 1.4),
      });
    } else {
      // Dragging right shows more of the picture's left side, like moving paper under a frame
      setIllustration({
        bgX: clamp(drag.from.bgX - dx * 2, -1, 1),
        bgY: clamp(drag.from.bgY - dy * 2, -1, 1),
      });
    }
  };

  const endDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current && paintRef.current === null) return;
    dragRef.current = null;
    paintRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const imagePicker = (slot: ImageSlot, title: string, hint: string) => {
    const asset = images[slot];
    return (
      <div className="space-y-1">
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-800 px-2 py-2 text-xs text-zinc-400 hover:border-indigo-500 hover:text-zinc-200">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(slot, file);
              e.target.value = "";
            }}
          />
          {asset ? `${title} 바꾸기` : `${title} 선택`}
        </label>
        {asset ? (
          <p className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
            <span className="truncate">{asset.fileName}</span>
            <button
              type="button"
              onClick={() => clear(slot)}
              className="shrink-0 text-indigo-400 hover:underline"
            >
              빼기
            </button>
          </p>
        ) : (
          <p className="text-[11px] text-zinc-500">{hint}</p>
        )}
      </div>
    );
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  /** Saves cues in time order and keeps the edited one selected. */
  const saveCues = (next: CharacterCue[], keep: CharacterCue | null) => {
    const sorted = sortCues(next);
    setIllustration({ charCues: sorted });
    setCueSel(keep ? sorted.indexOf(keep) : null);
  };

  const addCue = () => {
    const t = Math.round(usePlaybackStore.getState().currentTime * 100) / 100;
    // It comes back where it is at that moment, so the user only has to drag it somewhere new
    const at = characterAt(ill, t);
    const cue: CharacterCue = { hideAt: t, showAt: t + 3, effect: "fade", fade: 0.6, x: at.x, y: at.y };
    saveCues([...cues, cue], cue);
    setTool("move");
  };

  const updateCue = (i: number, patch: Partial<CharacterCue>) => {
    const old = cues[i];
    const cue = { ...old, ...patch };
    // Leaving after the return time pushes the return out by the same gap
    if (patch.hideAt !== undefined && cue.showAt < cue.hideAt)
      cue.showAt = cue.hideAt + (old.showAt - old.hideAt);
    if (patch.showAt !== undefined && cue.showAt < cue.hideAt) cue.showAt = cue.hideAt;
    saveCues(
      cues.map((c, k) => (k === i ? cue : c)),
      cue,
    );
  };

  const removeCue = (i: number) =>
    saveCues(
      cues.filter((_, k) => k !== i),
      null,
    );

  return (
    <section className="space-y-3 px-4 py-4">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-400">일러스트</h2>

      <div className="space-y-1.5">
        <div
          role="radiogroup"
          aria-label="미니 화면 도구"
          className="flex rounded-md border border-zinc-800 text-xs"
        >
          {(
            [
              ["move", "✋ 옮기기"],
              ["cells", "🟥 가사 금지 칸"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={tool === id}
              onClick={() => setTool(id)}
              className={`flex-1 px-2 py-1 ${tool === id ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {text}
            </button>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          width={STAGE_W * 2}
          height={stageH * 2}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label={
            tool === "cells"
              ? "일러스트 배치 미리보기. 칸을 눌러 가사 금지 칸을 켜고 끕니다."
              : "일러스트 배치 미리보기. 캐릭터나 배경을 끌어서 옮깁니다."
          }
          className={`mx-auto block w-full max-w-[288px] touch-none rounded border border-zinc-800 ${
            tool === "cells" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
          }`}
          style={{ aspectRatio: `${STAGE_W} / ${stageH}` }}
        />
        {editCue !== null ? (
          <p className="text-[11px] leading-snug text-violet-300">
            {editCue + 1}번 재등장 위치를 끌어서 옮기세요. 보라 칸은 돌아온 뒤 가사가 피해 갈 칸입니다(직접
            지정한 빨간 칸보다 우선).{" "}
            <button type="button" onClick={() => setCueSel(null)} className="text-indigo-400 hover:underline">
              편집 끝내기
            </button>
          </p>
        ) : tool === "cells" ? (
          <>
            <p className="text-[11px] leading-snug text-zinc-500">
              칸을 누르거나 끌어서 빨간 칸으로 지정하세요. 가사는 빨간 칸을 피해 가고, 맨 아래 가운데 두 칸 중
              하나가 빨간색이면 하단 자막은 위로 올라갑니다.
            </p>
            <div className="flex gap-3 text-[11px]">
              <button
                type="button"
                disabled={!resolveIllustrationImages(images).character}
                onClick={() =>
                  setIllustration({
                    noTextCells: cellsFromCharacter(resolveIllustrationImages(images).character),
                  })
                }
                className="text-indigo-400 hover:underline disabled:opacity-40"
              >
                캐릭터 위치로 채우기
              </button>
              <button
                type="button"
                onClick={() => setIllustration({ noTextCells: Array<boolean>(CELLS).fill(false) })}
                className="text-indigo-400 hover:underline"
              >
                모두 비우기
              </button>
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-zinc-500">
            캐릭터나 배경을 끌어서 옮기세요. 가사가 들어가면 안 되는 곳은 &quot;가사 금지 칸&quot;에서
            지정합니다.
          </p>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300">배경</span>
          <LockToggle locked={ill.bgLocked} onChange={(v) => setIllustration({ bgLocked: v })} label="배경" />
        </div>
        {imagePicker("background", "배경 일러스트", "가로로 긴 그림이 잘 어울립니다")}
        <Row label="확대">
          <Slider
            value={ill.bgZoom}
            min={1}
            max={3}
            step={0.05}
            disabled={ill.bgLocked}
            label="배경 확대"
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => setIllustration({ bgZoom: v })}
          />
        </Row>
        <Row label="움직임 (줌 · 팬)">
          <Slider
            value={ill.motion}
            min={0}
            max={1}
            step={0.05}
            disabled={ill.bgLocked}
            label="배경 움직임"
            format={pct}
            onChange={(v) => setIllustration({ motion: v })}
          />
        </Row>
        <button
          type="button"
          disabled={ill.bgLocked}
          onClick={() => setIllustration({ bgX: 0, bgY: 0, bgZoom: 1 })}
          className="text-[11px] text-indigo-400 hover:underline disabled:opacity-40"
        >
          배경 위치 가운데로
        </button>
      </div>

      {albumPicked && (
        <div className="space-y-2 border-t border-zinc-800/70 pt-3">
          <span className="text-xs font-semibold text-zinc-300">앨범 커버</span>
          {imagePicker(
            "cover",
            "앨범 커버",
            "정사각 커버와 레코드 라벨에 쓰입니다. 없으면 배경 일러스트를 씁니다",
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300">캐릭터</span>
          <LockToggle
            locked={ill.charLocked}
            onChange={(v) => setIllustration({ charLocked: v })}
            label="캐릭터"
          />
        </div>
        {imagePicker("character", "캐릭터 PNG", "배경이 투명한 PNG를 권장합니다")}
        <Row label="크기">
          <Slider
            value={ill.characterScale}
            min={0.2}
            max={1.2}
            step={0.02}
            disabled={ill.charLocked}
            label="캐릭터 크기"
            format={pct}
            onChange={(v) => setIllustration({ characterScale: v })}
          />
        </Row>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-zinc-200">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={ill.showCharacter}
              onChange={(e) => setIllustration({ showCharacter: e.target.checked })}
              className="accent-indigo-500"
            />
            표시
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={ill.charFlip}
              disabled={ill.charLocked}
              onChange={(e) => setIllustration({ charFlip: e.target.checked })}
              className="accent-indigo-500"
            />
            좌우 반전
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={ill.beatBounce}
              disabled={ill.charLocked}
              onChange={(e) => setIllustration({ beatBounce: e.target.checked })}
              className="accent-indigo-500"
            />
            비트에 맞춰 튀기
          </label>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-200">
          <input
            type="checkbox"
            checked={ill.avoidCharacter}
            onChange={(e) => setIllustration({ avoidCharacter: e.target.checked })}
            className="accent-indigo-500"
          />
          빨간 칸을 피해 가사 · 자막 놓기 (4x4)
        </label>
        <Row label="흔들림">
          <Slider
            value={ill.charShake ?? 0.5}
            min={0}
            max={1}
            step={0.05}
            disabled={ill.charLocked}
            label="캐릭터 흔들림"
            format={pct}
            onChange={(v) => setIllustration({ charShake: v })}
          />
        </Row>
        <p className="text-[11px] leading-snug text-zinc-500">
          0%면 가만히 있고, 50%가 테마 기본값, 그 위로는 좌우로 더 크게 흔들립니다.
        </p>
      </div>

      <div className="space-y-2 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300">캐릭터 퇴장 · 재등장</span>
          <button
            type="button"
            onClick={addCue}
            className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:border-indigo-500"
          >
            + 지금 사라지기
          </button>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">
          사라져 있는 동안은 가사 금지 칸이 잠시 꺼지고, 다시 나타나면 그 자리가 가사 금지 칸이 됩니다(직접
          지정한 칸보다 우선).
        </p>
        {cues.map((cue, i) => (
          <div
            key={i}
            className={`space-y-1.5 rounded-md border px-2 py-1.5 ${
              editCue === i ? "border-violet-500/70 bg-violet-500/5" : "border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-zinc-300">{i + 1}번</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={editCue === i}
                  onClick={() => {
                    setCueSel(editCue === i ? null : i);
                    setTool("move");
                  }}
                  className="text-indigo-400 hover:underline"
                >
                  {editCue === i ? "위치 편집 끝" : "재등장 위치 옮기기"}
                </button>
                <button
                  type="button"
                  onClick={() => removeCue(i)}
                  className="text-indigo-400 hover:underline"
                >
                  빼기
                </button>
              </span>
            </div>
            <TimeField label="사라짐" value={cue.hideAt} onCommit={(v) => updateCue(i, { hideAt: v })} />
            <TimeField label="재등장" value={cue.showAt} onCommit={(v) => updateCue(i, { showAt: v })} />
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="w-12 shrink-0">효과</span>
              <select
                value={cue.effect}
                onChange={(e) => updateCue(i, { effect: e.target.value as CharacterCue["effect"] })}
                aria-label={`${i + 1}번 사라짐 효과`}
                className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-zinc-100 focus:border-indigo-500 focus:outline-none"
              >
                {CUE_EFFECTS.map(([id, text]) => (
                  <option key={id} value={id}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <Row label="전환 길이">
              <Slider
                value={cue.fade}
                min={MIN_CUE_FADE}
                max={MAX_CUE_FADE}
                step={0.1}
                label={`${i + 1}번 전환 길이`}
                format={(v) => `${v.toFixed(1)}s`}
                onChange={(v) => updateCue(i, { fade: v })}
              />
            </Row>
          </div>
        ))}
      </div>
    </section>
  );
}
