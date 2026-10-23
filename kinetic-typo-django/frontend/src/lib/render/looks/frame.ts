import type { LookPresetId, LyricLine, StyleSettings, SubtitleSettings } from "@/types/project";
import type { Ctx2D } from "../motifs";
import type { TextBounds } from "../text-bounds";
import {
  drawCharacter,
  drawImageRect,
  kenBurnsSource,
  type IllustrationImages,
  type Rect,
} from "./illustration";
import { freeSpan, pickCell } from "./layout";
import { hash01 } from "./noise";
import { lookElementAmount } from "./presets";

/** Everything a look preset needs for one frame. */
export interface LookFrame {
  preset: Exclude<LookPresetId, "classic">;
  ctx: Ctx2D;
  W: number;
  H: number;
  timeSec: number;
  line: LyricLine | null;
  nextLine: LyricLine | null;
  lineElapsed: number;
  /** 0..1 through the active line. */
  lineProgress: number;
  /** End of the last lyric line, used for song-progress decorations. */
  songEnd: number;
  style: StyleSettings;
  subtitles: SubtitleSettings;
  energy: number;
  images: IllustrationImages;
  /** True when subtitles are drawn at the bottom this frame, so lyrics keep clear of them. */
  subtitleVisible: boolean;
  /** True when subtitles moved to the top because the character stands at the bottom center. */
  subtitleTop: boolean;
  /** Character on screen, or null when none is drawn. */
  charRect: Rect | null;
  /** 4x4 cells the lyrics should avoid (all false when avoidance is off). */
  blocked: readonly boolean[];
  /** Detail-tab multipliers, 1 = the look's own default. */
  glitch: number;
  shake: number;
  /** Extra beat jolt applied to the whole picture. */
  frameShake: { x: number; y: number };
  /** Global plus per-line lyric shift in pixels. */
  lyricShift: { x: number; y: number };
  subtitleShift: { x: number; y: number };
  /** When set, the lyric renderer records where it drew text this frame (for the preview's text box). */
  textBounds?: TextBounds;
  /** True while drawing a theme mixed over another one: it draws only its decor and overlay. */
  mixed?: boolean;
}

export interface LookRenderer {
  /** Background, illustration and character. */
  scene: (f: LookFrame) => void;
  /** Lyric text; also used alone for the transparent text layer. */
  lyrics: (f: LookFrame) => void;
  /** Additive scene layers (no background or character), drawn when the theme is mixed into another. */
  decor?: (f: LookFrame) => void;
  /** Screen effects over everything except the bottom subtitles. */
  overlay: (f: LookFrame) => void;
  /** True when letterbox bars are drawn, so the subtitles sit above them. */
  letterbox?: (f: LookFrame) => boolean;
}

export const minSide = (f: LookFrame): number => Math.min(f.W, f.H);
export const isPortrait = (f: LookFrame): boolean => f.H > f.W;

/** Strength of one of this theme's elements; 0 when switched off. */
export function amt(f: LookFrame, id: string): number {
  return lookElementAmount(f.style.lookElements, f.preset, id);
}

/** Source rect of the background at the user's framing (still when locked). */
export function backgroundSource(f: LookFrame, dest: Rect): Rect | null {
  const img = f.images.background;
  if (!img) return null;
  const ill = f.style.illustration;
  return kenBurnsSource(
    img,
    dest,
    f.timeSec,
    { panX: ill.bgX, panY: ill.bgY, zoom: ill.bgZoom, motion: ill.bgLocked ? 0 : ill.motion },
    ill.bgLocked ? 0 : f.energy,
  );
}

/** Draws the background illustration. Returns the source rect, or null without an image. */
export function drawIllustration(f: LookFrame, dest: Rect): Rect | null {
  const src = backgroundSource(f, dest);
  if (!src || !f.images.background) return null;
  drawImageRect(f.ctx, f.images.background, src, dest);
  return src;
}

/** Draws the character at its placement. bounce and tilt are ignored while it is locked. */
export function drawCharacterLayer(
  f: LookFrame,
  opts: { bounce: number; tilt: number; alpha?: number },
): void {
  const img = f.images.character;
  if (!img || !f.charRect) return;
  const ill = f.style.illustration;
  const still = ill.charLocked;
  drawCharacter(f.ctx, img, f.charRect, {
    bounce: still || !ill.beatBounce ? 0 : Math.min(1, opts.bounce),
    tilt: still ? 0 : opts.tilt * f.shake,
    flip: ill.charFlip,
    alpha: opts.alpha,
  });
}

/** The free screen area for a lyric block: the first open cell in order of preference, widened over open neighbors. */
export function lyricRegion(f: LookFrame, preferred: readonly number[]): { cell: number; rect: Rect } {
  const cell = pickCell(f.blocked, preferred);
  return { cell, rect: freeSpan(f.blocked, cell, f.W, f.H) };
}

/** Film grain from hashed specks; changes every frame at 24fps. */
export function drawGrain(f: LookFrame, amount: number, light = true): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const frame = Math.floor(f.timeSec * 24);
  const count = Math.round(((W * H) / 2200) * amount);
  ctx.save();
  ctx.fillStyle = light ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
  for (let i = 0; i < count; i++) {
    const x = hash01(frame, i * 2) * W;
    const y = hash01(frame, i * 2 + 1) * H;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
}

export function drawVignette(f: LookFrame, strength: number, color = "0,0,0"): void {
  const { ctx, W, H } = f;
  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.25,
    W / 2,
    H / 2,
    Math.hypot(W, H) * 0.55,
  );
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawScanlines(f: LookFrame, alpha: number, step: number): void {
  const { ctx, W, H } = f;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, Math.max(1, step / 3));
  ctx.restore();
}

/** Fade-in factor 0..1 over `dur` seconds after `elapsed` reaches 0. */
export function fadeIn(elapsed: number, dur: number): number {
  return elapsed <= 0 ? 0 : elapsed >= dur ? 1 : elapsed / dur;
}

/** Fade-out near the end of the line, 1 until the last `tail` share. */
export function lineExit(f: LookFrame, tail = 0.1): number {
  return f.lineProgress < 1 - tail ? 1 : Math.max(0, (1 - f.lineProgress) / tail);
}

/** Side margin lyrics keep from the frame edges. */
export const lyricMargin = (f: LookFrame): number => minSide(f) * 0.04;

/** Line width for a lyric block: at most `want` and never wider than the frame inside its margins. */
export function fitWidth(f: LookFrame, want: number): number {
  return Math.min(want, f.W - lyricMargin(f) * 2);
}

/** Left edge moved so a block w wide stays on screen after the lyric shift. */
export function clampLeft(f: LookFrame, left: number, w: number): number {
  const m = lyricMargin(f);
  return Math.max(m - f.lyricShift.x, Math.min(left, f.W - m - f.lyricShift.x - w));
}

/** Center moved so a block w wide stays on screen after the lyric shift. */
export function clampCenter(f: LookFrame, centerX: number, w: number): number {
  return clampLeft(f, centerX - w / 2, w) + w / 2;
}
