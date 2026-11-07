import type { LyricLine } from "@/types/project";
import { amt, type LookFrame, type LookRenderer } from "./frame";
import type { Rect } from "./illustration";
import { clamp01, withAlpha } from "./noise";
import {
  clock,
  drawLaid,
  drawWallpaper,
  easeOut,
  layLine,
  popAt,
  roundRect,
  screenColumn,
  textOn,
  unitOf,
  type LaidText,
} from "./screen-kit";

// Messenger chat: the lyrics arrive as chat bubbles that pile up from the
// input bar, the older ones scrolling up and away. Lines alternate between the
// two sides like a conversation ("&" lines always answer from the other side),
// the next line is typed into the input bar (or shown as "typing…" dots from
// the other side) just before it is sent, and the song time is the time stamp.

/** Seconds before a line is sent that the input bar starts typing it. */
const TYPE_AHEAD = 1.1;

interface Layout {
  col: Rect;
  u: number;
  header: number;
  input: number;
}

function layout(f: LookFrame): Layout {
  const col = screenColumn(f, 0.62);
  const u = unitOf(f);
  return {
    col,
    u,
    header: amt(f, "header") > 0 ? u * 11 : 0,
    input: amt(f, "inputbar") > 0 ? u * 11 : u * 3,
  };
}

/** True when the line is sent from the other person (left side). */
function fromThem(f: LookFrame, line: LyricLine): boolean {
  if (line.overlap) return true;
  return amt(f, "duet") > 0 && line.index % 2 === 1;
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const L = layout(f);
  const wall = amt(f, "wallpaper");
  // Outside the phone column (wide frames): the picture blurred and darkened
  if (L.col.w < W) {
    drawWallpaper(f, { x: 0, y: 0, w: W, h: H }, style.bgColor, style.secondaryColor, L.u * 2.4);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.col.x, L.col.y, L.col.w, L.col.h);
  ctx.clip();
  ctx.fillStyle = style.bgColor;
  ctx.fillRect(L.col.x, 0, L.col.w, H);
  if (wall > 0 && f.images.background) {
    ctx.globalAlpha = 0.25 + 0.6 * wall;
    drawWallpaper(f, L.col, style.bgColor, style.bgColor, L.u * 0.6);
    ctx.globalAlpha = 1;
    // A wash of the chat color keeps the bubbles readable over any picture
    ctx.fillStyle = withAlpha(style.bgColor, 0.55 * (1 - wall * 0.6));
    ctx.fillRect(L.col.x, 0, L.col.w, H);
  }
  f.beforeCharacter?.();
  ctx.restore();
  header(f, L);
  inputBar(f, L);
}

function header(f: LookFrame, L: Layout): void {
  if (L.header <= 0) return;
  const { ctx, style } = f;
  const { col, u } = L;
  const bar = style.secondaryColor;
  const ink = textOn(bar);
  ctx.save();
  ctx.fillStyle = withAlpha(bar, 0.94);
  ctx.fillRect(col.x, 0, col.w, L.header);
  ctx.fillStyle = withAlpha(ink, 0.12);
  ctx.fillRect(col.x, L.header - Math.max(1, u * 0.12), col.w, Math.max(1, u * 0.12));
  // Back chevron
  ctx.strokeStyle = ink;
  ctx.lineWidth = u * 0.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(col.x + u * 4.6, L.header / 2 - u * 1.8);
  ctx.lineTo(col.x + u * 2.8, L.header / 2);
  ctx.lineTo(col.x + u * 4.6, L.header / 2 + u * 1.8);
  ctx.stroke();
  // Avatar and name: the song title, and the credit (or the song time) under it
  const ax = col.x + u * 9.5;
  ctx.fillStyle = style.accentColor;
  ctx.beginPath();
  ctx.arc(ax, L.header / 2, u * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = textOn(style.accentColor);
  ctx.font = `700 ${(u * 3).toFixed(1)}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", ax, L.header / 2 + u * 0.2);
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = `700 ${(u * 3.4).toFixed(1)}px ${style.mainFont}`;
  const title = style.coverTitle?.trim() || "♪";
  ctx.fillText(title, ax + u * 4.6, L.header / 2 - u * 1.6, col.w - u * 28);
  ctx.font = `400 ${(u * 2.4).toFixed(1)}px ${style.mainFont}`;
  ctx.fillStyle = withAlpha(ink, 0.6);
  const typing = typingSide(f);
  const sub = typing === "them" ? "입력 중…" : style.coverCredit?.trim() || clock(f.timeSec);
  ctx.fillText(sub, ax + u * 4.6, L.header / 2 + u * 2, col.w - u * 28);
  // Two plain icons at the right: a magnifier and a menu
  const ix = col.x + col.w - u * 11;
  ctx.strokeStyle = ink;
  ctx.lineWidth = u * 0.45;
  ctx.beginPath();
  ctx.arc(ix, L.header / 2 - u * 0.4, u * 1.5, 0, Math.PI * 2);
  ctx.moveTo(ix + u * 1.1, L.header / 2 + u * 0.7);
  ctx.lineTo(ix + u * 2.2, L.header / 2 + u * 1.8);
  ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(col.x + col.w - u * 6.2, L.header / 2 + i * u * 1.4);
    ctx.lineTo(col.x + col.w - u * 3, L.header / 2 + i * u * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** Who is typing the next line right now: "me" (in the input bar), "them" (dots bubble) or nobody. */
function typingSide(f: LookFrame): "me" | "them" | null {
  if (amt(f, "typing") <= 0) return null;
  const next = f.nextLine;
  if (!next) return null;
  const until = next.startTime - f.timeSec;
  if (until <= 0 || until > TYPE_AHEAD) return null;
  // Not over a line that is still being sung, except near its end
  if (f.line && f.line.endTime - f.timeSec > TYPE_AHEAD) return null;
  return fromThem(f, next) ? "them" : "me";
}

function inputBar(f: LookFrame, L: Layout): void {
  if (amt(f, "inputbar") <= 0) return;
  const { ctx, style, H } = f;
  const { col, u } = L;
  const top = H - L.input;
  const bar = style.secondaryColor;
  const ink = textOn(bar);
  ctx.save();
  ctx.fillStyle = withAlpha(bar, 0.96);
  ctx.fillRect(col.x, top, col.w, L.input);
  // Plus button, field, send button
  ctx.strokeStyle = withAlpha(ink, 0.7);
  ctx.lineWidth = u * 0.45;
  ctx.beginPath();
  ctx.moveTo(col.x + u * 3, top + L.input / 2);
  ctx.lineTo(col.x + u * 6.4, top + L.input / 2);
  ctx.moveTo(col.x + u * 4.7, top + L.input / 2 - u * 1.7);
  ctx.lineTo(col.x + u * 4.7, top + L.input / 2 + u * 1.7);
  ctx.stroke();
  const fx = col.x + u * 9;
  const fw = col.w - u * 19;
  roundRect(ctx, fx, top + u * 2.2, fw, L.input - u * 4.4, (L.input - u * 4.4) / 2);
  ctx.fillStyle = withAlpha(style.bgColor, 0.9);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ink, 0.15);
  ctx.lineWidth = Math.max(1, u * 0.15);
  ctx.stroke();
  ctx.save();
  roundRect(ctx, fx, top + u * 2.2, fw, L.input - u * 4.4, (L.input - u * 4.4) / 2);
  ctx.clip();
  ctx.font = `400 ${(u * 3).toFixed(1)}px ${style.mainFont}`;
  ctx.textBaseline = "middle";
  const fieldInk = textOn(style.bgColor);
  const typing = typingSide(f) === "me" && f.nextLine ? f.nextLine : null;
  if (typing) {
    // The next line typed in, character by character, before it is sent
    const p = clamp01(1 - (typing.startTime - f.timeSec) / TYPE_AHEAD);
    const chars = Array.from(typing.cleanText);
    const shown = chars.slice(0, Math.ceil(chars.length * Math.min(1, p * 1.25))).join("");
    const w = ctx.measureText(shown).width;
    // Long text scrolls left like a real field
    const room = fw - u * 6;
    const x = fx + u * 3 - Math.max(0, w - room);
    ctx.fillStyle = fieldInk;
    ctx.fillText(shown, x, top + L.input / 2);
    if (Math.floor(f.timeSec * 2.4) % 2 === 0)
      ctx.fillRect(x + w + u * 0.3, top + L.input / 2 - u * 1.6, u * 0.3, u * 3.2);
  } else {
    ctx.fillStyle = withAlpha(fieldInk, 0.4);
    ctx.fillText("메시지 입력", fx + u * 3, top + L.input / 2);
  }
  ctx.restore();
  // Send button: lights up while typing
  const sx = col.x + col.w - u * 5.2;
  ctx.fillStyle = typing ? style.accentColor : withAlpha(ink, 0.25);
  ctx.beginPath();
  ctx.arc(sx, top + L.input / 2, u * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = typing ? textOn(style.accentColor) : bar;
  ctx.beginPath();
  ctx.moveTo(sx - u * 1.3, top + L.input / 2 - u * 1.4);
  ctx.lineTo(sx + u * 1.6, top + L.input / 2);
  ctx.lineTo(sx - u * 1.3, top + L.input / 2 + u * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

interface Bubble {
  line: LyricLine | null;
  them: boolean;
  text: LaidText | null;
  w: number;
  h: number;
  /** Seconds since it was sent (the pop). */
  age: number;
  live: boolean;
}

function lyrics(f: LookFrame): void {
  const { ctx, style, H } = f;
  const L = layout(f);
  const { col, u } = L;
  const pad = u * 2.6;
  const size = u * (f.H > f.W ? 5 : 4.1) * style.fontScale;
  const maxW = col.w * 0.68;
  const karaoke = amt(f, "karaoke");
  const showTime = amt(f, "time") > 0;

  const lay = (line: LyricLine, elapsed: number) =>
    layLine(f, ctx, line, elapsed, {
      size,
      weight: 600,
      family: style.mainFont,
      maxW: maxW - pad * 2,
      maxRows: 5,
      leading: 1.32,
    });

  const bubbles: Bubble[] = [];
  const add = (line: LyricLine, live: boolean) => {
    const elapsed = f.timeSec - line.startTime;
    const text = lay(line, live ? elapsed : 1e6);
    bubbles.push({
      line,
      them: fromThem(f, line),
      text,
      w: text.widest + pad * 2,
      h: text.rows.length * text.rowH + pad * 1.5,
      age: elapsed,
      live,
    });
  };
  for (const l of f.recent ?? []) add(l, false);
  if (f.line) add(f.line, true);
  for (const o of f.overlaps ?? []) add(o, true);
  if (typingSide(f) === "them")
    bubbles.push({ line: null, them: true, text: null, w: u * 15, h: u * 9, age: 0, live: true });
  if (bubbles.length === 0) return;

  // Newest at the bottom; the whole pile slides up as the newest one pops in
  const gapY = u * 1.6;
  const stamp = showTime ? u * 3 : 0;
  const newest = bubbles[bubbles.length - 1];
  const slide = newest.line ? 1 - easeOut(newest.age / 0.28) : 0;
  let y = H - L.input - u * 2.5 + slide * (newest.h + gapY + stamp);

  ctx.save();
  ctx.beginPath();
  ctx.rect(col.x, L.header, col.w, H - L.header - L.input);
  ctx.clip();
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    const top = y - b.h - stamp;
    if (y < L.header) break;
    const side = b.them ? col.x + u * (b.line ? 10.5 : 10.5) : col.x + col.w - u * 3 - b.w;
    const fill = b.them ? style.secondaryColor : style.accentColor;
    const ink = textOn(fill);
    const pop = b.line
      ? b.age < 0.4
        ? popAt(b.age, 0.34)
        : 1
      : popAt(f.timeSec - (f.nextLine!.startTime - TYPE_AHEAD), 0.3);
    const ox = b.them ? side : side + b.w;
    ctx.save();
    ctx.translate(ox, top + b.h);
    ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop));
    ctx.translate(-ox, -(top + b.h));
    ctx.globalAlpha = clamp01(pop * 1.4);
    // Bubble with a small tail at its bottom corner
    roundRect(ctx, side, top, b.w, b.h, u * 3.4);
    ctx.fillStyle = fill;
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = u * 1.2;
    ctx.shadowOffsetY = u * 0.3;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    if (b.them) {
      ctx.moveTo(side + u * 1.2, top + b.h - u * 3);
      ctx.quadraticCurveTo(side - u * 0.4, top + b.h, side - u * 1.6, top + b.h + u * 0.2);
      ctx.quadraticCurveTo(side + u * 2.4, top + b.h + u * 0.4, side + u * 4, top + b.h - u * 0.6);
    } else {
      const r = side + b.w;
      ctx.moveTo(r - u * 1.2, top + b.h - u * 3);
      ctx.quadraticCurveTo(r + u * 0.4, top + b.h, r + u * 1.6, top + b.h + u * 0.2);
      ctx.quadraticCurveTo(r - u * 2.4, top + b.h + u * 0.4, r - u * 4, top + b.h - u * 0.6);
    }
    ctx.fill();
    if (b.text) {
      ctx.font = `600 ${b.text.size.toFixed(2)}px ${style.mainFont}`;
      drawLaid(ctx, b.text, side + pad, top + pad * 0.75, {
        color: ink,
        accent: ink,
        // Sung words full, the rest of the live line a little lighter
        waiting: b.live ? 1 - 0.55 * karaoke : 1,
        mark: withAlpha(b.them ? style.accentColor : style.secondaryColor, 0.45),
        accentWeight: 900,
        family: style.mainFont,
      });
    } else {
      // Typing dots
      for (let d = 0; d < 3; d++) {
        const k = 0.5 + 0.5 * Math.sin(f.timeSec * 7 - d * 0.9);
        ctx.fillStyle = withAlpha(ink, 0.35 + 0.5 * k);
        ctx.beginPath();
        ctx.arc(side + b.w / 2 + (d - 1) * u * 2.6, top + b.h / 2 - k * u * 0.6, u * 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (b.them && b.line) {
      // The other person's round avatar beside the bubble
      ctx.fillStyle = withAlpha(style.accentColor, 0.9 * clamp01(pop * 1.4));
      ctx.beginPath();
      ctx.arc(col.x + u * 5.2, top + u * 3.2, u * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (showTime && b.line) {
      ctx.save();
      ctx.globalAlpha = clamp01(pop) * amt(f, "time");
      ctx.font = `400 ${(u * 2.2).toFixed(1)}px ${style.mainFont}`;
      ctx.fillStyle = withAlpha(textOn(style.bgColor), 0.65);
      ctx.textBaseline = "top";
      ctx.textAlign = b.them ? "left" : "right";
      ctx.fillText(clock(b.line.startTime), b.them ? side + u * 1 : side + b.w - u * 1, top + b.h + u * 0.8);
      ctx.restore();
    }
    y = top - gapY;
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  // Wide frames: a thin phone edge around the chat column
  const L = layout(f);
  if (L.col.w >= f.W || amt(f, "frame") <= 0) return;
  const { ctx } = f;
  ctx.save();
  ctx.strokeStyle = withAlpha("#0b0d10", 0.9 * amt(f, "frame"));
  ctx.lineWidth = L.u * 1.4;
  roundRect(ctx, L.col.x - L.u * 0.7, -L.u * 4, L.col.w + L.u * 1.4, f.H + L.u * 8, L.u * 5);
  ctx.stroke();
  ctx.restore();
}

export const chatRoom: LookRenderer = { scene, lyrics, overlay };
