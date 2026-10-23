import { drawImageRect, type Rect } from "./illustration";
import { lineGlyphs } from "./glyphs";
import {
  amt,
  backgroundSource,
  boxHeight,
  clampLeft,
  drawCharacterLayer,
  drawScanlines,
  drawVignette,
  fitWidth,
  isPortrait,
  lyricRegion,
  minSide,
  rowLimit,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { GRID } from "./layout";
import { hash01, hashSigned, withAlpha } from "./noise";
import { revealRows } from "./words";
import { fitScale, isSpaced, manualRows, wrapText } from "../wrap";

// E. Digital UI / CRT: illustration in an OS window, neon pixel city behind, pixel grid, typewriter lyrics.

function windowRect(f: LookFrame): Rect {
  const { W, H } = f;
  if (isPortrait(f)) return { x: W * 0.07, y: H * 0.16, w: W * 0.86, h: H * 0.42 };
  return { x: W * 0.17, y: H * 0.12, w: W * 0.66, h: H * 0.7 };
}

function titleBarH(f: LookFrame): number {
  return minSide(f) * 0.042;
}

/** Window shake for the first frames of each line. */
function windowJolt(f: LookFrame): number {
  const jolt = amt(f, "jolt");
  return f.line && f.lineElapsed < 0.1
    ? hashSigned(Math.floor(f.timeSec * 60), 1) * minSide(f) * 0.024 * jolt * f.shake
    : 0;
}

/** Neon pixel city: flickering squares, denser toward the bottom. */
function drawCity(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const px = Math.max(3, Math.round(minSide(f) * 0.008));
  const city = Math.round(850 * amt(f, "city"));
  for (let i = 0; i < city; i++) {
    const y = Math.pow(hash01(i, 2), 0.6) * H;
    const x = hash01(i, 1) * W;
    const on = hash01(i, Math.floor(f.timeSec * 3 + hash01(i, 4) * 10)) > 0.25;
    if (!on) continue;
    ctx.fillStyle = withAlpha(
      i % 3 === 0 ? style.secondaryColor : i % 3 === 1 ? style.accentColor : "#ffffff",
      0.25 + 0.5 * hash01(i, 3),
    );
    ctx.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, px - 1, px - 1);
  }
}

/** Mixed into another theme: the pixel city and a fine pixel grid over the whole frame. */
function decor(f: LookFrame): void {
  drawCity(f);
  const grid = amt(f, "grid");
  if (grid <= 0) return;
  const { ctx, W, H } = f;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.3 * grid})`;
  for (let x = 0; x < W; x += 3) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  ctx.fillStyle = style.bgColor;
  ctx.fillRect(0, 0, W, H);

  drawCity(f);

  const win = windowRect(f);
  const jolt = windowJolt(f);
  const bar = titleBarH(f);
  const content = { x: win.x + jolt, y: win.y + bar + jolt * 0.5, w: win.w, h: win.h - bar };
  ctx.save();
  ctx.shadowColor = withAlpha(style.accentColor, 0.7);
  ctx.shadowBlur = minSide(f) * 0.04;
  ctx.fillStyle = "#000000";
  ctx.fillRect(content.x, win.y + jolt * 0.5, win.w, win.h);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(content.x, content.y, content.w, content.h);
  ctx.clip();
  const img = f.images.background;
  const src = backgroundSource(f, content);
  if (img && src) {
    drawImageRect(ctx, img, src, content);
  } else {
    const g = ctx.createLinearGradient(content.x, content.y, content.x + content.w, content.y + content.h);
    g.addColorStop(0, withAlpha(style.accentColor, 0.9));
    g.addColorStop(1, withAlpha(style.secondaryColor, 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(content.x, content.y, content.w, content.h);
  }
  // The character keeps its screen position but only shows through the window
  drawCharacterLayer(f, { bounce: f.energy * 0.6, tilt: 0 });
  // Neon tint, then a fine pixel grid over the picture
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = withAlpha(style.accentColor, amt(f, "wash"));
  ctx.fillRect(content.x, content.y, content.w, content.h);
  ctx.globalCompositeOperation = "source-over";
  const grid = amt(f, "grid");
  if (grid > 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.4 * grid})`;
    for (let x = content.x; x < content.x + content.w; x += 3) ctx.fillRect(x, content.y, 1, content.h);
    for (let y = content.y; y < content.y + content.h; y += 3) ctx.fillRect(content.x, y, content.w, 1);
  }
  ctx.restore();

  // Title bar with a chromatic double border
  ctx.save();
  ctx.fillStyle = style.accentColor;
  ctx.fillRect(content.x, win.y + jolt * 0.5, win.w, bar);
  ctx.fillStyle = "#16061a";
  ctx.font = `700 ${bar * 0.5}px ${style.accentFont}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const n = f.line ? String(f.line.index + 1).padStart(2, "0") : "--";
  ctx.fillText(`lyric_${n}.exe`, content.x + bar * 0.4, win.y + jolt * 0.5 + bar / 2);
  ctx.textAlign = "right";
  ctx.fillText("♥  ♥  ✕", content.x + win.w - bar * 0.4, win.y + jolt * 0.5 + bar / 2);
  const fringe = amt(f, "fringe") * f.glitch;
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(255,40,80,${0.9 * fringe})`;
  ctx.strokeRect(content.x - 3 * fringe, win.y + jolt * 0.5 - 1, win.w, win.h);
  ctx.strokeStyle = `rgba(40,220,255,${0.9 * fringe})`;
  ctx.strokeRect(content.x + 3 * fringe, win.y + jolt * 0.5 + 1, win.w, win.h);
  ctx.restore();
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, W, H, style } = f;
  const win = windowRect(f);
  const size = minSide(f) * 0.04 * style.fontScale;
  const glyphs = lineGlyphs(line, f.lineElapsed);
  // Typewriter: each word types out over 0.15s once it starts
  const counts = new Map<number, number>();
  for (const g of glyphs) counts.set(g.wordIndex, (counts.get(g.wordIndex) ?? 0) + 1);
  const seen = new Map<number, number>();
  let text = "";
  for (const g of glyphs) {
    const k = seen.get(g.wordIndex) ?? 0;
    seen.set(g.wordIndex, k + 1);
    const typed = g.wElapsed / 0.15;
    if (g.wElapsed >= 0 && k < typed * (counts.get(g.wordIndex) ?? 1)) text += g.ch;
    else if (g.wElapsed >= 0 || g.ch !== " ") break;
  }

  // Bottom of the window by default; the top when the character covers the lower middle
  const { cell, rect: area } = lyricRegion(f, [13, 14, 1, 2, 5, 6, 9, 10]);
  const row = Math.floor(cell / GRID);
  const y =
    row === 0
      ? win.y + titleBarH(f) + size * 1.3
      : row < GRID - 1
        ? H / 2
        : isPortrait(f)
          ? win.y + win.h + H * 0.07
          : win.y + win.h - size * 1.2;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Centered in the open part of the window's row
  const left = Math.max(win.x, area.x);
  const right = Math.min(win.x + win.w, area.x + area.w);
  const span = right > left ? right - left : win.w;
  const center = right > left ? (left + right) / 2 : W / 2;
  const maxW = fitWidth(f, span * 0.86);
  // Wrap the full line so the typed text does not shift as it grows. Words and spaced phrases
  // shrink to fit whole, and the type shrinks while it needs more than two rows (or the manual rows)
  const measure = (t: string) => ctx.measureText(t).width;
  ctx.font = `700 ${size}px ${style.mainFont}`;
  let px = size * fitScale(line.cleanText, maxW, measure);
  const maxRows = Math.max(rowLimit(f, 2), manualRows(line.cleanText).length);
  let rows: string[] = [];
  for (let i = 0; i < 8; i++) {
    ctx.font = `700 ${px}px ${style.mainFont}`;
    rows = wrapText(line.cleanText, maxW, measure);
    if (rows.length <= maxRows) break;
    px *= 0.85;
  }
  const rowWidths = rows.map((r) => ctx.measureText(r).width);
  const widest = Math.max(0, ...rowWidths);
  const rowH = px * 1.4 * boxHeight(f);
  // Grow away from the window edge the text sits on
  const y0 =
    row === 0 ? y : row < GRID - 1 ? y - ((rows.length - 1) * rowH) / 2 : y - (rows.length - 1) * rowH;
  // Pulled back on screen when the lyric shift would push it off
  const x = clampLeft(f, center - widest / 2, widest);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - px * 0.4, y0 - px * 0.75, widest + px * 0.8, px * 1.5 + (rows.length - 1) * rowH);
  // A manual break in unspaced text is a "\n" glyph that no row holds, so it is not counted
  const spaced = isSpaced(line.cleanText);
  const count = Array.from(spaced ? text : text.replace(/\n/g, "")).length;
  const typed = revealRows(rows, count, spaced);
  const fringe = amt(f, "fringe") * f.glitch;
  let cursor = { x, y: y0 };
  typed.forEach((t, r) => {
    const ry = y0 + r * rowH;
    if (fringe > 0) {
      ctx.fillStyle = "rgba(255,40,80,0.75)";
      ctx.fillText(t, x - 3 * fringe, ry);
      ctx.fillStyle = "rgba(40,220,255,0.75)";
      ctx.fillText(t, x + 3 * fringe, ry);
    }
    ctx.fillStyle = style.textColor;
    ctx.fillText(t, x, ry);
    if (t) cursor = { x: x + ctx.measureText(t).width, y: ry };
  });
  if (Math.floor(f.timeSec * 2.5) % 2 === 0) {
    ctx.fillStyle = style.secondaryColor;
    ctx.fillRect(cursor.x + px * 0.1, cursor.y - px * 0.45, px * 0.5, px * 0.9);
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const hud = amt(f, "hud");
  if (hud > 0) drawHud(f, hud);
  const scan = amt(f, "scanlines");
  if (scan > 0) drawScanlines(f, 0.32 * scan, 3);
  if (!f.mixed) drawVignette(f, 0.5);
}

/** Side slider tracking song progress, and a blinking REC tag. */
function drawHud(f: LookFrame, hud: number): void {
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const p = f.songEnd > 0 ? Math.min(1, f.timeSec / f.songEnd) : 0;
  const sx = W * 0.045;
  ctx.save();
  ctx.globalAlpha = hud;
  ctx.fillStyle = withAlpha(style.textColor, 0.4);
  ctx.fillRect(sx, H * 0.2, 1, H * 0.6);
  ctx.fillStyle = style.textColor;
  ctx.fillRect(sx - 5, H * 0.2 + H * 0.6 * p - 2, 11, 4);
  ctx.font = `600 ${s * 0.016}px ${style.accentFont}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  if (Math.floor(f.timeSec) % 2 === 0) {
    ctx.fillStyle = "#ff3b5c";
    ctx.beginPath();
    ctx.arc(sx + 4, H * 0.12, s * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = style.textColor;
  ctx.fillText("REC", sx + s * 0.02, H * 0.12 + s * 0.006);
  ctx.restore();
}

export const digitalCrt: LookRenderer = { scene, lyrics, overlay, decor };
