import type { LyricLine } from "@/types/project";
import { amt, type LookFrame, type LookRenderer } from "./frame";
import type { Rect } from "./illustration";
import { clamp01, hash01, hashSigned, withAlpha } from "./noise";
import {
  clock,
  drawLaid,
  drawWallpaper,
  easeOut,
  layLine,
  popAt,
  roundRect,
  textOn,
  unitOf,
} from "./screen-kit";

// Desktop screen: the song's picture as the wallpaper, a menu bar with the
// song time as the clock and a dock below. Each lyric line opens as a new
// text window that types the words as they are sung; the windows of the last
// lines stay open behind it, a little dimmer, and the pointer glides over to
// each new window and clicks it.

const KEEP = 3;

/** Where the windows open in turn, as shares of the free desktop. */
const SLOTS: readonly [number, number][] = [
  [0.15, 0.12],
  [0.85, 0.42],
  [0.2, 0.78],
  [0.8, 0.95],
  [0.5, 0.35],
];

interface Win {
  line: LyricLine;
  rect: Rect;
  live: boolean;
  age: number;
}

function bars(f: LookFrame): { top: number; dock: number } {
  const u = unitOf(f);
  return { top: amt(f, "menubar") > 0 ? u * 4.6 : 0, dock: amt(f, "dock") > 0 ? u * 12 : 0 };
}

/** Where line i's window sits: scattered over the free desktop, the same every time. */
function windowRect(f: LookFrame, line: LyricLine, w: number, h: number): Rect {
  const { W, H } = f;
  const b = bars(f);
  const free = { x: W * 0.05, y: b.top + H * 0.05, w: W * 0.9, h: H - b.top - b.dock - H * 0.1 };
  // Five spots around the desktop in turn, nudged a little, so neighbouring lines' windows do not pile up
  const [sx, sy] = SLOTS[line.index % SLOTS.length];
  const jx = sx + 0.06 * hashSigned(line.index, 701);
  const jy = sy + 0.06 * hashSigned(line.index, 702);
  const x = free.x + Math.max(0, free.w - w) * Math.min(1, Math.max(0, jx));
  const y = free.y + Math.max(0, free.h - h) * Math.min(1, Math.max(0, jy));
  return { x, y, w, h };
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  drawWallpaper(f, { x: 0, y: 0, w: W, h: H }, style.bgColor, style.secondaryColor);
  if (!f.images.background && amt(f, "wallpaper") > 0) {
    // Without a picture: soft color shapes like a stock wallpaper
    ctx.save();
    ctx.globalAlpha = 0.5 * amt(f, "wallpaper");
    for (let i = 0; i < 3; i++) {
      const cx = W * (0.2 + 0.6 * hash01(i, 801)) + Math.sin(f.timeSec * 0.1 + i) * W * 0.03;
      const cy = H * (0.25 + 0.5 * hash01(i, 802));
      const r = Math.max(W, H) * (0.35 + 0.2 * hash01(i, 803));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, i % 2 ? style.accentColor : style.secondaryColor);
      g.addColorStop(1, withAlpha(style.bgColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  f.beforeCharacter?.();
  menuBar(f);
  dock(f);
}

function menuBar(f: LookFrame): void {
  const b = bars(f);
  if (b.top <= 0) return;
  const { ctx, W, style } = f;
  const u = unitOf(f);
  ctx.save();
  ctx.fillStyle = withAlpha("#101216", 0.55);
  ctx.fillRect(0, 0, W, b.top);
  ctx.fillStyle = "#f4f6f8";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${(u * 2.3).toFixed(1)}px ${style.mainFont}`;
  ctx.fillText("♪", u * 2.2, b.top / 2);
  ctx.font = `600 ${(u * 2.1).toFixed(1)}px ${style.mainFont}`;
  ctx.fillText(style.coverTitle?.trim() || "가사", u * 5.2, b.top / 2, W * 0.4);
  ctx.textAlign = "right";
  ctx.font = `500 ${(u * 2.1).toFixed(1)}px ${style.mainFont}`;
  ctx.fillText(clock(f.timeSec), W - u * 2.2, b.top / 2);
  // A battery and a signal mark
  const bx = W - u * 12;
  ctx.strokeStyle = "#f4f6f8";
  ctx.lineWidth = Math.max(1, u * 0.2);
  roundRect(ctx, bx - u * 2.6, b.top / 2 - u * 0.9, u * 4, u * 1.8, u * 0.4);
  ctx.stroke();
  ctx.fillRect(
    bx - u * 2.3,
    b.top / 2 - u * 0.6,
    u * 3.4 * (1 - 0.6 * clamp01(f.timeSec / Math.max(1, f.songEnd))),
    u * 1.2,
  );
  for (let i = 0; i < 3; i++)
    ctx.fillRect(
      bx - u * 7 + i * u * 0.9,
      b.top / 2 + u * 0.8 - i * u * 0.6,
      u * 0.55,
      u * 0.6 + i * u * 0.6,
    );
  ctx.restore();
}

function dock(f: LookFrame): void {
  const b = bars(f);
  if (b.dock <= 0) return;
  const { ctx, W, H, style } = f;
  const u = unitOf(f);
  const n = 6;
  const icon = u * 6.4;
  const gap = u * 1.8;
  const w = n * icon + (n + 1) * gap;
  const x = (W - w) / 2;
  const y = H - b.dock + u * 1.6;
  ctx.save();
  roundRect(ctx, x, y, w, icon + gap * 2, u * 3);
  ctx.fillStyle = withAlpha("#f4f6f8", 0.28);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#ffffff", 0.35);
  ctx.lineWidth = Math.max(1, u * 0.15);
  ctx.stroke();
  const colors = [
    style.accentColor,
    style.secondaryColor,
    "#e9eef2",
    style.textColor,
    style.accentColor,
    "#2b2f36",
  ];
  // The icon of the text app bounces when a new line opens
  const bounce = f.line ? Math.max(0, Math.sin(clamp01(f.lineElapsed / 0.45) * Math.PI)) : 0;
  for (let i = 0; i < n; i++) {
    const ix = x + gap + i * (icon + gap);
    const lift = i === 2 ? bounce * u * 2.2 : 0;
    roundRect(ctx, ix, y + gap - lift, icon, icon, u * 1.6);
    ctx.fillStyle = colors[i];
    ctx.fill();
    if (i === 2) {
      // Lines on the text app icon
      ctx.fillStyle = "#6b7480";
      for (let k = 0; k < 3; k++)
        ctx.fillRect(
          ix + icon * 0.22,
          y + gap - lift + icon * (0.3 + k * 0.17),
          icon * (0.56 - k * 0.1),
          u * 0.4,
        );
    }
  }
  if (f.line || (f.recent?.length ?? 0) > 0) {
    ctx.fillStyle = "#f4f6f8";
    ctx.beginPath();
    ctx.arc(x + gap + 2 * (icon + gap) + icon / 2, y + gap * 2 + icon - u * 0.6, u * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function lyrics(f: LookFrame): void {
  const { ctx, style } = f;
  const u = unitOf(f);
  const paper = style.secondaryColor;
  const ink = textOn(paper);
  const title = u * 4.2;
  const pad = u * 3;

  const wins: Win[] = [];
  const recent = f.recent ?? [];
  for (const l of recent.slice(-(KEEP - (f.line ? 1 : 0))))
    wins.push({ line: l, rect: { x: 0, y: 0, w: 0, h: 0 }, live: false, age: f.timeSec - l.startTime });
  if (f.line) wins.push({ line: f.line, rect: { x: 0, y: 0, w: 0, h: 0 }, live: true, age: f.lineElapsed });

  let topRect: Rect | null = null;
  wins.forEach((win, i) => {
    const depth = wins.length - 1 - i;
    const laid = layLine(f, ctx, win.line, win.live ? win.age : 1e6, {
      size: u * 4.6 * style.fontScale * (win.line.isBigLine ? 1.12 : 1),
      weight: 500,
      family: style.mainFont,
      maxW: Math.min(f.W * 0.62, u * 70),
      maxRows: 4,
      leading: 1.35,
    });
    const w = Math.max(u * 34, laid.widest + pad * 2);
    const h = title + laid.rows.length * laid.rowH + pad * 2;
    const r = windowRect(f, win.line, w, h);
    win.rect = r;
    const pop = win.age < 0.4 ? popAt(win.age, 0.3) : 1;
    const dim = depth * 0.18;
    ctx.save();
    ctx.globalAlpha = clamp01(pop * 1.6) * (1 - dim);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.translate(cx, cy);
    const s = (0.86 + 0.14 * pop) * (1 - depth * 0.03);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    // Window: shadow, paper, title bar with three plain dots and the file name
    roundRect(ctx, r.x, r.y, r.w, r.h, u * 1.6);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = u * 4;
    ctx.shadowOffsetY = u * 1.2;
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, u * 1.6);
    ctx.clip();
    ctx.fillStyle = withAlpha(ink, 0.08);
    ctx.fillRect(r.x, r.y, r.w, title);
    ctx.restore();
    for (let d = 0; d < 3; d++) {
      ctx.fillStyle = d === 0 && win.live ? style.accentColor : withAlpha(ink, 0.28);
      ctx.beginPath();
      ctx.arc(r.x + u * 2.6 + d * u * 2.2, r.y + title / 2, u * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = withAlpha(ink, 0.7);
    ctx.font = `500 ${(u * 2).toFixed(1)}px ${style.mainFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`lyric_${String(win.line.index + 1).padStart(2, "0")}.txt`, cx, r.y + title / 2);
    ctx.textAlign = "left";
    ctx.font = `500 ${laid.size.toFixed(2)}px ${style.mainFont}`;
    drawLaid(ctx, laid, r.x + pad, r.y + title + pad * 0.8, {
      color: ink,
      accent: textOn(style.accentColor),
      // Words are typed as they are sung
      waiting: 0,
      rise: 0,
      mark: style.accentColor,
      accentWeight: 800,
      family: style.mainFont,
    });
    if (win.live && amt(f, "caret") > 0 && Math.floor(f.timeSec * 2.2) % 2 === 0) {
      // Caret after the last word typed
      const shownRows = laid.rows.map((row) => row.filter((it) => it.e >= 0));
      let ri = shownRows.length - 1;
      while (ri > 0 && shownRows[ri].length === 0) ri--;
      const row = shownRows[ri] ?? [];
      const xEnd = row.reduce((acc, it, k) => acc + it.w + (k > 0 && !it.joined ? laid.gap : 0), 0);
      ctx.fillStyle = style.accentColor;
      ctx.fillRect(
        r.x + pad + xEnd + u * 0.4,
        r.y + title + pad * 0.8 + ri * laid.rowH + laid.size * 0.1,
        u * 0.35,
        laid.size,
      );
    }
    ctx.restore();
    if (win.live) topRect = r;
  });

  if (amt(f, "pointer") > 0) drawPointer(f, topRect, wins);
}

/** The pointer glides from the last window to the new one's title bar and clicks. */
function drawPointer(f: LookFrame, target: Rect | null, wins: Win[]): void {
  const { ctx } = f;
  const u = unitOf(f);
  const prev = wins.length > 1 ? wins[wins.length - 2].rect : null;
  const to = target ?? wins[wins.length - 1]?.rect ?? null;
  if (!to) return;
  const end = { x: to.x + to.w * 0.62, y: to.y + u * 2 };
  const start = prev ? { x: prev.x + prev.w * 0.62, y: prev.y + u * 2 } : { x: f.W * 0.5, y: f.H * 0.6 };
  const k = target ? easeOut(f.lineElapsed / 0.45) : 1;
  const x = start.x + (end.x - start.x) * k + Math.sin(f.timeSec * 0.9) * u * 0.6;
  const y = start.y + (end.y - start.y) * k;
  ctx.save();
  if (target) {
    // Click ring as the pointer lands
    const ring = f.lineElapsed - 0.45;
    if (ring > 0 && ring < 0.4) {
      ctx.strokeStyle = withAlpha("#ffffff", 0.8 * (1 - ring / 0.4));
      ctx.lineWidth = u * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, u * (1 + ring * 8), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.translate(x, y);
  ctx.scale(u * 0.55 * amt(f, "pointer") + u * 0.2, u * 0.55 * amt(f, "pointer") + u * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 7.2);
  ctx.lineTo(1.9, 5.5);
  ctx.lineTo(3.2, 8.4);
  ctx.lineTo(4.4, 7.9);
  ctx.lineTo(3.1, 5.1);
  ctx.lineTo(5.6, 5.1);
  ctx.closePath();
  ctx.fillStyle = "#0b0d10";
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}

function overlay(): void {}

export const desktopScreen: LookRenderer = { scene, lyrics, overlay };
