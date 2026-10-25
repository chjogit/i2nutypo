import { easeOutExpo } from "../easing";
import { minSide, type LookFrame } from "./frame";
import { hash01, hashSigned, withAlpha } from "./noise";

// Extra scene pieces the themes share for a richer picture: light shafts, fog,
// shooting stars, fireflies, aurora, ripples, confetti, beat bursts, a giant
// word behind the lyrics, a scrolling lyric band and more. Everything is drawn
// from hashes and the clock, so a frame looks the same in preview and export,
// and every piece draws nothing at amount 0.

/** 1 at the start of the current line, fading out over `sec`. */
export function lineKick(f: LookFrame, sec = 0.6): number {
  if (!f.line || f.lineElapsed < 0) return 0;
  return Math.max(0, 1 - f.lineElapsed / sec);
}

/** Which line the song is on (for things that change per line); -1 before the first. */
const lineSeed = (f: LookFrame): number => f.hop?.index ?? f.line?.index ?? -1;

/** Wobble the theme can do without; off when the user turned all vibration off. */
const jitter = (f: LookFrame, v: number): number => (f.style.noVibration ? 0 : v);

/** Slowly turning shafts of light from a point (sun, moon, a window above). */
export function drawGodRays(
  f: LookFrame,
  amount: number,
  color: string,
  origin: { x: number; y: number } = { x: 0.75, y: -0.1 },
  count = 7,
  dir = Math.PI * 0.5,
  spread = 1.3,
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const ox = origin.x * W;
  const oy = origin.y * H;
  const len = Math.hypot(W, H) * 1.3;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i++) {
    const base = dir + (i / (count - 1) - 0.5) * spread + Math.sin(f.timeSec * 0.11 + i) * 0.06;
    const half = 0.025 + hash01(i, 31) * 0.05;
    const a =
      (0.12 + 0.14 * (0.5 + 0.5 * Math.sin(f.timeSec * (0.3 + hash01(i, 32) * 0.5) + i * 2))) * amount;
    const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(base) * len, oy + Math.sin(base) * len);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(base - half) * len, oy + Math.sin(base - half) * len);
    ctx.lineTo(ox + Math.cos(base + half) * len, oy + Math.sin(base + half) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Soft fog banks drifting sideways at a few depths, thicker toward `low` (0 top .. 1 bottom). */
export function drawFog(f: LookFrame, amount: number, color: string, low = 0.75): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const depth = 0.5 + hash01(i, 41) * 0.5;
    const r = Math.max(W, H) * (0.25 + hash01(i, 42) * 0.2);
    const x = ((((hash01(i, 43) + f.timeSec * 0.012 * depth) % 1) + 1) % 1) * (W + r * 2) - r;
    const y = H * (low + hashSigned(i, 44) * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, 0.22 * amount * depth));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.35);
    ctx.translate(-x, -y);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  ctx.restore();
}

/** A few shooting stars a minute, each a bright head with a fading tail. */
export function drawShootingStars(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const period = 2.4 - amount * 1.2;
  ctx.save();
  ctx.lineCap = "round";
  for (let lane = 0; lane < 2; lane++) {
    const slot = Math.floor((f.timeSec + lane * period * 0.5) / period);
    const k = slot * 2 + lane;
    if (hash01(k, 51) > 0.35 + amount * 0.5) continue;
    const p = ((f.timeSec + lane * period * 0.5) % period) / 0.9;
    if (p > 1) continue;
    const x0 = W * (0.2 + hash01(k, 52) * 0.7);
    const y0 = H * (0.02 + hash01(k, 53) * 0.3);
    const ang = Math.PI * (0.78 + hash01(k, 54) * 0.12);
    const dist = s * (0.4 + hash01(k, 55) * 0.4);
    const e = easeOutExpo(p);
    const hx = x0 + Math.cos(ang) * dist * e;
    const hy = y0 + Math.sin(ang) * dist * e;
    const tail = s * 0.18 * (1 - p * 0.6);
    const a = Math.sin(Math.min(1, p) * Math.PI) * amount;
    const g = ctx.createLinearGradient(hx, hy, hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, s * 0.003);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail);
    ctx.stroke();
    ctx.fillStyle = withAlpha("#ffffff", a);
    ctx.beginPath();
    ctx.arc(hx, hy, s * 0.003, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Glowing motes that wander and blink, like fireflies or floating light. */
export function drawFireflies(
  f: LookFrame,
  amount: number,
  color: string,
  area: [number, number] = [0.3, 1],
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(10 + 26 * amount);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < n; i++) {
    const t = f.timeSec * (0.08 + hash01(i, 61) * 0.08);
    const x = W * (hash01(i, 62) + Math.sin(t * 2.1 + i) * 0.05);
    const y = H * (area[0] + (area[1] - area[0]) * hash01(i, 63)) + Math.cos(t * 1.7 + i * 3) * s * 0.04;
    const blink = Math.max(0, Math.sin(f.timeSec * (0.8 + hash01(i, 64)) + i * 5));
    const r = s * (0.008 + hash01(i, 65) * 0.012);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, withAlpha("#ffffff", 0.9 * blink * amount));
    g.addColorStop(0.25, withAlpha(color, 0.6 * blink * amount));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  ctx.restore();
}

/** Curtains of aurora rippling along the top of the sky. */
export function drawAurora(f: LookFrame, amount: number, colors: [string, string]): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const t = f.timeSec;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let band = 0; band < 3; band++) {
    const c = band % 2 ? colors[1] : colors[0];
    const yBase = H * (0.12 + band * 0.07);
    const depth = H * (0.22 + band * 0.04);
    const step = Math.max(6, W / 48);
    for (let x = 0; x <= W; x += step) {
      const wave =
        Math.sin((x / W) * 5 + t * 0.4 + band) * 0.6 + Math.sin((x / W) * 11 - t * 0.7 + band * 2) * 0.4;
      const top = yBase + wave * H * 0.05;
      const glow = 0.5 + 0.5 * Math.sin((x / W) * 7 + t * 0.9 + band * 3);
      const g = ctx.createLinearGradient(0, top, 0, top + depth);
      g.addColorStop(0, withAlpha(c, 0));
      g.addColorStop(0.15, withAlpha(c, 0.22 * amount * (0.4 + 0.6 * glow)));
      g.addColorStop(1, withAlpha(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, top, step + 1, depth);
    }
  }
  ctx.restore();
}

/** Rings that spread on a surface (water, a puddle) as drops land. */
export function drawRipples(f: LookFrame, amount: number, color: string, top = 0.78): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(4 + 10 * amount);
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.0018);
  for (let i = 0; i < n; i++) {
    const period = 1.6 + hash01(i, 71) * 1.8;
    const phase = (f.timeSec + hash01(i, 72) * period) / period;
    const k = Math.floor(phase) * 97 + i;
    const p = phase % 1;
    const x = W * hash01(k, 73);
    const y = H * (top + (1 - top) * hash01(k, 74));
    const persp = 0.3 + 0.7 * ((y / H - top) / (1 - top));
    for (let ring = 0; ring < 2; ring++) {
      const q = p - ring * 0.18;
      if (q <= 0) continue;
      const rx = s * 0.08 * q * persp;
      ctx.strokeStyle = withAlpha(color, (1 - q) * 0.5 * amount);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Paper confetti tumbling down in the theme's colors. */
export function drawConfetti(f: LookFrame, amount: number, colors: readonly string[]): void {
  if (amount <= 0 || colors.length === 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(50 * amount);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const depth = 0.5 + hash01(i, 81) * 0.5;
    const y = ((((hash01(i, 82) + f.timeSec * 0.07 * depth) % 1) + 1) % 1) * (H * 1.1) - H * 0.05;
    const x = W * hash01(i, 83) + Math.sin(f.timeSec * 1.3 + i) * s * 0.03;
    const w = s * 0.018 * depth;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(f.timeSec * (1 + hash01(i, 84) * 2) + i);
    ctx.scale(1, Math.sin(f.timeSec * 3 + i * 1.7));
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.85;
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-w / 2, -w * 0.3, w, w * 0.6);
    ctx.restore();
  }
  ctx.restore();
}

/** Star-shaped bursts that pop around the frame when each line starts. */
export function drawBursts(f: LookFrame, amount: number, colors: readonly string[]): void {
  if (amount <= 0 || !f.line) return;
  const kick = f.lineElapsed;
  if (kick < 0 || kick > 0.7) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const seed = lineSeed(f);
  const p = kick / 0.7;
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const x = W * (0.08 + hash01(seed, 90 + i) * 0.84);
    const y = H * (0.08 + hash01(seed, 95 + i) * 0.84);
    const r =
      s * (0.04 + hash01(seed, 100 + i) * 0.05) * easeOutExpo(Math.min(1, p * 2.5)) * (0.6 + amount * 0.6);
    ctx.fillStyle = withAlpha(colors[i % colors.length], (1 - p) * 0.9);
    ctx.beginPath();
    const spikes = 8;
    for (let j = 0; j < spikes * 2; j++) {
      const rr = j % 2 ? r * 0.45 : r;
      const a = (j / (spikes * 2)) * Math.PI * 2 + seed;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Rings that spread from a point with the beat and at each line start. */
export function drawPulseRings(f: LookFrame, amount: number, color: string, at = { x: 0.5, y: 0.5 }): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const x = W * at.x;
  const y = H * at.y;
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.003);
  for (let i = 0; i < 3; i++) {
    const p = (f.timeSec * 0.35 + i / 3) % 1;
    ctx.strokeStyle = withAlpha(color, (1 - p) * 0.35 * amount * (0.6 + f.energy * 0.6));
    ctx.beginPath();
    ctx.arc(x, y, s * (0.1 + p * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  }
  const kick = lineKick(f, 0.8);
  if (kick > 0) {
    ctx.lineWidth = Math.max(1, s * 0.006 * kick);
    ctx.strokeStyle = withAlpha(color, 0.6 * kick * amount);
    ctx.beginPath();
    ctx.arc(x, y, s * (0.05 + (1 - kick) * 0.5), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A bright diagonal shine that sweeps across the frame at the start of each line. */
export function drawShine(f: LookFrame, amount: number, color = "#ffffff", sec = 1.1): void {
  if (amount <= 0 || !f.line || f.lineElapsed < 0 || f.lineElapsed > sec) return;
  const { ctx, W, H } = f;
  const p = f.lineElapsed / sec;
  const x = -W * 0.4 + p * W * 1.8;
  const band = W * 0.18;
  const g = ctx.createLinearGradient(x - band, 0, x + band, 0);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(0.5, withAlpha(color, 0.22 * amount * Math.sin(p * Math.PI)));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(W / 2, H / 2);
  ctx.transform(1, 0, -0.35, 1, 0, 0);
  ctx.translate(-W / 2, -H / 2);
  ctx.fillStyle = g;
  ctx.fillRect(x - band, -H, band * 2, H * 3);
  ctx.restore();
}

/** The line's longest word, huge and faint behind everything, drifting slowly. */
export function drawGiantWord(
  f: LookFrame,
  amount: number,
  color: string,
  o: { font?: string; outline?: boolean; vertical?: boolean } = {},
): void {
  const line = f.line;
  if (amount <= 0 || !line) return;
  const word = line.words.reduce((best, w) => (w.text.length > best.length ? w.text : best), "");
  if (!word) return;
  const { ctx, W, H } = f;
  const font = o.font ?? f.style.mainFont;
  const seed = lineSeed(f);
  const appear = Math.min(1, Math.max(0, f.lineElapsed) / 0.6);
  ctx.save();
  ctx.font = `900 ${H}px ${font}`;
  const natural = ctx.measureText(word).width || H;
  const size = Math.min(H * 0.75, (W * 1.25 * H) / natural);
  ctx.font = `900 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const drift = (f.lineElapsed * 0.02 + hashSigned(seed, 111) * 0.1) * W;
  ctx.translate(W / 2 + drift, H * (0.45 + hashSigned(seed, 112) * 0.08));
  if (o.vertical) ctx.rotate(-Math.PI / 2);
  else ctx.rotate(hashSigned(seed, 113) * 0.06);
  ctx.globalAlpha = 0.14 * amount * easeOutExpo(appear);
  if (o.outline) {
    ctx.lineWidth = Math.max(1, size * 0.012);
    ctx.strokeStyle = color;
    ctx.strokeText(word, 0, 0);
  } else {
    ctx.fillStyle = color;
    ctx.fillText(word, 0, 0);
  }
  ctx.restore();
}

/** A band with the line's text repeated and scrolling sideways (a ticker), at height y (0..1). */
export function drawMarquee(
  f: LookFrame,
  amount: number,
  o: { y: number; band: string; ink: string; angle?: number; font?: string; speed?: number },
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const text = (f.line?.cleanText || f.nextLine?.cleanText || "").replace(/\s+/g, " ").trim();
  if (!text) return;
  const h = s * 0.07;
  const size = h * 0.55;
  ctx.save();
  ctx.translate(W / 2, H * o.y);
  ctx.rotate(o.angle ?? -0.08);
  ctx.globalAlpha = Math.min(1, 0.35 + amount * 0.65);
  ctx.fillStyle = o.band;
  ctx.fillRect(-W, -h / 2, W * 2, h);
  ctx.font = `800 ${size}px ${o.font ?? f.style.accentFont}`;
  ctx.textBaseline = "middle";
  const unit = `${text}  ✦  `;
  const uw = Math.max(1, ctx.measureText(unit).width);
  const off = -(((f.timeSec * s * 0.12 * (o.speed ?? 1)) % uw) + uw) % uw;
  ctx.fillStyle = o.ink;
  for (let x = -W + off; x < W; x += uw) ctx.fillText(unit, x, 0);
  ctx.restore();
}

/** Speed lines streaking across the frame, faster on loud parts. */
export function drawSpeedStreaks(f: LookFrame, amount: number, color: string, vertical = false): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(20 * amount);
  const along = vertical ? H : W;
  const across = vertical ? W : H;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const speed = 0.6 + hash01(i, 121) * 1.2 + f.energy;
    const len = along * (0.1 + hash01(i, 122) * 0.25);
    const p = ((((hash01(i, 123) + f.timeSec * speed * 0.5) % 1) + 1) % 1) * (along + len) - len;
    const q = across * hash01(i, 124);
    ctx.globalAlpha = (0.15 + hash01(i, 125) * 0.3) * amount;
    ctx.lineWidth = Math.max(1, s * 0.002 * (1 + hash01(i, 126) * 2));
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(q, p);
      ctx.lineTo(q, p + len);
    } else {
      ctx.moveTo(p, q);
      ctx.lineTo(p + len, q);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Dark ink spatters that land around the edges at each line start and stay for the line. */
export function drawInkSplatter(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0 || !f.line) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const seed = lineSeed(f);
  const grow = easeOutExpo(Math.min(1, Math.max(0, f.lineElapsed) / 0.25));
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.75 * amount);
  for (let i = 0; i < 3; i++) {
    // Toward the corners so the middle stays for the lyrics and the character
    const cx =
      W *
      (hash01(seed, 130 + i) < 0.5
        ? 0.04 + hash01(seed, 133 + i) * 0.22
        : 0.74 + hash01(seed, 136 + i) * 0.22);
    const cy = H * (0.06 + hash01(seed, 139 + i) * 0.88);
    const r = s * (0.02 + hash01(seed, 142 + i) * 0.04) * grow;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    for (let j = 0; j < 9; j++) {
      const a = hash01(seed * 31 + i, 150 + j) * Math.PI * 2;
      const d = r * (1.2 + hash01(seed * 31 + i, 160 + j) * 2.2);
      const dr = r * (0.08 + hash01(seed * 31 + i, 170 + j) * 0.22);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, dr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Fish (or birds) gliding across in a loose school. */
export function drawSchool(
  f: LookFrame,
  amount: number,
  color: string,
  kind: "fish" | "bird" = "fish",
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(6 + 12 * amount);
  const cycle = 22;
  const p = (f.timeSec % cycle) / cycle;
  const k = Math.floor(f.timeSec / cycle);
  const dir = hash01(k, 181) < 0.5 ? 1 : -1;
  const lead = { x: dir > 0 ? -0.2 + p * 1.4 : 1.2 - p * 1.4, y: 0.25 + hash01(k, 182) * 0.4 };
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.55 * Math.min(1, amount + 0.3));
  ctx.strokeStyle = withAlpha(color, 0.7 * Math.min(1, amount + 0.3));
  ctx.lineWidth = Math.max(1, s * 0.002);
  for (let i = 0; i < n; i++) {
    const x = (lead.x - dir * hash01(i, 183) * 0.2) * W + Math.sin(f.timeSec * 1.2 + i) * s * 0.01;
    const y = (lead.y + hashSigned(i, 184) * 0.1) * H + Math.cos(f.timeSec * 0.9 + i * 2) * s * 0.015;
    const sz = s * (0.012 + hash01(i, 185) * 0.01);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    if (kind === "fish") {
      const wag = Math.sin(f.timeSec * 8 + i) * 0.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-sz * 0.85, 0);
      ctx.lineTo(-sz * 1.5, -sz * (0.45 + wag));
      ctx.lineTo(-sz * 1.5, sz * (0.45 - wag));
      ctx.closePath();
      ctx.fill();
    } else {
      const flap = Math.sin(f.timeSec * 9 + i * 1.3) * sz * 0.6;
      ctx.beginPath();
      ctx.moveTo(-sz, -flap);
      ctx.quadraticCurveTo(-sz * 0.4, -flap * 0.2, 0, 0);
      ctx.quadraticCurveTo(sz * 0.4, -flap * 0.2, sz, -flap);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Jellyfish drifting up with pulsing bells and trailing tendrils. */
export function drawJellyfish(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(2 + 4 * amount);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < n; i++) {
    const rise = 0.015 + hash01(i, 191) * 0.015;
    const y = (1.15 - ((((hash01(i, 192) + f.timeSec * rise) % 1) + 1) % 1) * 1.3) * H;
    const x = W * (0.05 + hash01(i, 193) * 0.9) + Math.sin(f.timeSec * 0.4 + i) * s * 0.03;
    const r = s * (0.03 + hash01(i, 194) * 0.035);
    const pulse = 1 + Math.sin(f.timeSec * 2.2 + i * 2) * 0.12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, withAlpha(color, 0.5 * amount));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    ctx.fillStyle = withAlpha(color, 0.35 * amount);
    ctx.beginPath();
    ctx.ellipse(x, y, r * pulse, (r * 0.7) / pulse, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.35 * amount);
    ctx.lineWidth = Math.max(1, s * 0.0015);
    for (let j = 0; j < 4; j++) {
      const tx = x + (j - 1.5) * r * 0.4;
      ctx.beginPath();
      ctx.moveTo(tx, y);
      for (let q = 1; q <= 6; q++)
        ctx.lineTo(tx + Math.sin(f.timeSec * 2 + q * 0.8 + j) * r * 0.15, y + q * r * 0.35);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Lightning: a rare soft flash with a jagged bolt, more often on big lines. */
export function drawLightning(f: LookFrame, amount: number, color = "#dfe9ff"): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const slot = Math.floor(f.timeSec / 3);
  const odds = 0.2 + amount * 0.3 + (f.line?.isBigLine ? 0.3 : 0);
  if (hash01(slot, 201) > odds) return;
  const at = hash01(slot, 202) * 2.2;
  const p = (f.timeSec % 3) - at;
  if (p < 0 || p > 0.45) return;
  // Two quick pulses; kept soft so it never strobes hard
  const flash = Math.max(0, 1 - p / 0.12) + Math.max(0, 1 - Math.abs(p - 0.22) / 0.08) * 0.6;
  ctx.save();
  ctx.fillStyle = withAlpha(color, Math.min(0.35, 0.3 * flash * amount));
  ctx.fillRect(0, 0, W, H);
  if (p < 0.3) {
    ctx.strokeStyle = withAlpha("#ffffff", 0.9 * amount * (1 - p / 0.3));
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.03;
    ctx.lineWidth = Math.max(1, s * 0.004);
    let x = W * (0.15 + hash01(slot, 203) * 0.7);
    let y = 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 10; i++) {
      x += hashSigned(slot * 13 + i, 204) * s * 0.06;
      y += H * 0.06;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Raindrops sliding down glass, leaving thin wet trails. */
export function drawGlassTrails(f: LookFrame, amount: number, color = "#dbe9f7"): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(4 + 10 * amount);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const period = 4 + hash01(i, 211) * 5;
    const phase = (f.timeSec + hash01(i, 212) * period) / period;
    const k = Math.floor(phase) * 53 + i;
    const p = phase % 1;
    const x0 = W * hash01(k, 213);
    // Slides in steps: stops, then runs on
    const run = p < 0.5 ? p * 0.4 : 0.2 + (p - 0.5) * 1.8;
    const y = H * (hash01(k, 214) * 0.3 + run);
    const top = H * hash01(k, 214) * 0.3;
    const x = x0 + Math.sin((y / H) * 9 + k) * s * 0.006;
    const r = s * (0.004 + hash01(k, 215) * 0.004);
    ctx.strokeStyle = withAlpha(color, 0.18 * amount);
    ctx.lineWidth = r * 0.8;
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = withAlpha(color, 0.55 * amount);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Short electric sparks crackling from a few points (a faulty sign). */
export function drawSparks(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const tick = Math.floor(f.timeSec * 14);
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.9 * amount);
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.02;
  ctx.lineWidth = Math.max(1, s * 0.002);
  for (let i = 0; i < 3; i++) {
    if (hash01(tick, 221 + i) > 0.25 * amount + f.energy * 0.15) continue;
    const x = W * (0.1 + hash01(i, 224) * 0.8);
    const y = H * (0.08 + hash01(i, 225) * 0.2);
    for (let j = 0; j < 4; j++) {
      let px = x;
      let py = y;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let q = 0; q < 4; q++) {
        px += hashSigned(tick * 7 + j, 226 + q) * s * 0.02;
        py += hash01(tick * 7 + j, 230 + q) * s * 0.02;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Hand-lettered sound words (sfx) popping in at line starts, manga style. */
export function drawSfxWords(f: LookFrame, amount: number, ink: string, fill: string): void {
  if (amount <= 0 || !f.line) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const seed = lineSeed(f);
  if (hash01(seed, 241) > 0.4 + amount * 0.5) return;
  const words = ["ドン", "ザッ", "キラ", "バン", "쾅", "두근", "휙", "WHAM"];
  const word = words[Math.floor(hash01(seed, 242) * words.length)];
  const p = Math.max(0, f.lineElapsed);
  const scale = p < 0.15 ? easeOutExpo(p / 0.15) * 1.15 : 1 + Math.max(0, 0.15 - (p - 0.15));
  const side = hash01(seed, 243) < 0.5;
  const x = W * (side ? 0.12 + hash01(seed, 244) * 0.12 : 0.76 + hash01(seed, 244) * 0.12);
  const y = H * (0.18 + hash01(seed, 245) * 0.25);
  const size = s * (0.09 + 0.05 * amount);
  ctx.save();
  ctx.translate(x + jitter(f, hashSigned(Math.floor(f.timeSec * 12), seed) * s * 0.004), y);
  ctx.rotate(hashSigned(seed, 246) * 0.35);
  ctx.scale(scale, scale);
  ctx.font = `900 ${size}px 'Dela Gothic One', 'Black Han Sans', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = fill;
  ctx.strokeText(word, 0, 0);
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = ink;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(word, 0, 0);
  ctx.restore();
}

/** Floating geometric shapes (circles, triangles, squiggles) that bob and turn. */
export function drawFloatingShapes(f: LookFrame, amount: number, colors: readonly string[]): void {
  if (amount <= 0 || colors.length === 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(4 + 8 * amount);
  const kick = lineKick(f, 0.4);
  ctx.save();
  ctx.lineWidth = Math.max(2, s * 0.008);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    // Kept to the frame's edges so they frame the lyrics instead of covering them:
    // the sides of a wide frame, the top and bottom of a tall one
    const edge = hash01(i, 251) < 0.5;
    const across = edge ? 0.03 + hash01(i, 252) * 0.2 : 0.77 + hash01(i, 252) * 0.2;
    const along = 0.08 + hash01(i, 253) * 0.84;
    const bob = Math.sin(f.timeSec * (0.7 + hash01(i, 254)) + i) * s * 0.02;
    const tall = H > W;
    const x = W * (tall ? along : across);
    const y = H * (tall ? across : along) + bob;
    const r = s * (0.02 + hash01(i, 255) * 0.03) * (1 + kick * 0.25);
    const c = colors[i % colors.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(f.timeSec * (hash01(i, 256) - 0.5) + i);
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    switch (i % 4) {
      case 0:
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 1:
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.9, r * 0.6);
        ctx.lineTo(-r * 0.9, r * 0.6);
        ctx.closePath();
        ctx.stroke();
        break;
      case 2:
        ctx.beginPath();
        for (let q = 0; q <= 4; q++) ctx.lineTo(-r * 1.2 + q * r * 0.6, q % 2 ? -r * 0.4 : r * 0.4);
        ctx.stroke();
        break;
      default:
        ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Faded copies of the lyrics trailing behind them (an echo). `draw` paints the
 * theme's lyrics; it is called again for each copy, shifted and fainter.
 */
export function withEcho(
  f: LookFrame,
  amount: number,
  draw: () => void,
  dir: { x: number; y: number } = { x: 1, y: 0.6 },
): void {
  if (amount > 0 && f.line && f.lineElapsed >= 0) {
    const s = minSide(f);
    const settle = Math.max(0.25, 1 - Math.max(0, f.lineElapsed) / 1.2);
    const { ctx } = f;
    for (let i = 3; i >= 1; i--) {
      ctx.save();
      ctx.globalAlpha *= 0.13 * amount * (1 - i / 4);
      const d = s * 0.008 * i * settle * (0.6 + amount);
      ctx.translate(dir.x * d, dir.y * d);
      draw();
      ctx.restore();
    }
  }
  draw();
}

/** A solid offset copy of the lyrics behind them, like a printed drop shadow. */
export function withBlockShadow(
  f: LookFrame,
  amount: number,
  color: string,
  draw: (shadow: string | null) => void,
): void {
  if (amount > 0 && f.line) {
    const d = minSide(f) * 0.009 * (0.5 + amount);
    f.ctx.save();
    f.ctx.translate(d, d);
    draw(color);
    f.ctx.restore();
  }
  draw(null);
}

/** A slow projector flicker and gate weave for old film. */
export function drawProjectorFlicker(f: LookFrame, amount: number): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const tick = Math.floor(f.timeSec * 18);
  const flick = hash01(tick, 261) * 0.08 + (hash01(tick, 262) > 0.93 ? 0.08 : 0);
  ctx.save();
  ctx.fillStyle = `rgba(255,236,200,${flick * amount})`;
  ctx.globalCompositeOperation = "screen";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  // A burn mark blooms in a corner now and then
  const slot = Math.floor(f.timeSec / 5);
  const p = (f.timeSec % 5) / 0.8;
  if (hash01(slot, 263) < 0.4 * amount && p < 1) {
    const x = hash01(slot, 264) < 0.5 ? W * 0.06 : W * 0.94;
    const y = hash01(slot, 265) < 0.5 ? H * 0.08 : H * 0.92;
    const r = Math.max(W, H) * 0.12 * easeOutExpo(p);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,250,235,${0.7 * (1 - p)})`);
    g.addColorStop(0.5, `rgba(220,120,40,${0.4 * (1 - p)})`);
    g.addColorStop(1, "rgba(60,20,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Dust motes floating in the light, catching it now and then. */
export function drawDustMotes(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(30 * amount);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = W * ((((hash01(i, 271) + f.timeSec * 0.006 * (hash01(i, 272) - 0.3)) % 1) + 1) % 1);
    const y = H * ((((hash01(i, 273) - f.timeSec * 0.004 * hash01(i, 274)) % 1) + 1) % 1);
    const tw = 0.3 + 0.7 * Math.max(0, Math.sin(f.timeSec * (0.5 + hash01(i, 275)) + i));
    ctx.fillStyle = withAlpha(color, 0.6 * tw * amount);
    ctx.beginPath();
    ctx.arc(x, y, s * (0.0015 + hash01(i, 276) * 0.0025), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Sparkles twinkling as four-point glints (on water, snow or glass). */
export function drawGlints(
  f: LookFrame,
  amount: number,
  color: string,
  area: [number, number] = [0, 1],
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(8 + 20 * amount);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const period = 1.2 + hash01(i, 281) * 1.6;
    const phase = (f.timeSec + hash01(i, 282) * period) / period;
    const k = Math.floor(phase) * 71 + i;
    const p = phase % 1;
    const a = Math.sin(p * Math.PI);
    const x = W * hash01(k, 283);
    const y = H * (area[0] + (area[1] - area[0]) * hash01(k, 284));
    const r = s * (0.006 + hash01(k, 285) * 0.01) * a;
    ctx.globalAlpha = a * amount;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2);
    ctx.quadraticCurveTo(x, y, x + r * 2, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 2);
    ctx.quadraticCurveTo(x, y, x - r * 2, y);
    ctx.quadraticCurveTo(x, y, x, y - r * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Puffy clouds drifting by, as rounded blobs. */
export function drawPuffClouds(
  f: LookFrame,
  amount: number,
  color: string,
  band: [number, number] = [0.05, 0.4],
): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.55 + 0.35 * amount);
  for (let i = 0; i < 4; i++) {
    const r = s * (0.05 + hash01(i, 291) * 0.05);
    const x =
      ((((hash01(i, 292) + f.timeSec * 0.008 * (1 + hash01(i, 293))) % 1) + 1) % 1) * (W + r * 6) - r * 3;
    const y = H * (band[0] + (band[1] - band[0]) * hash01(i, 294));
    ctx.globalAlpha = amount;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r * 0.9, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 0.2, y - r * 0.5, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Twinkling small stars across the upper sky. */
export function drawStarField(f: LookFrame, amount: number, color: string, bottom = 0.6): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(60 * amount);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f.timeSec * (0.8 + hash01(i, 301) * 2.5) + i * 7));
    ctx.globalAlpha = tw * Math.min(1, amount + 0.2);
    const r = s * (0.001 + hash01(i, 302) * 0.002);
    ctx.beginPath();
    ctx.arc(W * hash01(i, 303), H * bottom * hash01(i, 304), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Thin wind lines curling past, showing the breeze. */
export function drawWindLines(f: LookFrame, amount: number, color: string): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const n = Math.round(3 + 5 * amount);
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.5 * amount);
  ctx.lineWidth = Math.max(1, s * 0.0025);
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const period = 3 + hash01(i, 311) * 3;
    const phase = (f.timeSec + hash01(i, 312) * period) / period;
    const k = Math.floor(phase) * 41 + i;
    const p = phase % 1;
    const y = H * (0.1 + hash01(k, 313) * 0.8);
    const len = W * 0.25;
    const head = -len + p * (W + len * 2);
    const tailP = Math.max(0, p - 0.25);
    const tail = -len + tailP * (W + len * 2);
    ctx.beginPath();
    for (let x = tail; x <= head; x += W / 80) {
      const curl = Math.sin((x / W) * 8 + k) * s * 0.02;
      if (x === tail) ctx.moveTo(x, y + curl);
      else ctx.lineTo(x, y + curl);
    }
    // A small loop at the head now and then
    if (hash01(k, 314) < 0.4) ctx.arc(head, y - s * 0.02, s * 0.02, Math.PI / 2, Math.PI * 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** A scratch canvas, reused between frames (null where there is no DOM, as in tests). */
let scratchCanvas: HTMLCanvasElement | null = null;

/**
 * Copies a band of the frame (device pixels) into the scratch canvas with one
 * read of the frame, so pieces of it can be drawn back cheaply: drawing the
 * frame onto itself piece by piece copies the whole frame each time.
 */
export function snapshotBand(
  ctx: LookFrame["ctx"],
  y: number,
  h: number,
): { canvas: HTMLCanvasElement; y: number } | null {
  const frame = (ctx as CanvasRenderingContext2D).canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
  if (!frame || typeof frame.width !== "number" || typeof document === "undefined") return null;
  const top = Math.max(0, Math.floor(y));
  const height = Math.max(1, Math.min(frame.height - top, Math.ceil(h)));
  scratchCanvas ??= document.createElement("canvas");
  if (scratchCanvas.width !== frame.width) scratchCanvas.width = frame.width;
  if (scratchCanvas.height < height) scratchCanvas.height = height;
  const sc = scratchCanvas.getContext("2d");
  if (!sc) return null;
  sc.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  sc.drawImage(frame, 0, top, frame.width, height, 0, 0, frame.width, height);
  return { canvas: scratchCanvas, y: top };
}

/** A reflection of the frame's lower part on wet ground, rippling. */
export function drawWetReflection(f: LookFrame, amount: number, from = 0.8): void {
  if (amount <= 0) return;
  const { ctx, W, H } = f;
  const canvas = (ctx as CanvasRenderingContext2D).canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
  if (!canvas || typeof canvas.width !== "number") return;
  const top = H * from;
  const rows = Math.ceil(H - top);
  const scaleX = canvas.width / W;
  const scaleY = canvas.height / H;
  // The band just above the ground line, read once
  const band = snapshotBand(ctx, (top - rows) * scaleY, rows * scaleY);
  if (!band) return;
  const step = Math.max(2, Math.round(rows / 24));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.35 * amount;
  for (let y = 0; y < rows; y += step) {
    const srcY = (top - y - step) * scaleY - band.y;
    if (srcY < 0) break;
    const wobble = Math.sin(f.timeSec * 2 + y * 0.3) * W * 0.004 * (y / rows);
    ctx.drawImage(
      band.canvas,
      0,
      srcY,
      canvas.width,
      step * scaleY,
      wobble * scaleX,
      (top + y) * scaleY,
      canvas.width,
      step * scaleY,
    );
  }
  ctx.restore();
}
