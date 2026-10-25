import { easeOutExpo } from "../easing";
import { amt, minSide, type LookFrame } from "./frame";
import { hash01, withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Line-change wipes: a quick cover that sweeps across the frame each time the
// song moves to the next line, in the theme's own manner (a color block, a
// panel slide, channel noise, a film burn …). They sit over the picture and
// under the lyrics, and finish within WIPE_SEC so the new line reads at once.

const WIPE_SEC = 0.4;

/** 0..1 through the wipe after a line change, or -1 when none is running. */
function wipeProgress(f: LookFrame): number {
  const hop = f.hop;
  if (!hop || hop.index < 1 || hop.elapsed < 0 || hop.elapsed > WIPE_SEC) return -1;
  return hop.elapsed / WIPE_SEC;
}

/** A band that crosses the frame: covers in the first half, uncovers in the second. */
function band(p: number): { from: number; to: number } {
  const e = easeOutExpo(Math.min(1, p * 2));
  const l = p < 0.5 ? 0 : easeOutExpo((p - 0.5) * 2);
  return { from: l, to: e };
}

type Wipe = (f: LookFrame, p: number, a: number) => void;

const blockWipe =
  (color: (f: LookFrame) => string, angle = 0): Wipe =>
  (f, p, a) => {
    const { ctx, W, H } = f;
    const { from, to } = band(p);
    if (to <= from) return;
    const span = Math.hypot(W, H) * 1.2;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(angle);
    ctx.globalAlpha *= a;
    ctx.fillStyle = color(f);
    ctx.fillRect(-span / 2 + span * from, -span / 2, span * (to - from), span);
    ctx.restore();
  };

const WIPES: Partial<Record<ThemedPresetId, Wipe>> = {
  flat_type: blockWipe((f) => f.style.textColor, -0.35),
  pop_cutout: blockWipe((f) => f.style.accentColor, 0.25),
  mono_accent: blockWipe((f) => f.style.accentColor, -0.2),
  manga_panel: (f, p, a) => {
    // A white panel with an ink border slides across
    const { ctx, W, H } = f;
    const { from, to } = band(p);
    if (to <= from) return;
    const x0 = W * from;
    const x1 = W * to;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0, 0, x1 - x0, H);
    ctx.fillStyle = "#111111";
    const lw = Math.max(2, minSide(f) * 0.008);
    ctx.fillRect(x1 - lw, 0, lw, H);
    if (from > 0) ctx.fillRect(x0, 0, lw, H);
    ctx.restore();
  },
  digital_crt: (f, p, a) => {
    // Channel noise for a moment
    const { ctx, W, H } = f;
    const k = Math.sin(p * Math.PI) * a;
    const tick = Math.floor(f.timeSec * 30);
    const rows = 60;
    ctx.save();
    for (let i = 0; i < rows; i++) {
      const v = Math.floor(hash01(tick, i) * 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${(0.5 * k).toFixed(3)})`;
      ctx.fillRect(0, (H / rows) * i, W, H / rows + 0.5);
    }
    ctx.restore();
  },
  dark_glitch: (f, p, a) => {
    const { ctx, W, H } = f;
    const k = Math.sin(p * Math.PI) * a;
    const tick = Math.floor(f.timeSec * 30);
    ctx.save();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? `rgba(255,40,90,${0.5 * k})` : `rgba(40,220,255,${0.5 * k})`;
      ctx.fillRect(0, hash01(tick, 10 + i) * H, W, H * (0.01 + hash01(tick, 20 + i) * 0.04));
    }
    ctx.restore();
  },
  vintage_paper: (f, p, a) => {
    // A film burn flaring from one side
    const { ctx, W, H } = f;
    const k = Math.sin(p * Math.PI) * a;
    const x = (f.hop?.index ?? 0) % 2 ? W : 0;
    const g = ctx.createRadialGradient(x, H / 2, 0, x, H / 2, W * 0.9);
    g.addColorStop(0, `rgba(255,248,225,${0.9 * k})`);
    g.addColorStop(0.4, `rgba(240,150,60,${0.5 * k})`);
    g.addColorStop(1, "rgba(80,30,0,0)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  crimson_ink: (f, p, a) => {
    // A dry brush stroke dragged across
    const { ctx, W, H } = f;
    const { from, to } = band(p);
    if (to <= from) return;
    const s = minSide(f);
    ctx.save();
    ctx.globalAlpha *= a * 0.9;
    ctx.fillStyle = "#140303";
    for (let i = 0; i < 18; i++) {
      const y = (H / 18) * i;
      const jag = (hash01(i, 801) - 0.5) * s * 0.08;
      ctx.fillRect(W * from + jag, y, W * (to - from), H / 18 + 1);
    }
    ctx.restore();
  },
  neon_sign: (f, p, a) => {
    // The lights cut out for a beat
    const { ctx, W, H } = f;
    const k = p < 0.3 ? p / 0.3 : Math.max(0, 1 - (p - 0.3) / 0.7);
    ctx.save();
    ctx.fillStyle = `rgba(5,2,8,${(0.75 * k * a).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  snow_night: (f, p, a) => {
    // Frost creeping in from the edges and melting off
    const { ctx, W, H } = f;
    const k = Math.sin(p * Math.PI) * a;
    const g = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.2,
      W / 2,
      H / 2,
      Math.hypot(W, H) * 0.55,
    );
    g.addColorStop(0, "rgba(230,240,255,0)");
    g.addColorStop(1, `rgba(230,240,255,${0.85 * k})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  deep_sea: (f, p, a) => {
    // A curtain of bubbles rising through
    const { ctx, W, H } = f;
    const s = minSide(f);
    ctx.save();
    ctx.strokeStyle = withAlpha("#cfefff", 0.8 * a * Math.sin(p * Math.PI));
    ctx.lineWidth = Math.max(1, s * 0.002);
    for (let i = 0; i < 60; i++) {
      const y = H * (1.1 - p * (1 + hash01(i, 811) * 0.6));
      const x = W * hash01(i, 812);
      ctx.beginPath();
      ctx.arc(x, y, s * (0.006 + hash01(i, 813) * 0.02), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },
  sakura_breeze: (f, p, a) => {
    // A gust of petals sweeping sideways
    const { ctx, W, H } = f;
    const s = minSide(f);
    ctx.save();
    ctx.fillStyle = withAlpha(f.style.secondaryColor, 0.9 * a * Math.sin(p * Math.PI));
    for (let i = 0; i < 70; i++) {
      const x = W * (-0.3 + p * 1.6) - hash01(i, 821) * W * 0.5;
      const y = H * hash01(i, 822) + Math.sin(p * 6 + i) * s * 0.03;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p * 8 + i);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.014, s * 0.008, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
  summer_film: (f, p, a) => {
    // A white camera flash
    const { ctx, W, H } = f;
    const k = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85);
    ctx.save();
    ctx.fillStyle = `rgba(255,255,250,${(0.55 * k * a).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};

/** Themes that have a line-change wipe. */
export const WIPE_THEMES = Object.keys(WIPES) as ThemedPresetId[];

/** The theme's line-change wipe, when its "wipe" element is on. */
export function drawLineWipe(f: LookFrame): void {
  const wipe = WIPES[f.preset];
  if (!wipe) return;
  const a = amt(f, "wipe");
  if (a <= 0) return;
  const p = wipeProgress(f);
  if (p < 0) return;
  wipe(f, p, Math.min(1, 0.3 + a));
}
