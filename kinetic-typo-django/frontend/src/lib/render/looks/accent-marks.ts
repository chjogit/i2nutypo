import { easeOutExpo } from "../easing";
import type { Box } from "../text-bounds";
import { amt, minSide, type LookFrame } from "./frame";
import { hash01, withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Accent-word marks: when an accented word is sung (a word the lyrics call
// out, or the last word of a big line), the lyric theme marks the text box
// for a moment in its own manner: a marker swipe, corner brackets, a burst of
// focus lines, glints, a ring or ink drops. They are drawn over the lyrics,
// around the box the lyrics were measured to cover.

const MARK_SEC = 0.55;

/** Seconds into the newest accented word that is still marking, or -1. */
export function accentElapsed(f: LookFrame): number {
  const line = f.line;
  if (!line || f.lineElapsed < 0) return -1;
  let best = -1;
  for (const w of line.words) {
    if (!w.isAccent) continue;
    const e = f.lineElapsed - w.startOffset;
    if (e >= 0 && e <= MARK_SEC && (best < 0 || e < best)) best = e;
  }
  return best;
}

/** Whether this frame would draw a mark, so the lyrics need measuring. */
export function wantsAccentMark(f: LookFrame): boolean {
  return !f.mixed && MARKS[f.preset] !== undefined && amt(f, "accent") > 0 && accentElapsed(f) >= 0;
}

type Mark = (f: LookFrame, b: Box, p: number, k: number) => void;

/** A marker stroke swept under the text from left to right. */
const underline =
  (color: (f: LookFrame) => string, tilt = -0.02): Mark =>
  (f, b, p, k) => {
    const { ctx } = f;
    const s = minSide(f);
    const grow = easeOutExpo(Math.min(1, p / 0.35));
    const w = (b.x1 - b.x0 + s * 0.04) * grow;
    const h = Math.max(3, s * 0.014);
    ctx.save();
    ctx.translate(b.x0 - s * 0.02, b.y1 + s * 0.012);
    ctx.rotate(tilt);
    ctx.fillStyle = withAlpha(color(f), 0.9 * k);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

/** Four corner brackets that snap in from outside the box. */
const brackets =
  (color: (f: LookFrame) => string): Mark =>
  (f, b, p, k) => {
    const { ctx } = f;
    const s = minSide(f);
    const gap = s * (0.02 + 0.05 * (1 - easeOutExpo(Math.min(1, p / 0.3))));
    const arm = s * 0.035;
    const x0 = b.x0 - gap;
    const y0 = b.y0 - gap;
    const x1 = b.x1 + gap;
    const y1 = b.y1 + gap;
    ctx.save();
    ctx.strokeStyle = withAlpha(color(f), 0.95 * k);
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    for (const [x, y, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ]) {
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
    }
    ctx.stroke();
    ctx.restore();
  };

/** Short focus lines bursting out around the box. */
const burst =
  (color: (f: LookFrame) => string, count = 18): Mark =>
  (f, b, p, k) => {
    const { ctx } = f;
    const s = minSide(f);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const rx = (b.x1 - b.x0) / 2 + s * 0.03;
    const ry = (b.y1 - b.y0) / 2 + s * 0.03;
    const out = easeOutExpo(Math.min(1, p / 0.4));
    const seed = f.line?.index ?? 0;
    ctx.save();
    ctx.strokeStyle = withAlpha(color(f), 0.9 * k);
    ctx.lineWidth = Math.max(1.5, s * 0.005);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash01(seed, i) * 0.2;
      const len = s * (0.025 + hash01(seed, i + 40) * 0.04);
      const d = 1 + out * 0.25;
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    ctx.stroke();
    ctx.restore();
  };

/** Four-point glints twinkling at a few spots on the box edge. */
const glints =
  (color: (f: LookFrame) => string): Mark =>
  (f, b, p, k) => {
    const { ctx } = f;
    const s = minSide(f);
    const seed = f.line?.index ?? 0;
    ctx.save();
    ctx.fillStyle = withAlpha(color(f), 0.95 * k);
    for (let i = 0; i < 3; i++) {
      const tw = Math.sin(Math.min(1, p * 1.6 - i * 0.15) * Math.PI);
      if (tw <= 0) continue;
      const x = b.x0 + (b.x1 - b.x0) * hash01(seed, 60 + i);
      const y = i % 2 ? b.y1 : b.y0;
      const r = s * 0.028 * tw;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r * 0.7, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r * 0.7, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    }
    ctx.restore();
  };

/** An oval ring widening out from the box. */
const ring =
  (color: (f: LookFrame) => string): Mark =>
  (f, b, p, k) => {
    const { ctx } = f;
    const s = minSide(f);
    const e = easeOutExpo(Math.min(1, p));
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    ctx.save();
    ctx.strokeStyle = withAlpha(color(f), 0.8 * k * (1 - e * 0.6));
    ctx.lineWidth = Math.max(1, s * 0.004);
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      (b.x1 - b.x0) / 2 + s * (0.03 + e * 0.08),
      (b.y1 - b.y0) / 2 + s * (0.03 + e * 0.08),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  };

/** Ink drops flicked off the end of the text. */
const drops =
  (color: (f: LookFrame) => string): Mark =>
  (f, b, p, k) => {
    const { ctx } = f;
    const s = minSide(f);
    const seed = f.line?.index ?? 0;
    const out = easeOutExpo(Math.min(1, p / 0.25));
    ctx.save();
    ctx.fillStyle = withAlpha(color(f), 0.9 * k);
    for (let i = 0; i < 9; i++) {
      const a = -0.6 + hash01(seed, 70 + i) * 1.2;
      const d = s * (0.02 + hash01(seed, 80 + i) * 0.09) * out;
      ctx.beginPath();
      ctx.arc(
        b.x1 + Math.cos(a) * d,
        (b.y0 + b.y1) / 2 + Math.sin(a) * d,
        s * (0.003 + hash01(seed, 90 + i) * 0.007),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  };

const accent = (f: LookFrame) => f.style.accentColor;
const second = (f: LookFrame) => f.style.secondaryColor;
const text = (f: LookFrame) => f.style.textColor;

const MARKS: Partial<Record<ThemedPresetId, Mark>> = {
  album_jacket: glints(() => "#ffffff"),
  pop_cutout: underline(accent, -0.04),
  tint_panels: brackets(accent),
  ballad_hud: brackets(text),
  cinematic_fantasy: glints(() => "#fff4d6"),
  digital_crt: brackets(() => "#7dffb0"),
  dark_glitch: burst(() => "#ff2d6a", 14),
  summer_film: glints(() => "#fffbe8"),
  flat_type: underline(accent, 0),
  eclipse_nebula: ring(second),
  mono_accent: underline(accent, -0.015),
  vintage_paper: underline(() => "#5a3a22", -0.01),
  pastel_dream: glints(() => "#ffffff"),
  crimson_ink: drops(() => "#b0101c"),
  sakura_breeze: glints(second),
  snow_night: glints(() => "#eaf4ff"),
  rain_window: ring(() => "#dbe9f7"),
  manga_panel: burst(() => "#111111", 22),
  deep_sea: ring(() => "#cfefff"),
  neon_sign: brackets(accent),
};

/** Themes that mark accented words. */
export const ACCENT_THEMES = Object.keys(MARKS) as ThemedPresetId[];

/**
 * Marks the accented word just sung around the lyric box (canvas pixels, as
 * recordTextBounds gives it), under the current transform.
 */
export function drawAccentMark(f: LookFrame, box: Box | null): void {
  const mark = MARKS[f.preset];
  if (!mark || !box || f.mixed) return;
  const a = amt(f, "accent");
  if (a <= 0) return;
  const e = accentElapsed(f);
  if (e < 0) return;
  const p = e / MARK_SEC;
  const k = Math.min(1, 0.35 + a) * (p < 0.7 ? 1 : (1 - p) / 0.3);
  if (k <= 0) return;
  const { ctx } = f;
  // The box is in canvas pixels; bring it back into the drawing's own units
  let b = box;
  if (typeof ctx.getTransform === "function") {
    const inv = ctx.getTransform().inverse();
    const p0 = inv.transformPoint({ x: box.x0, y: box.y0 });
    const p1 = inv.transformPoint({ x: box.x1, y: box.y1 });
    b = {
      x0: Math.min(p0.x, p1.x),
      y0: Math.min(p0.y, p1.y),
      x1: Math.max(p0.x, p1.x),
      y1: Math.max(p0.y, p1.y),
    };
  }
  if (!(b.x1 > b.x0 && b.y1 > b.y0)) return;
  mark(f, b, p, k);
}
