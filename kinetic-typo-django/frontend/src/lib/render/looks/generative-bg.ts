import type { BgPattern } from "@/types/project";
import { amt, minSide, type LookFrame } from "./frame";
import { hash01, withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Generated background patterns: flat vector shapes laid over the picture in
// the theme's colors (stacked waves, soft blobs, layered peaks, stepped
// layers, low-poly tiles, scattered circles, contour lines, a blurry
// gradient). They drift slowly so the frame never sits still, and each is
// built from a seed so preview and export draw the same shapes.

export const BG_PATTERNS = [
  "waves",
  "blobs",
  "peaks",
  "steps",
  "lowpoly",
  "scatter",
  "topo",
  "blur",
] as const satisfies readonly Exclude<BgPattern, "auto">[];

export const BG_PATTERN_LABELS: Record<BgPattern, string> = {
  auto: "테마 기본",
  waves: "겹친 물결",
  blobs: "둥근 덩어리",
  peaks: "겹친 봉우리",
  steps: "계단 층",
  lowpoly: "로우 폴리",
  scatter: "흩뿌린 원",
  topo: "등고선",
  blur: "흐린 그라데이션",
};

/** The pattern each theme uses when the style leaves it on "auto". */
const THEME_PATTERN: Record<ThemedPresetId, Exclude<BgPattern, "auto">> = {
  album_jacket: "blur",
  pop_cutout: "blobs",
  tint_panels: "steps",
  ballad_hud: "topo",
  cinematic_fantasy: "peaks",
  digital_crt: "lowpoly",
  dark_glitch: "lowpoly",
  summer_film: "waves",
  flat_type: "steps",
  eclipse_nebula: "scatter",
  mono_accent: "steps",
  vintage_paper: "topo",
  pastel_dream: "blobs",
  crimson_ink: "peaks",
  sakura_breeze: "scatter",
  snow_night: "peaks",
  rain_window: "blur",
  manga_panel: "scatter",
  deep_sea: "waves",
  neon_sign: "topo",
};

export function patternFor(f: LookFrame): Exclude<BgPattern, "auto"> {
  const own = f.style.bgPattern;
  return own && own !== "auto" ? own : THEME_PATTERN[f.preset];
}

/** Colors from the theme for n layers, from the far one to the near one. */
function layerColors(f: LookFrame, n: number): string[] {
  const { accentColor, secondaryColor, bgColor } = f.style;
  const base = [secondaryColor, accentColor, bgColor];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

/** Time for slow drifting, frozen with "no vibration". */
const drift = (f: LookFrame) => (f.style.noVibration ? 0 : f.timeSec);

function waves(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const t = drift(f);
  const n = 4;
  const colors = layerColors(f, n);
  for (let l = 0; l < n; l++) {
    const base = H * (0.66 + l * 0.08);
    const amp = H * (0.035 - l * 0.004);
    const freq = 1.5 + hash01(l, 1301) * 1.5;
    const phase = hash01(l, 1302) * 6 + t * (0.25 + l * 0.08);
    ctx.fillStyle = withAlpha(colors[l], (0.28 + l * 0.12) * k);
    ctx.beginPath();
    ctx.moveTo(0, H);
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const x = (W * i) / steps;
      const u = i / steps;
      const y =
        base +
        Math.sin(u * Math.PI * 2 * freq + phase) * amp +
        Math.sin(u * Math.PI * 2 * freq * 2.3 + phase * 1.3) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

/** A closed blob through n points around a circle, each pushed in or out and breathing. */
function blobPath(f: LookFrame, cx: number, cy: number, r: number, seed: number): void {
  const { ctx } = f;
  const t = drift(f);
  const n = 7;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + hash01(seed, i) * 0.4 + Math.sin(t * 0.6 + i * 1.7 + seed) * 0.06);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // Smooth closed curve through the midpoints
  ctx.beginPath();
  const mid = (i: number): [number, number] => {
    const p = pts[i % n];
    const q = pts[(i + 1) % n];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  const m0 = mid(0);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n];
    const m = mid(i);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

function blobs(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const colors = layerColors(f, 3);
  // Two corners, each with a large and a smaller blob
  const corners: [number, number][] = [
    [0, 0],
    [W, H],
  ];
  corners.forEach(([cx, cy], c) => {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = withAlpha(colors[(c + j) % 3], (0.35 - j * 0.1) * k);
      blobPath(f, cx, cy, s * (0.42 - j * 0.14), 1310 + c * 3 + j);
      ctx.fill();
    }
  });
}

function peaks(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const n = 4;
  const colors = layerColors(f, n);
  const t = drift(f);
  for (let l = 0; l < n; l++) {
    const base = H * (0.62 + l * 0.09);
    const count = 5 + l * 2;
    const slide = ((t * (4 + l * 3)) % (W / count)) * (l % 2 ? 1 : -1);
    ctx.fillStyle = withAlpha(colors[l], (0.18 + l * 0.1) * k);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = -1; i <= count + 1; i++) {
      const x = (W * i) / count + slide;
      const top = base - H * (0.04 + hash01(l, i + 1320) * 0.12);
      const low = base + H * (0.01 + hash01(l, i + 1321) * 0.03);
      const lean = (hash01(l, i + 1322) - 0.5) * (W / count) * 0.5;
      ctx.lineTo(x, low);
      ctx.lineTo(x + W / count / 2 + lean, top);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

function steps(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const n = 4;
  const colors = layerColors(f, n);
  const t = drift(f);
  for (let l = 0; l < n; l++) {
    const cols = 6 + l * 2;
    const cw = W / cols;
    ctx.fillStyle = withAlpha(colors[l], (0.3 + l * 0.12) * k);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < cols; i++) {
      const lift = Math.sin(t * 0.5 + i * 0.9 + l) * H * 0.008;
      const y = H * (0.68 + l * 0.075) - hash01(l, i + 1330) * H * 0.08 + lift;
      ctx.lineTo(i * cw, y);
      ctx.lineTo((i + 1) * cw, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

function lowpoly(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const t = drift(f);
  const cols = 12;
  const rows = 7;
  const cw = W / cols;
  const rh = H / rows;
  const colors = layerColors(f, 3);
  // A jittered grid; each cell split into two triangles of slightly different shade
  const pt = (i: number, j: number): [number, number] => {
    const edgeX = i === 0 || i === cols;
    const edgeY = j === 0 || j === rows;
    const jx = edgeX ? 0 : (hash01(i, j + 1340) - 0.5) * cw * 0.7;
    const jy = edgeY ? 0 : (hash01(i, j + 1341) - 0.5) * rh * 0.7 + Math.sin(t * 0.4 + i + j) * rh * 0.04;
    return [i * cw + jx, j * rh + jy];
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = pt(i, j);
      const b = pt(i + 1, j);
      const c = pt(i + 1, j + 1);
      const d = pt(i, j + 1);
      // Brighter toward the bottom so the lyrics in the middle stay clear
      const fall = 0.25 + (j / rows) * 0.75;
      for (const [tri, tone] of [
        [[a, b, c], hash01(i, j + 1342)],
        [[a, c, d], hash01(i, j + 1343)],
      ] as const) {
        ctx.fillStyle = withAlpha(colors[Math.floor(tone * 3) % 3], (0.04 + tone * 0.14) * fall * k);
        ctx.beginPath();
        ctx.moveTo(tri[0][0], tri[0][1]);
        ctx.lineTo(tri[1][0], tri[1][1]);
        ctx.lineTo(tri[2][0], tri[2][1]);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function scatter(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const t = drift(f);
  const colors = layerColors(f, 3);
  for (let i = 0; i < 26; i++) {
    const x = W * hash01(i, 1350);
    const y = H * hash01(i, 1351);
    // Keep the middle band, where the lyrics sit, mostly clear
    const mid = Math.abs(y / H - 0.5) < 0.18 && Math.abs(x / W - 0.5) < 0.3;
    if (mid) continue;
    const r = s * (0.01 + hash01(i, 1352) ** 2 * 0.07) * (1 + Math.sin(t * 0.8 + i) * 0.08);
    const ring = hash01(i, 1353) < 0.35;
    const color = withAlpha(colors[i % 3], (0.25 + hash01(i, 1354) * 0.35) * k);
    ctx.beginPath();
    ctx.arc(x, y + Math.sin(t * 0.3 + i) * s * 0.01, r, 0, Math.PI * 2);
    if (ring) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

function topo(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const t = drift(f);
  const colors = layerColors(f, 2);
  ctx.lineWidth = Math.max(1, s * 0.0025);
  // Two hills of nested wobbly rings, off to the sides
  const hills: [number, number, number][] = [
    [W * 0.12, H * 0.82, 1360],
    [W * 0.9, H * 0.15, 1370],
  ];
  hills.forEach(([cx, cy, seed], h) => {
    ctx.strokeStyle = withAlpha(colors[h], 0.5 * k);
    for (let ring = 1; ring <= 9; ring++) {
      const r = s * 0.06 * ring;
      ctx.beginPath();
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wob =
          1 +
          Math.sin(a * 3 + hash01(seed, ring) * 6 + t * 0.15) * 0.08 +
          Math.sin(a * 5 + seed + ring) * 0.04;
        const x = cx + Math.cos(a) * r * wob * 1.3;
        const y = cy + Math.sin(a) * r * wob;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function blur(f: LookFrame, k: number): void {
  const { ctx, W, H } = f;
  const t = drift(f);
  const colors = layerColors(f, 3);
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  for (let i = 0; i < 4; i++) {
    const cx = W * (0.15 + hash01(i, 1380) * 0.7) + Math.sin(t * 0.2 + i * 2) * W * 0.08;
    const cy = H * (0.15 + hash01(i, 1381) * 0.7) + Math.cos(t * 0.17 + i) * H * 0.08;
    const r = Math.max(W, H) * (0.35 + hash01(i, 1382) * 0.25);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(colors[i % 3], 0.9 * k));
    g.addColorStop(1, withAlpha(colors[i % 3], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

const PAINT: Record<Exclude<BgPattern, "auto">, (f: LookFrame, k: number) => void> = {
  waves,
  blobs,
  peaks,
  steps,
  lowpoly,
  scatter,
  topo,
  blur,
};

/** The generated pattern over the picture, when the theme's "pattern" element is on. */
export function drawBgPattern(f: LookFrame): void {
  if (f.mixed) return;
  const a = amt(f, "pattern");
  if (a <= 0) return;
  const { ctx } = f;
  ctx.save();
  PAINT[patternFor(f)](f, Math.min(1.2, 0.3 + a));
  ctx.restore();
}

/** A saved pattern choice, or "auto" when it is missing or unknown. */
export function sanitizeBgPattern(v: unknown): BgPattern {
  return typeof v === "string" && (BG_PATTERNS as readonly string[]).includes(v) ? (v as BgPattern) : "auto";
}
