import { amt, type LookFrame, type LookRenderer } from "./frame";
import type { Rect } from "./illustration";
import { clamp01, hash01, withAlpha } from "./noise";
import {
  drawLaid,
  drawWallpaper,
  easeOut,
  layLine,
  popAt,
  roundRect,
  screenColumn,
  textOn,
  unitOf,
} from "./screen-kit";

// Social feed post: one post of a picture feed, with the song's picture as the
// photo and the sung line set big on it. The heart fills and pops on every
// marked word and " !" line, the like count climbs with the song, the caption
// keeps the line before, and small hearts float up the side on the hits.

interface Post {
  card: Rect;
  head: number;
  media: Rect;
  u: number;
}

function post(f: LookFrame): Post {
  const col = screenColumn(f, 0.58);
  const u = unitOf(f);
  const portrait = col.w === f.W;
  const w = portrait ? col.w : col.w;
  const head = u * 10;
  const mediaH = Math.min(w, f.H * (portrait ? 0.62 : 0.6));
  const actions = u * 9;
  const caption = u * 15;
  const total = head + mediaH + actions + caption;
  // Upright: under the app's top bar, the comments below; wide: a card in the middle
  const y = portrait ? u * 12 : Math.max(0, (f.H - total) / 2);
  return { card: { x: col.x, y, w, h: total }, head, media: { x: col.x, y: y + head, w, h: mediaH }, u };
}

/** Times the heart pops: each marked word and each " !" line start, up to now. */
function hitsUntil(f: LookFrame): number[] {
  const out: number[] = [];
  for (const l of [...(f.recent ?? []), ...(f.line ? [f.line] : [])]) {
    if ((l.lineStyle.flash ?? 0) > 0) out.push(l.startTime);
    for (const w of l.words) if (w.isAccent) out.push(l.startTime + w.startOffset);
  }
  return out.filter((t) => t <= f.timeSec);
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const P = post(f);
  // Behind the post: the picture blurred and dimmed on wide frames, the app color when upright
  if (P.card.w < W) {
    drawWallpaper(f, { x: 0, y: 0, w: W, h: H }, style.bgColor, style.secondaryColor, P.u * 2.4);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = style.bgColor;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  roundRect(ctx, P.card.x, P.card.y, P.card.w, P.card.h, P.card.w < W ? P.u * 2.4 : 0);
  ctx.fillStyle = style.bgColor;
  ctx.fill();
  ctx.clip();
  // The photo: a slow push in, like a feed video
  const zoom = 1 + 0.04 * (0.5 - 0.5 * Math.cos(f.timeSec * 0.25)) * amt(f, "zoom");
  ctx.save();
  ctx.beginPath();
  ctx.rect(P.media.x, P.media.y, P.media.w, P.media.h);
  ctx.clip();
  const cx = P.media.x + P.media.w / 2;
  const cy = P.media.y + P.media.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);
  drawWallpaper(f, P.media, style.accentColor, style.secondaryColor);
  f.beforeCharacter?.();
  // A soft shade behind where the line sits
  const g = ctx.createLinearGradient(0, P.media.y, 0, P.media.y + P.media.h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${(0.45 * amt(f, "shade")).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(P.media.x, P.media.y, P.media.w, P.media.h);
  ctx.restore();
  ctx.restore();
  chrome(f, P);
}

function heartPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.85);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.15, x - r * 0.55, y - r * 1.25, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.55, y - r * 1.25, x + r * 1.5, y - r * 0.15, x, y + r * 0.85);
  ctx.closePath();
}

function chrome(f: LookFrame, P: Post): void {
  const { ctx, style } = f;
  const { u, card } = P;
  const ink = textOn(style.bgColor);
  const name = style.coverCredit?.trim() || style.coverTitle?.trim() || "my_song";
  ctx.save();
  if (card.w === f.W && card.y > 0) {
    // App top bar: the song title as the feed name, a heart and a message icon
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.font = `800 ${(u * 4.2).toFixed(1)}px ${style.mainFont}`;
    ctx.fillText(style.coverTitle?.trim() || "피드", card.x + u * 3.5, card.y / 2 + u * 0.5, card.w * 0.6);
    ctx.strokeStyle = ink;
    ctx.lineWidth = u * 0.45;
    heartPath(ctx as CanvasRenderingContext2D, card.x + card.w - u * 13, card.y / 2 + u * 0.5, u * 2);
    ctx.stroke();
    roundRect(ctx, card.x + card.w - u * 7.5, card.y / 2 - u * 1.4, u * 4, u * 3.6, u * 1);
    ctx.stroke();
  }
  // Header: avatar with a color ring, name, "now", menu dots
  const hy = card.y + P.head / 2;
  const ax = card.x + u * 5.5;
  ctx.strokeStyle = style.accentColor;
  ctx.lineWidth = u * 0.55;
  ctx.beginPath();
  ctx.arc(ax, hy, u * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = style.secondaryColor;
  ctx.beginPath();
  ctx.arc(ax, hy, u * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  ctx.font = `700 ${(u * 3).toFixed(1)}px ${style.mainFont}`;
  ctx.fillText(name, ax + u * 5, hy, card.w - u * 22);
  const nw = Math.min(ctx.measureText(name).width, card.w - u * 22);
  ctx.font = `400 ${(u * 2.6).toFixed(1)}px ${style.mainFont}`;
  ctx.fillStyle = withAlpha(ink, 0.55);
  ctx.fillText("· 방금", ax + u * 6 + nw, hy);
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(card.x + card.w - u * 4 + i * u * 1.3, hy, u * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Action row
  const ay = P.media.y + P.media.h + u * 4.5;
  const hits = hitsUntil(f);
  const last = hits.length ? hits[hits.length - 1] : -1;
  const sinceHit = last >= 0 ? f.timeSec - last : 99;
  const liked = hits.length > 0;
  const pop = sinceHit < 0.5 ? popAt(sinceHit, 0.35) : 1;
  const hr = u * 2.1 * (sinceHit < 0.5 ? 0.6 + 0.4 * pop + 0.25 * (1 - clamp01(sinceHit / 0.5)) : 1);
  const hx = card.x + u * 5;
  heartPath(ctx as CanvasRenderingContext2D, hx, ay, hr);
  if (liked) {
    ctx.fillStyle = style.accentColor;
    ctx.fill();
  } else {
    ctx.strokeStyle = ink;
    ctx.lineWidth = u * 0.45;
    ctx.stroke();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = u * 0.45;
  ctx.lineJoin = "round";
  // Speech bubble
  const bx = card.x + u * 12;
  ctx.beginPath();
  ctx.arc(bx, ay, u * 2, 0.35 * Math.PI, 2.25 * Math.PI);
  ctx.lineTo(bx - u * 2.2, ay + u * 2.3);
  ctx.closePath();
  ctx.stroke();
  // Paper plane
  const px = card.x + u * 19;
  ctx.beginPath();
  ctx.moveTo(px - u * 2, ay - u * 1.6);
  ctx.lineTo(px + u * 2.2, ay - u * 1.8);
  ctx.lineTo(px + u * 0.2, ay + u * 2);
  ctx.lineTo(px - u * 0.3, ay - u * 0.2);
  ctx.closePath();
  ctx.stroke();
  // Bookmark
  const kx = card.x + card.w - u * 5;
  ctx.beginPath();
  ctx.moveTo(kx - u * 1.5, ay - u * 2);
  ctx.lineTo(kx + u * 1.5, ay - u * 2);
  ctx.lineTo(kx + u * 1.5, ay + u * 2);
  ctx.lineTo(kx, ay + u * 0.8);
  ctx.lineTo(kx - u * 1.5, ay + u * 2);
  ctx.closePath();
  ctx.stroke();

  // Likes climb through the song, a jump on each hit
  const span = Math.max(1, f.songEnd);
  const likes = Math.round(120 + 9800 * clamp01(f.timeSec / span) + hits.length * 37);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `700 ${(u * 2.8).toFixed(1)}px ${style.mainFont}`;
  ctx.fillText(`좋아요 ${likes.toLocaleString("ko-KR")}개`, card.x + u * 3, ay + u * 6.5);

  // Caption: the name and the line before; then the comment count
  const prev = (f.recent ?? [])[(f.recent ?? []).length - 1];
  if (amt(f, "caption") > 0) {
    const cy = ay + u * 10.5;
    ctx.font = `700 ${(u * 2.8).toFixed(1)}px ${style.mainFont}`;
    ctx.fillText(name, card.x + u * 3, cy, card.w * 0.4);
    const n = Math.min(ctx.measureText(name).width, card.w * 0.4);
    ctx.font = `400 ${(u * 2.8).toFixed(1)}px ${style.mainFont}`;
    ctx.fillText(prev?.cleanText ?? "♪", card.x + u * 4 + n, cy, card.w - n - u * 8);
    ctx.fillStyle = withAlpha(ink, 0.5);
    ctx.font = `400 ${(u * 2.5).toFixed(1)}px ${style.mainFont}`;
    ctx.fillText(`댓글 ${(f.recent?.length ?? 0) * 3 + 12}개 모두 보기`, card.x + u * 3, cy + u * 4);
    // Upright frames have room below the post: the earlier lines as comments, newest at the top
    if (f.H > f.W) {
      const older = (f.recent ?? []).slice(0, -1).reverse().slice(0, 4);
      let y = cy + u * 10;
      older.forEach((l, i) => {
        if (y > f.H - u * 4) return;
        ctx.globalAlpha = 1 - i * 0.18;
        ctx.fillStyle = i % 2 ? style.secondaryColor : style.accentColor;
        ctx.beginPath();
        ctx.arc(card.x + u * 5, y - u * 0.9, u * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.font = `700 ${(u * 2.5).toFixed(1)}px ${style.mainFont}`;
        const who = i % 2 ? "listener" : name;
        ctx.fillText(who, card.x + u * 9, y - u * 1.8, card.w * 0.35);
        ctx.font = `400 ${(u * 2.8).toFixed(1)}px ${style.mainFont}`;
        ctx.fillText(l.cleanText, card.x + u * 9, y + u * 1.6, card.w - u * 14);
        y += u * 8;
      });
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // Hearts floating up the right of the photo after each hit
  const float = amt(f, "hearts");
  if (float > 0) {
    ctx.save();
    for (const t of hits.slice(-12)) {
      for (let k = 0; k < 3; k++) {
        const age = f.timeSec - t - k * 0.12;
        if (age < 0 || age > 2.2) continue;
        const p = age / 2.2;
        const x =
          P.media.x +
          P.media.w -
          u * (6 + 4 * hash01(Math.round(t * 100), k)) +
          Math.sin(age * 4 + k) * u * 1.5;
        const y = P.media.y + P.media.h - u * 3 - p * P.media.h * 0.7;
        ctx.globalAlpha = float * (1 - p) * clamp01(age / 0.15);
        heartPath(ctx as CanvasRenderingContext2D, x, y, u * (1.6 + k * 0.4));
        ctx.fillStyle = k === 1 ? style.secondaryColor : style.accentColor;
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function lyrics(f: LookFrame): void {
  const { ctx, style } = f;
  const P = post(f);
  const line = f.line;
  if (line) {
    const { u, media } = P;
    const laid = layLine(f, ctx, line, f.lineElapsed, {
      size: u * 6.4 * style.fontScale * (line.isBigLine ? 1.15 : 1),
      weight: 800,
      family: style.mainFont,
      maxW: media.w - u * 10,
      maxRows: 4,
      leading: 1.18,
    });
    const h = laid.rows.length * laid.rowH;
    const fadeOut = clamp01((line.endTime - f.timeSec) / 0.25);
    ctx.save();
    ctx.beginPath();
    ctx.rect(media.x, media.y, media.w, media.h);
    ctx.clip();
    ctx.globalAlpha = fadeOut;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = u * 1.6;
    ctx.shadowOffsetY = u * 0.3;
    ctx.font = `800 ${laid.size.toFixed(2)}px ${style.mainFont}`;
    drawLaid(
      ctx,
      laid,
      media.x + u * 5,
      media.y + media.h - h - u * 6 + (1 - easeOut(f.lineElapsed / 0.35)) * u * 2,
      {
        color: style.textColor,
        accent: style.accentColor,
        waiting: 0,
        rise: 0.35,
        align: "left",
        width: media.w - u * 10,
        accentWeight: 900,
        family: style.mainFont,
      },
    );
    ctx.restore();
  }
}

function overlay(): void {}

export const socialFeed: LookRenderer = { scene, lyrics, overlay };
