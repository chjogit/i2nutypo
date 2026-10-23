import { easeOutExpo } from "../easing";
import {
  amt,
  backgroundSource,
  boxHeight,
  clampCenter,
  drawCharacterLayer,
  fadeIn,
  fitWidth,
  lineExit,
  lyricRegion,
  minSide,
  rowLimit,
  withMoved,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { drawImageRect, type Rect } from "./illustration";
import { hash01, hashSigned, withAlpha } from "./noise";
import { rowWidth, wrapWords } from "./words";
import { fitScale } from "../wrap";

// H. Summer film: cyan sky, drifting clouds, sunlight flare, a tilted instant-photo frame, film strips and a white flash on each line.

/** Sea-and-sky stand-in when no background is loaded. */
function drawPlaceholderSea(f: LookFrame, r: Rect): void {
  const { ctx, style } = f;
  const horizon = r.y + r.h * 0.66;
  const sky = ctx.createLinearGradient(0, r.y, 0, horizon);
  sky.addColorStop(0, style.accentColor);
  sky.addColorStop(1, "#e9fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, horizon - r.y);
  const sea = ctx.createLinearGradient(0, horizon, 0, r.y + r.h);
  sea.addColorStop(0, withAlpha(style.accentColor, 1));
  sea.addColorStop(1, "#0b3a66");
  ctx.fillStyle = sea;
  ctx.fillRect(r.x, horizon, r.w, r.y + r.h - horizon);
  // Glints on the water
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 40; i++) {
    const tw = 0.5 + 0.5 * Math.sin(f.timeSec * 3 + i * 1.7);
    const y = horizon + Math.pow(hash01(i, 2), 1.6) * (r.y + r.h - horizon);
    ctx.globalAlpha = tw;
    ctx.fillRect(r.x + hash01(i, 1) * r.w, y, r.w * 0.02 * (0.3 + hash01(i, 3)), 1.5);
  }
  ctx.globalAlpha = 1;
}

/** Soft cumulus puffs sliding slowly across the upper half. */
function drawClouds(f: LookFrame): void {
  const clouds = amt(f, "clouds");
  if (clouds <= 0) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const speed = 0.006 + hash01(i, 1) * 0.01;
    const x = ((((hash01(i, 2) + f.timeSec * speed) % 1.4) + 1.4) % 1.4) * W * 1.2 - W * 0.3;
    const y = H * (0.08 + hash01(i, 3) * 0.35);
    const size = s * (0.12 + hash01(i, 4) * 0.12);
    for (let k = 0; k < 5; k++) {
      const px = x + (k - 2) * size * 0.55;
      const py = y - Math.sin((k / 4) * Math.PI) * size * 0.35;
      const r = size * (0.45 + 0.2 * Math.sin((k / 4) * Math.PI));
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(255,255,255,${0.75 * clouds})`);
      g.addColorStop(0.6, `rgba(255,255,255,${0.4 * clouds})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

/** Sun in the upper right with a diagonal row of lens ghosts. */
function drawFlare(f: LookFrame): void {
  const flare = amt(f, "flare");
  if (flare <= 0) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const sx = W * 0.86;
  const sy = H * 0.1;
  const pulse = 1 + f.energy * 0.25;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * 0.5 * pulse);
  sun.addColorStop(0, `rgba(255,255,255,${0.95 * flare})`);
  sun.addColorStop(0.15, withAlpha(style.secondaryColor, 0.7 * flare));
  sun.addColorStop(1, withAlpha(style.secondaryColor, 0));
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  // Ghosts along the line from the sun through the center
  for (let i = 1; i <= 4; i++) {
    const t = i * 0.32;
    const gx = sx + (W / 2 - sx) * t * 1.6;
    const gy = sy + (H / 2 - sy) * t * 1.6;
    const r = s * (0.02 + 0.03 * hash01(i, 7));
    ctx.fillStyle = withAlpha(i % 2 ? style.secondaryColor : "#9be7ff", 0.25 * flare);
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function decor(f: LookFrame): void {
  drawClouds(f);
  drawFlare(f);
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, style.bgColor);
  sky.addColorStop(1, "#f2fdff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // The picture is an instant photo: a white card that tilts a little on each line
  const polaroid = amt(f, "polaroid");
  const img = f.images.background;
  const s = minSide(f);
  const card: Rect = polaroid > 0 ? { x: W * 0.09, y: H * 0.07, w: W * 0.82, h: H * 0.84 } : full;
  const border = polaroid > 0 ? s * 0.025 : 0;
  const photo: Rect = {
    x: card.x + border,
    y: card.y + border,
    w: card.w - border * 2,
    h: card.h - border * (polaroid > 0 ? 4.2 : 2),
  };
  withMoved(f, "polaroid", { x: W / 2, y: H / 2 }, () => {
    ctx.save();
    if (polaroid > 0) {
      const seed = f.line ? f.line.index : 0;
      const settle = easeOutExpo(Math.min(1, f.lineElapsed / 0.5));
      const tilt = hashSigned(seed, 4) * 0.035 * polaroid * (0.6 + 0.4 * settle);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(tilt);
      ctx.translate(-W / 2, -H / 2);
      ctx.shadowColor = "rgba(10,40,70,0.35)";
      ctx.shadowBlur = s * 0.03;
      ctx.shadowOffsetY = s * 0.01;
      ctx.fillStyle = "#fffdf7";
      ctx.fillRect(card.x, card.y, card.w, card.h);
      ctx.shadowColor = "transparent";
    }
    ctx.beginPath();
    ctx.rect(photo.x, photo.y, photo.w, photo.h);
    ctx.clip();
    const src = img ? backgroundSource(f, photo) : null;
    if (img && src) drawImageRect(ctx, img, src, photo);
    else drawPlaceholderSea(f, photo);
    ctx.restore();
  });

  decor(f);
  drawCharacterLayer(f, {
    bounce: f.energy * 0.5,
    tilt: Math.sin(f.timeSec * 0.9) * 0.02,
  });
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const { rect: area } = lyricRegion(f, [9, 10, 5, 6, 13, 14, 1, 2, 4, 7, 8, 11, 0, 3, 12, 15]);
  const big = line.isBigLine;
  let size = minSide(f) * (big ? 0.09 : 0.065) * style.fontScale;
  const exit = lineExit(f, 0.1);
  const maxW = fitWidth(f, area.w * 0.9);

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Wrap between words; shrink while the block runs over three rows or a word is wider than the space
  // Shrink so the widest word or spaced phrase fits whole, then wrap
  ctx.font = `900 ${size}px ${style.mainFont}`;
  size *= fitScale(line.cleanText, maxW, (t) => ctx.measureText(t).width);
  let wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
  for (let i = 0; i < 8; i++) {
    ctx.font = `900 ${size}px ${style.mainFont}`;
    wrap = wrapWords(ctx, line, f.lineElapsed, maxW);
    if (wrap.rows.length <= rowLimit(f, 3) && wrap.widest <= maxW) break;
    size *= 0.85;
  }
  const rowH = size * 1.2 * boxHeight(f);
  const total = rowH * wrap.rows.length;
  const bottomLimit = f.subtitleVisible ? H * 0.8 : H * 0.95;
  let y = Math.max(H * 0.05, Math.min(area.y + area.h / 2 - total / 2, bottomLimit - total));
  const rise = amt(f, "rise");
  // Pulled back on screen when the lyric shift would push it off
  const cx = clampCenter(f, area.x + area.w / 2, wrap.widest);

  ctx.lineJoin = "round";
  for (const row of wrap.rows) {
    y += rowH;
    let x = cx - rowWidth(row, wrap.gap) / 2;
    for (const it of row) {
      const a = fadeIn(it.e, 0.3) * exit;
      if (a > 0) {
        const lift = (1 - easeOutExpo(Math.min(1, it.e / 0.45))) * size * 0.5 * rise;
        ctx.globalAlpha = a;
        // Deep blue outline and a soft sky shadow keep white text readable on bright skies
        ctx.shadowColor = withAlpha(style.accentColor, 0.55);
        ctx.shadowBlur = size * 0.3;
        ctx.lineWidth = size * 0.12;
        ctx.strokeStyle = withAlpha(style.accentColor, 0.9);
        ctx.strokeText(it.text, x, y - size * 0.15 + lift);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = it.accent ? style.secondaryColor : style.textColor;
        ctx.fillText(it.text, x, y - size * 0.15 + lift);
      }
      x += it.w + wrap.gap;
    }
  }
  ctx.restore();
}

/** Sprocket strips along the top and bottom edges, sliding sideways. */
function drawFilm(f: LookFrame, film: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const band = s * 0.055;
  const hole = band * 0.42;
  const step = hole * 2.1;
  const shift = (f.timeSec * s * 0.06) % step;
  ctx.save();
  ctx.globalAlpha = film;
  for (const y of [0, H - band]) {
    ctx.fillStyle = "rgba(12,18,24,0.88)";
    ctx.fillRect(0, y, W, band);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let x = -step + (y === 0 ? shift : -shift); x < W + step; x += step) {
      ctx.fillRect(x, y + (band - hole) / 2, hole, hole);
    }
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const film = amt(f, "film");
  if (film > 0) drawFilm(f, film);
  // A camera-flash white-out at the start of each line
  const flash = amt(f, "flash");
  if (flash > 0 && f.line && f.lineElapsed >= 0 && f.lineElapsed < 0.35) {
    const { ctx, W, H } = f;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.75 * flash * (1 - f.lineElapsed / 0.35)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export const summerFilm: LookRenderer = {
  scene,
  lyrics,
  overlay,
  decor,
  // The film strip covers the bottom edge, so subtitles sit above it
  letterbox: (f) => amt(f, "film") > 0,
};
