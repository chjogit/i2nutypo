import { easeOutExpo } from "../easing";
import { amt, minSide, type LookFrame } from "./frame";
import { drawConfetti, drawLightning, snapshotBand } from "./extras";
import { drawParticles } from "./kit";
import { hash01, withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Accent hits: when a line written with " !" at the end starts, each theme lands a short hit of its own, a burst of light,
// a slash of ink, a storm of petals, so the song's peaks look like peaks.

const HIT_SEC = 1.3;

/** 0..1 hit envelope at the start of an accented line, 0 elsewhere. */
export function climaxHit(f: LookFrame): number {
  const line = f.line;
  if (!line || !((line.lineStyle.flash ?? 0) > 0)) return 0;
  const t = f.lineElapsed;
  if (t < 0 || t > HIT_SEC) return 0;
  return t < 0.08 ? t / 0.08 : 1 - easeOutExpo((t - 0.08) / (HIT_SEC - 0.08)) * 0.999;
}

/** Seconds into the hit, 0..HIT_SEC. */
const hitTime = (f: LookFrame) => Math.max(0, f.lineElapsed);

/** Straight rays from a point all around, like a sunburst. */
function sunburst(f: LookFrame, k: number, color: string, at = { x: 0.5, y: 0.5 }, rays = 24): void {
  const { ctx, W, H } = f;
  const cx = W * at.x;
  const cy = H * at.y;
  const len = Math.hypot(W, H);
  const turn = hitTime(f) * 0.25 + (f.line?.index ?? 0);
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.35 * k);
  for (let i = 0; i < rays; i++) {
    const a = turn + (i / rays) * Math.PI * 2;
    const half = (Math.PI / rays) * 0.45;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - half) * len, cy + Math.sin(a - half) * len);
    ctx.lineTo(cx + Math.cos(a + half) * len, cy + Math.sin(a + half) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A soft flash of light from a point. */
function bloom(f: LookFrame, k: number, color: string, at = { x: 0.5, y: 0.5 }, size = 0.8): void {
  const { ctx, W, H } = f;
  const r = Math.max(W, H) * size * (0.6 + 0.4 * easeOutExpo(Math.min(1, hitTime(f) / 0.5)));
  const g = ctx.createRadialGradient(W * at.x, H * at.y, 0, W * at.x, H * at.y, r);
  g.addColorStop(0, withAlpha(color, 0.55 * k));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** An expanding ring. */
function shockRing(f: LookFrame, k: number, color: string, at = { x: 0.5, y: 0.5 }, width = 0.012): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const p = easeOutExpo(Math.min(1, hitTime(f) / 0.9));
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.8 * k);
  ctx.lineWidth = Math.max(1, s * width * (1 - p * 0.7));
  ctx.beginPath();
  ctx.arc(W * at.x, H * at.y, s * (0.1 + p * 0.9), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A horizontal anamorphic flare streak with a hot center. */
function flareStreak(f: LookFrame, k: number, color: string, y = 0.45): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const cy = H * y;
  const g = ctx.createLinearGradient(0, cy, W, cy);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(0.5, withAlpha(color, 0.85 * k));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, cy - s * 0.006, W, s * 0.012);
  ctx.fillStyle = withAlpha(color, 0.25 * k);
  ctx.fillRect(0, cy - s * 0.03, W, s * 0.06);
  ctx.restore();
}

/** Horizontal slices of the frame pushed sideways (a picture tearing). */
function tear(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const canvas = (ctx as CanvasRenderingContext2D).canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
  if (!canvas || typeof canvas.width !== "number" || f.style.noVibration) return;
  const sx = canvas.width / W;
  const sy = canvas.height / H;
  const whole = snapshotBand(ctx, 0, canvas.height);
  if (!whole) return;
  const tick = Math.floor(f.timeSec * 20);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 6; i++) {
    if (hash01(tick, 600 + i) > 0.7) continue;
    const y = hash01(tick, 610 + i) * H;
    const h = H * (0.02 + hash01(tick, 620 + i) * 0.08);
    const dx = (hash01(tick, 630 + i) - 0.5) * W * 0.12 * k;
    ctx.drawImage(whole.canvas, 0, y * sy, canvas.width, h * sy, dx * sx, y * sy, canvas.width, h * sy);
  }
  ctx.restore();
}

/** A broad ink stroke slashed across the frame. */
function brushSlash(f: LookFrame, k: number, color: string): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const p = easeOutExpo(Math.min(1, hitTime(f) / 0.25));
  const seed = f.line?.index ?? 0;
  const y0 = H * (0.25 + hash01(seed, 640) * 0.15);
  const y1 = H * (0.6 + hash01(seed, 641) * 0.15);
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.4);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = s * (0.006 + hash01(seed * 7 + i, 642) * 0.02);
    const off = (i - 3) * s * 0.012;
    ctx.beginPath();
    ctx.moveTo(-W * 0.05, y1 + off);
    ctx.lineTo(-W * 0.05 + W * 1.1 * p * (0.85 + hash01(seed * 7 + i, 643) * 0.15), y1 + off + (y0 - y1) * p);
    ctx.stroke();
  }
  ctx.restore();
}

/** Focus lines rushing toward the middle (manga). */
function focusLines(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const tick = Math.floor(f.timeSec * 12);
  const len = Math.hypot(W, H) / 2;
  ctx.save();
  ctx.fillStyle = withAlpha("#111111", 0.8 * k);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + hash01(tick, 650 + i) * 0.05;
    const inner = len * (0.45 + hash01(tick * 3 + i, 651) * 0.25);
    const half = 0.004 + hash01(i, 652) * 0.01;
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(a) * inner, H / 2 + Math.sin(a) * inner);
    ctx.lineTo(W / 2 + Math.cos(a - half) * len * 1.5, H / 2 + Math.sin(a - half) * len * 1.5);
    ctx.lineTo(W / 2 + Math.cos(a + half) * len * 1.5, H / 2 + Math.sin(a + half) * len * 1.5);
    ctx.closePath();
    ctx.fill();
  }
  void s;
  ctx.restore();
}

/** The frame closing in to a circle and opening again (old film iris). */
function iris(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const r = Math.hypot(W, H) * (0.5 - 0.22 * k);
  ctx.save();
  ctx.fillStyle = "rgba(20,12,4,0.92)";
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.restore();
}

/** A rush of rising bubbles from below. */
function bubbleRush(f: LookFrame, k: number, color: string): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const t = hitTime(f);
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.8 * k);
  ctx.lineWidth = Math.max(1, s * 0.002);
  for (let i = 0; i < 40; i++) {
    const speed = 0.5 + hash01(i, 660) * 0.8;
    const y = H * (1.05 - t * speed);
    const x = W * hash01(i, 661) + Math.sin(t * 6 + i) * s * 0.01;
    ctx.beginPath();
    ctx.arc(x, y, s * (0.005 + hash01(i, 662) * 0.015), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

type Hit = (f: LookFrame, k: number) => void;

const HITS: Record<ThemedPresetId, Hit> = {
  album_jacket: (f, k) => {
    bloom(f, k, f.style.secondaryColor, { x: 0.3, y: 0.5 }, 0.6);
    shockRing(f, k, "#ffffff", { x: 0.3, y: 0.5 }, 0.006);
  },
  pop_cutout: (f, k) => {
    sunburst(f, k * 0.6, "#ffffff");
    drawConfetti(f, k, [f.style.accentColor, f.style.secondaryColor, "#5ad1ff", "#7bd88f"]);
  },
  tint_panels: (f, k) => {
    bloom(f, k, f.style.secondaryColor);
    shockRing(f, k, f.style.secondaryColor);
  },
  ballad_hud: (f, k) => bloom(f, k * 0.8, "#ffffff", { x: 0.5, y: 0.35 }, 1),
  cinematic_fantasy: (f, k) => {
    bloom(f, k, f.style.accentColor, { x: 0.5, y: 0.42 }, 0.7);
    flareStreak(f, k, "#ffe2a8", 0.42);
  },
  digital_crt: (f, k) => {
    shockRing(f, k, f.style.secondaryColor, { x: 0.5, y: 0.5 }, 0.004);
    shockRing(f, k * 0.7, f.style.accentColor, { x: 0.5, y: 0.5 }, 0.01);
    tear(f, k * 0.6);
  },
  dark_glitch: (f, k) => {
    tear(f, k);
    flareStreak(f, k * 0.6, f.style.secondaryColor, 0.5);
  },
  summer_film: (f, k) => {
    bloom(f, k, "#fff3b0", { x: 0.85, y: 0.1 }, 0.9);
    flareStreak(f, k * 0.5, "#ffffff", 0.2);
  },
  flat_type: (f, k) => sunburst(f, k, f.style.accentColor, { x: 0.5, y: 0.5 }, 18),
  eclipse_nebula: (f, k) => {
    shockRing(f, k, f.style.secondaryColor, { x: 0.5, y: 0.45 });
    bloom(f, k * 0.6, f.style.accentColor, { x: 0.5, y: 0.45 }, 0.6);
  },
  mono_accent: (f, k) => sunburst(f, k * 0.8, f.style.accentColor, { x: 0.15, y: 0.85 }, 14),
  vintage_paper: (f, k) => iris(f, k),
  pastel_dream: (f, k) => {
    bloom(f, k * 0.7, "#ffffff");
    drawParticles(f, "heart", k * 2, f.style.accentColor, 1);
  },
  crimson_ink: (f, k) => brushSlash(f, k, "#140303"),
  sakura_breeze: (f, k) => drawParticles(f, "petal", k * 1.6, f.style.secondaryColor, 1),
  snow_night: (f, k) => {
    bloom(f, k * 0.6, "#bcd4ff", { x: 0.2, y: 0.15 }, 0.9);
    drawParticles(f, "snow", k * 1.5, "#ffffff", 1);
  },
  rain_window: (f, k) => {
    bloom(f, k * 0.5, "#dfe9ff", { x: 0.5, y: 0 }, 1.2);
    drawLightning(f, Math.min(1, k * 2));
  },
  manga_panel: (f, k) => focusLines(f, k),
  deep_sea: (f, k) => {
    bubbleRush(f, k, "#cfefff");
    bloom(f, k * 0.5, f.style.secondaryColor, { x: 0.5, y: 0 }, 0.9);
  },
  neon_sign: (f, k) => {
    bloom(f, k * 0.6, f.style.accentColor);
    shockRing(f, k, f.style.secondaryColor, { x: 0.5, y: 0.5 }, 0.008);
  },
};

/** The theme's accent hit, scaled by its "climax" element. */
export function drawClimax(f: LookFrame): void {
  const a = amt(f, "climax");
  if (a <= 0) return;
  const k = climaxHit(f) * a;
  if (k <= 0.01) return;
  HITS[f.preset](f, k);
}
