import { amt, minSide, type LookFrame } from "./frame";
import type { Rect } from "./illustration";
import { hash01, withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Built-in scenery: when no background picture is loaded, a theme paints a
// simple landscape of its own (ink mountains, a snowy village, a rainy city,
// a seabed …) over its fallback gradient, so a first video already has a
// place to happen in. Everything is drawn from fixed hashes; only a slow pan
// and a few swaying parts move.

/** A rolling ridge line filled to the bottom of r. */
function ridge(
  f: LookFrame,
  r: Rect,
  base: number,
  amp: number,
  waves: number,
  color: string,
  seed: number,
  pan = 0,
): void {
  const { ctx } = f;
  const step = Math.max(4, r.w / 120);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + r.h);
  for (let x = 0; x <= r.w + step; x += step) {
    const u = x / r.w + pan;
    const y =
      base +
      Math.sin(u * Math.PI * waves + seed) * amp * 0.6 +
      Math.sin(u * Math.PI * waves * 2.3 + seed * 3) * amp * 0.3 +
      Math.sin(u * Math.PI * waves * 5.1 + seed * 7) * amp * 0.1;
    ctx.lineTo(r.x + x, r.y + r.h * y);
  }
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.closePath();
  ctx.fill();
}

/** Building silhouettes along a ground line, with some windows lit. */
function skyline(
  f: LookFrame,
  r: Rect,
  ground: number,
  height: number,
  color: string,
  windows: string | null,
  seed: number,
): void {
  const { ctx } = f;
  const s = minSide(f);
  let x = r.x - s * 0.02;
  let i = 0;
  while (x < r.x + r.w) {
    const w = s * (0.05 + hash01(i, seed) * 0.08);
    const h = r.h * height * (0.35 + hash01(i, seed + 1) * 0.65);
    const top = r.y + r.h * ground - h;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, w + 1, h + r.h);
    if (windows) {
      const cell = s * 0.012;
      for (let wy = top + cell; wy < r.y + r.h * ground - cell; wy += cell * 2.2)
        for (let wx = x + cell * 0.8; wx < x + w - cell; wx += cell * 1.9) {
          const k = Math.floor(wx * 7 + wy * 13);
          if (hash01(k, seed + 2) > 0.35) continue;
          ctx.fillStyle = withAlpha(windows, 0.5 + hash01(k, seed + 3) * 0.5);
          ctx.fillRect(wx, wy, cell, cell * 1.2);
        }
    }
    x += w + s * 0.004;
    i++;
  }
}

/** A cone-shaped pine with a snowy edge. */
function pine(f: LookFrame, x: number, ground: number, h: number, color: string, snow: string | null): void {
  const { ctx } = f;
  for (let t = 0; t < 3; t++) {
    const top = ground - h + t * h * 0.25;
    const half = h * (0.18 + t * 0.08);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, top + h * 0.38);
    ctx.lineTo(x - half, top + h * 0.38);
    ctx.closePath();
    ctx.fill();
    if (snow) {
      ctx.fillStyle = snow;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + half * 0.45, top + h * 0.15);
      ctx.lineTo(x - half * 0.45, top + h * 0.15);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = color;
  ctx.fillRect(x - h * 0.03, ground - h * 0.12, h * 0.06, h * 0.12);
}

/** A small house with a lit window. */
function house(
  f: LookFrame,
  x: number,
  ground: number,
  w: number,
  color: string,
  light: string,
  roof: string,
): void {
  const { ctx } = f;
  const h = w * 0.7;
  ctx.fillStyle = color;
  ctx.fillRect(x, ground - h, w, h);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.12, ground - h);
  ctx.lineTo(x + w / 2, ground - h - w * 0.45);
  ctx.lineTo(x + w * 1.12, ground - h);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createRadialGradient(x + w * 0.5, ground - h * 0.5, 0, x + w * 0.5, ground - h * 0.5, w);
  g.addColorStop(0, withAlpha(light, 0.35));
  g.addColorStop(1, withAlpha(light, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - w * 0.5, ground - h * 1.5, w * 2, h * 2);
  ctx.fillStyle = light;
  ctx.fillRect(x + w * 0.38, ground - h * 0.65, w * 0.24, h * 0.28);
}

/** A cherry tree: a trunk with a round pink crown. */
function blossomTree(
  f: LookFrame,
  x: number,
  ground: number,
  h: number,
  trunk: string,
  crown: string,
  seed: number,
): void {
  const { ctx } = f;
  ctx.fillStyle = trunk;
  ctx.fillRect(x - h * 0.03, ground - h * 0.5, h * 0.06, h * 0.5);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    const d = h * 0.18 * hash01(i, seed);
    ctx.fillStyle = withAlpha(crown, 0.75 + hash01(i, seed + 1) * 0.25);
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(a) * d,
      ground - h * 0.62 + Math.sin(a) * d * 0.6,
      h * (0.16 + hash01(i, seed + 2) * 0.08),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Soft vertical gradient band (mist) at y. */
function mist(f: LookFrame, r: Rect, y: number, color: string, alpha: number): void {
  const { ctx } = f;
  const g = ctx.createLinearGradient(0, r.y + r.h * (y - 0.12), 0, r.y + r.h * (y + 0.12));
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(0.5, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y + r.h * (y - 0.12), r.w, r.h * 0.24);
}

type Painter = (f: LookFrame, r: Rect) => void;

const layers = new Map<string, HTMLCanvasElement>();

/**
 * A still part of the scenery painted once into its own canvas (through
 * `filter`), then reused every frame; null where there is no DOM.
 */
function cachedLayer(
  key: string,
  r: Rect,
  paint: (ctx: CanvasRenderingContext2D) => void,
  filter = "",
): HTMLCanvasElement | null {
  const hit = layers.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));
  const raw = document.createElement("canvas");
  raw.width = w;
  raw.height = h;
  const rc = raw.getContext("2d");
  if (!rc) return null;
  paint(rc);
  let out = raw;
  if (filter) {
    out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const oc = out.getContext("2d");
    if (!oc) return null;
    oc.filter = filter;
    oc.drawImage(raw, 0, 0);
  }
  // A handful of sizes at most (preview and export); drop old ones
  if (layers.size > 6) layers.clear();
  layers.set(key, out);
  return out;
}

const pan = (f: LookFrame, speed: number) => f.timeSec * speed;

const SCENERY: Partial<Record<ThemedPresetId, Painter>> = {
  pop_cutout: (f, r) => {
    // Cut-paper hills with drop shadows under a flat sun
    const { ctx, style } = f;
    const s = minSide(f);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.78, r.y + r.h * 0.28, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    const layers: [number, string, number][] = [
      [0.66, withAlpha(style.secondaryColor, 0.9), 17],
      [0.76, "#7bd88f", 18],
      [0.86, "#5ad1ff", 19],
    ];
    for (const [base, color, seed] of layers) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowOffsetY = s * 0.012;
      ridge(f, r, base, 0.07, 1.6, color, seed, pan(f, 0.003));
      ctx.restore();
    }
  },
  dark_glitch: (f, r) => skyline(f, r, 0.98, 0.45, "#0b0b0e", "#d8d8e8", 800),
  digital_crt: (f, r) => {
    // A retro sunset: striped sun over a scrolling perspective grid
    const { ctx, style } = f;
    const horizon = r.y + r.h * 0.62;
    const sunR = r.h * 0.28;
    const cx = r.x + r.w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, horizon - sunR * 0.25, sunR, Math.PI, 0);
    ctx.lineTo(cx + sunR, horizon);
    ctx.lineTo(cx - sunR, horizon);
    ctx.closePath();
    ctx.clip();
    const sun = ctx.createLinearGradient(0, horizon - sunR * 1.25, 0, horizon);
    sun.addColorStop(0, "#ffe66d");
    sun.addColorStop(1, style.accentColor);
    ctx.fillStyle = sun;
    ctx.fillRect(cx - sunR, horizon - sunR * 1.3, sunR * 2, sunR * 1.3);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (let i = 0; i < 6; i++) {
      const y = horizon - sunR * 0.15 - i * sunR * 0.16;
      ctx.fillRect(cx - sunR, y, sunR * 2, sunR * 0.03 * (6 - i) * 0.5 + 1);
    }
    ctx.restore();
    ctx.fillStyle = "rgba(10,2,20,0.85)";
    ctx.fillRect(r.x, horizon, r.w, r.y + r.h - horizon);
    ctx.strokeStyle = withAlpha(style.secondaryColor, 0.8);
    ctx.lineWidth = 1;
    const vanish = { x: cx, y: horizon };
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(vanish.x + i * r.w * 0.01, horizon);
      ctx.lineTo(vanish.x + i * r.w * 0.12, r.y + r.h);
      ctx.stroke();
    }
    const scroll = (f.timeSec * 0.5) % 1;
    for (let i = 0; i < 10; i++) {
      const d = (i + scroll) / 10;
      const y = horizon + (r.y + r.h - horizon) * d * d;
      ctx.beginPath();
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + r.w, y);
      ctx.stroke();
    }
  },
  crimson_ink: (f, r) => {
    // Ink-wash mountains fading into red mist
    ridge(f, r, 0.55, 0.16, 2.2, "rgba(60,10,10,0.55)", 1, pan(f, 0.002));
    mist(f, r, 0.62, "#ff7a5a", 0.18);
    ridge(f, r, 0.68, 0.12, 3.1, "rgba(30,4,4,0.75)", 2, pan(f, 0.004));
    mist(f, r, 0.75, "#ff9a7a", 0.12);
    ridge(f, r, 0.82, 0.08, 4.3, "rgba(12,2,2,0.95)", 3, pan(f, 0.007));
  },
  deep_sea: (f, r) => {
    const { ctx } = f;
    const s = minSide(f);
    ridge(f, r, 0.84, 0.06, 3, "#031426", 4);
    // Swaying kelp
    ctx.strokeStyle = "rgba(20,90,80,0.8)";
    ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const x = r.x + r.w * hash01(i, 700);
      const h = r.h * (0.15 + hash01(i, 701) * 0.25);
      const base = r.y + r.h * (0.86 + hash01(i, 702) * 0.1);
      ctx.lineWidth = s * (0.006 + hash01(i, 703) * 0.006);
      ctx.beginPath();
      ctx.moveTo(x, base);
      for (let q = 1; q <= 10; q++) {
        const sway = f.style.noVibration ? 0 : Math.sin(f.timeSec * 0.8 + i + q * 0.5) * s * 0.012 * (q / 10);
        ctx.lineTo(x + sway, base - (h * q) / 10);
      }
      ctx.stroke();
    }
    ridge(f, r, 0.93, 0.04, 5, "#010910", 5);
  },
  manga_panel: (f, r) => {
    skyline(f, r, 0.9, 0.42, "#bdb8ae", null, 710);
    skyline(f, r, 0.95, 0.3, "#8f8a80", null, 720);
  },
  mono_accent: (f, r) => {
    skyline(f, r, 0.88, 0.5, "#1c1c1c", "#3a3a3a", 730);
    skyline(f, r, 0.95, 0.32, "#0a0a0a", "#555555", 740);
  },
  pastel_dream: (f, r) => {
    const { ctx } = f;
    const cx = r.x + r.w * 0.5;
    const cy = r.y + r.h * 0.95;
    const rad = Math.max(r.w, r.h) * 0.55;
    const bands = ["#ffb3c7", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#bdb2ff"];
    ctx.lineWidth = rad * 0.035;
    bands.forEach((c, i) => {
      ctx.strokeStyle = withAlpha(c, 0.45);
      ctx.beginPath();
      ctx.arc(cx, cy, rad - i * ctx.lineWidth, Math.PI, 0);
      ctx.stroke();
    });
    ridge(f, r, 0.8, 0.06, 1.6, "rgba(255,255,255,0.65)", 6);
    ridge(f, r, 0.88, 0.05, 2.4, withAlpha(f.style.secondaryColor, 0.8), 7);
  },
  rain_window: (f, r) => {
    const { ctx } = f;
    // The blurred city is still, so it is drawn once and reused
    const city = cachedLayer(
      `rain:${Math.round(r.w)}x${Math.round(r.h)}`,
      r,
      (c) => skyline({ ...f, ctx: c }, { x: 0, y: 0, w: r.w, h: r.h }, 0.92, 0.55, "#121a24", "#ffcf8a", 750),
      "blur(3px)",
    );
    if (city) ctx.drawImage(city, r.x, r.y, r.w, r.h);
    else skyline(f, r, 0.92, 0.55, "#121a24", "#ffcf8a", 750);
    // Window frame and mullion in front
    const s = minSide(f);
    ctx.fillStyle = "#06090d";
    ctx.fillRect(r.x, r.y + r.h * 0.93, r.w, r.h * 0.07);
    ctx.fillRect(r.x + r.w * 0.5 - s * 0.008, r.y, s * 0.016, r.h);
    ctx.fillRect(r.x, r.y + r.h * 0.48, r.w, s * 0.012);
  },
  sakura_breeze: (f, r) => {
    ridge(f, r, 0.72, 0.06, 1.4, "#f8cfd9", 8, pan(f, 0.002));
    for (let i = 0; i < 6; i++) {
      const x = r.x + r.w * (0.05 + i * 0.18 + hash01(i, 760) * 0.06);
      blossomTree(
        f,
        x,
        r.y + r.h * (0.76 + hash01(i, 761) * 0.04),
        r.h * (0.22 + hash01(i, 762) * 0.1),
        "#8a5a5a",
        "#ffb7c9",
        i,
      );
    }
    ridge(f, r, 0.86, 0.04, 2.2, "#f3a9bd", 9);
  },
  snow_night: (f, r) => {
    const s = minSide(f);
    ridge(f, r, 0.68, 0.08, 1.8, "#1b2a4a", 10);
    ridge(f, r, 0.8, 0.05, 2.6, "#d9e4f5", 11);
    for (let i = 0; i < 9; i++) {
      const x = r.x + r.w * hash01(i, 770);
      pine(
        f,
        x,
        r.y + r.h * (0.8 + hash01(i, 771) * 0.06),
        r.h * (0.12 + hash01(i, 772) * 0.1),
        "#0e1a30",
        "#e6eefb",
      );
    }
    house(f, r.x + r.w * 0.68, r.y + r.h * 0.86, s * 0.12, "#22304e", "#ffd38a", "#e6eefb");
    house(f, r.x + r.w * 0.2, r.y + r.h * 0.88, s * 0.09, "#1d2944", "#ffcf80", "#e6eefb");
    ridge(f, r, 0.9, 0.03, 3, "#eef4ff", 12);
  },
  vintage_paper: (f, r) => {
    const ink = "rgba(91,70,48,0.55)";
    ridge(f, r, 0.7, 0.07, 1.5, "rgba(140,110,70,0.35)", 13);
    skyline(f, r, 0.85, 0.28, ink, null, 780);
    const { ctx } = f;
    // A windmill on the hill
    const x = r.x + r.w * 0.78;
    const y = r.y + r.h * 0.62;
    const s = minSide(f);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.03, y + s * 0.16);
    ctx.lineTo(x - s * 0.015, y);
    ctx.lineTo(x + s * 0.015, y);
    ctx.lineTo(x + s * 0.03, y + s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2, s * 0.008);
    const turn = f.timeSec * 0.6;
    for (let i = 0; i < 4; i++) {
      const a = turn + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * s * 0.09, y + Math.sin(a) * s * 0.09);
      ctx.stroke();
    }
    ridge(f, r, 0.9, 0.03, 2, "rgba(91,70,48,0.6)", 14);
  },
  neon_sign: (f, r) => skyline(f, r, 0.97, 0.25, "rgba(10,6,14,0.85)", "#ff8ad8", 790),
  ballad_hud: (f, r) => {
    mist(f, r, 0.55, "#ffffff", 0.35);
    ridge(f, r, 0.72, 0.06, 1.3, "rgba(200,180,230,0.55)", 15, pan(f, 0.002));
    ridge(f, r, 0.84, 0.05, 2.1, "rgba(170,150,210,0.6)", 16, pan(f, 0.004));
  },
};

/** Paints the theme's built-in scenery into r when its "scenery" element is on. */
export function drawScenery(f: LookFrame, r: Rect): void {
  const paint = SCENERY[f.preset];
  if (!paint) return;
  const a = amt(f, "scenery");
  if (a <= 0) return;
  f.ctx.save();
  f.ctx.globalAlpha *= Math.min(1, 0.3 + a);
  paint(f, r);
  f.ctx.restore();
}

export const SCENERY_THEMES = Object.keys(SCENERY) as ThemedPresetId[];
