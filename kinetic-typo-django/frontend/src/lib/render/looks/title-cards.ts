import { easeOutBack, easeOutExpo } from "../easing";
import { amt, minSide, type LookFrame } from "./frame";
import { hash01, hashSigned, withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Opening and ending cards: the song title (and credit) shown in the theme's
// own manner before the first lyric line and after the last one. They draw
// only when a title or credit is typed, so a song without one looks as before.

export type CardKind =
  | "sticker"
  | "panel"
  | "whisper"
  | "epic"
  | "terminal"
  | "glitch"
  | "stamp"
  | "slam"
  | "label"
  | "silent"
  | "float"
  | "vertical"
  | "balloon"
  | "neon";

/** How each theme shows its title card (album jacket has its own title column). */
export const CARD_KIND: Record<Exclude<ThemedPresetId, "album_jacket">, CardKind> = {
  pop_cutout: "sticker",
  tint_panels: "panel",
  ballad_hud: "whisper",
  cinematic_fantasy: "epic",
  digital_crt: "terminal",
  dark_glitch: "glitch",
  summer_film: "stamp",
  flat_type: "slam",
  eclipse_nebula: "epic",
  mono_accent: "label",
  vintage_paper: "silent",
  pastel_dream: "float",
  crimson_ink: "vertical",
  sakura_breeze: "float",
  snow_night: "whisper",
  rain_window: "terminal",
  manga_panel: "balloon",
  deep_sea: "float",
  neon_sign: "neon",
};

interface Card {
  title: string;
  credit: string;
  /** 0..1 since the card started showing (eased by each kind). */
  p: number;
  /** Overall opacity: fades in, and out before the first line. */
  alpha: number;
  /** Seconds since the card started. */
  t: number;
  ending: boolean;
}

/** The card to show now, or null outside the opening and ending. */
export function cardAt(f: LookFrame): Card | null {
  const title = f.style.coverTitle.trim();
  const credit = f.style.coverCredit.trim();
  if (!title && !credit) return null;
  const start = f.songStart ?? Infinity;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  if (f.timeSec < start) {
    const t = Math.max(0, f.timeSec - 0.15);
    const out = Number.isFinite(start) ? clamp((start - f.timeSec) / 0.5) : 1;
    return { title, credit, t, p: clamp(t / 0.9), alpha: clamp(t / 0.35) * out, ending: false };
  }
  const endAt = f.songEnd + 0.6;
  if (f.songEnd > 0 && !f.line && f.timeSec > endAt) {
    const t = f.timeSec - endAt;
    return { title, credit, t, p: clamp(t / 0.9), alpha: clamp(t / 0.6), ending: true };
  }
  return null;
}

function fitFont(
  ctx: LookFrame["ctx"],
  text: string,
  weight: number,
  family: string,
  size: number,
  maxW: number,
): number {
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(text).width;
  const s = w > maxW && w > 0 ? (size * maxW) / w : size;
  ctx.font = `${weight} ${s}px ${family}`;
  return s;
}

/** Draws the theme's opening or ending card when there is one this frame. */
export function drawTitleCard(f: LookFrame, kind: CardKind): void {
  const amount = amt(f, "opening");
  if (amount <= 0 || f.mixed) return;
  const card = cardAt(f);
  if (!card || card.alpha <= 0) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const main = card.title || card.credit;
  const sub = card.title ? card.credit : "";
  const big = s * (card.ending ? 0.07 : 0.1) * (0.7 + amount * 0.3);
  const cx = W / 2;
  const cy = H * 0.46;
  const maxW = W * 0.8;
  const e = easeOutExpo(card.p);
  ctx.save();
  ctx.globalAlpha = card.alpha * Math.min(1, 0.4 + amount);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const subLine = (y: number, color: string, family = style.accentFont, size = big * 0.32) => {
    if (!sub) return;
    fitFont(ctx, sub, 500, family, size, maxW);
    ctx.fillStyle = color;
    ctx.fillText(sub, cx, y);
  };
  switch (kind) {
    case "sticker": {
      const sc = easeOutBack(Math.min(1, card.t / 0.5));
      ctx.translate(cx, cy);
      ctx.rotate(-0.06);
      ctx.scale(sc, sc);
      const size = fitFont(ctx, main, 900, style.mainFont, big, maxW * 0.85);
      const w = ctx.measureText(main).width + size;
      ctx.fillStyle = style.secondaryColor;
      ctx.strokeStyle = style.textColor;
      ctx.lineWidth = Math.max(2, s * 0.006);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -size * 0.85, w, size * 1.7, size * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.accentColor;
      ctx.fillText(main, 0, 0);
      ctx.rotate(0.06);
      ctx.translate(-cx, -cy);
      subLine(cy + size * 1.4, style.textColor);
      break;
    }
    case "panel": {
      const size = fitFont(ctx, main, 700, style.mainFont, big * 0.8, maxW);
      const lw = Math.min(maxW, ctx.measureText(main).width * 1.2) * e;
      ctx.fillStyle = withAlpha(style.accentColor, 0.9);
      ctx.fillRect(cx - lw / 2, cy - size * 0.95, lw, Math.max(1, s * 0.003));
      ctx.fillRect(cx - lw / 2, cy + size * 0.95, lw, Math.max(1, s * 0.003));
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - lw / 2, cy - size, lw, size * 2);
      ctx.clip();
      ctx.fillStyle = style.textColor;
      ctx.fillText(main, cx, cy);
      ctx.restore();
      subLine(cy + size * 1.5, style.secondaryColor, "'JetBrains Mono', monospace", big * 0.24);
      break;
    }
    case "whisper": {
      (ctx as CanvasRenderingContext2D).letterSpacing = `${big * 0.25 * (1.6 - e * 0.6)}px`;
      const size = fitFont(ctx, `- ${main} -`, 500, style.mainFont, big * 0.6, maxW);
      ctx.shadowColor = withAlpha(style.accentColor, 0.8);
      ctx.shadowBlur = size * 0.8;
      ctx.fillStyle = style.textColor;
      ctx.fillText(`- ${main} -`, cx, cy);
      ctx.shadowBlur = 0;
      (ctx as CanvasRenderingContext2D).letterSpacing = "0px";
      subLine(cy + size * 1.4, withAlpha(style.textColor, 0.75));
      break;
    }
    case "epic": {
      const sc = 1.08 - 0.08 * easeOutExpo(Math.min(1, card.t / 3));
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      (ctx as CanvasRenderingContext2D).letterSpacing = `${big * 0.3}px`;
      const size = fitFont(ctx, main, 600, style.mainFont, big, maxW);
      ctx.shadowColor = style.accentColor;
      ctx.shadowBlur = size * 0.9;
      ctx.fillStyle = style.textColor;
      ctx.fillText(main, 0, 0);
      ctx.shadowBlur = 0;
      const lw = ctx.measureText(main).width * 0.6 * e;
      ctx.fillStyle = withAlpha(style.accentColor, 0.8);
      ctx.fillRect(-lw / 2, size * 0.8, lw, Math.max(1, s * 0.002));
      (ctx as CanvasRenderingContext2D).letterSpacing = "0px";
      ctx.translate(-0, size * 1.35);
      if (sub) {
        fitFont(ctx, sub, 500, style.accentFont, big * 0.3, maxW);
        ctx.fillStyle = withAlpha(style.secondaryColor, 0.9);
        ctx.fillText(sub, 0, 0);
      }
      break;
    }
    case "terminal": {
      const mono = "'JetBrains Mono', monospace";
      const text = `> ${main}`;
      const chars = Array.from(text);
      const n = Math.min(chars.length, Math.floor(card.t / 0.06));
      const size = fitFont(ctx, text, 600, mono, big * 0.6, maxW);
      const full = ctx.measureText(text).width;
      ctx.textAlign = "left";
      const x = cx - full / 2;
      const shown = chars.slice(0, n).join("");
      ctx.fillStyle = style.secondaryColor;
      ctx.fillText(shown, x, cy);
      if (Math.floor(card.t * 2.5) % 2 === 0)
        ctx.fillRect(x + ctx.measureText(shown).width + size * 0.1, cy - size * 0.5, size * 0.5, size);
      if (sub && n >= chars.length) {
        fitFont(ctx, `// ${sub}`, 400, mono, big * 0.25, maxW);
        ctx.fillStyle = withAlpha(style.textColor, 0.7);
        ctx.fillText(`// ${sub}`, x, cy + size * 1.4);
      }
      break;
    }
    case "glitch": {
      const text = `[ ${main} ]`;
      const size = fitFont(ctx, text, 700, style.mainFont, big * 0.8, maxW);
      const tick = Math.floor(card.t * 12);
      const off =
        (f.style.noVibration ? 0 : 1) * (card.p < 1 || hash01(tick, 501) < 0.15 ? size * 0.08 : size * 0.02);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,40,80,0.9)";
      ctx.fillText(text, cx - off, cy + hashSigned(tick, 502) * off * 0.3);
      ctx.fillStyle = "rgba(40,200,255,0.9)";
      ctx.fillText(text, cx + off, cy);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = style.textColor;
      ctx.fillText(text, cx, cy);
      subLine(cy + size * 1.3, withAlpha(style.textColor, 0.6), "'JetBrains Mono', monospace", big * 0.22);
      break;
    }
    case "stamp": {
      const drop = (1 - easeOutBack(Math.min(1, card.t / 0.6))) * H * 0.1;
      const size = fitFont(ctx, main, 800, style.mainFont, big, maxW);
      ctx.translate(0, -drop);
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = style.accentColor;
      ctx.strokeText(main, cx, cy);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(main, cx, cy);
      ctx.translate(0, drop);
      if (sub) {
        const sz = fitFont(ctx, sub, 700, style.accentFont, big * 0.3, maxW);
        const w = ctx.measureText(sub).width + sz;
        ctx.fillStyle = style.secondaryColor;
        ctx.fillRect(cx - w / 2, cy + size * 0.95, w * e, sz * 1.5);
        ctx.fillStyle = style.accentColor;
        ctx.fillText(sub, cx, cy + size * 0.95 + sz * 0.75);
      }
      break;
    }
    case "slam": {
      const sc = 1 + (1 - easeOutExpo(Math.min(1, card.t / 0.35))) * 1.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      const size = fitFont(ctx, main, 900, style.mainFont, s * 0.22, W * 0.92);
      ctx.fillStyle = style.textColor;
      ctx.fillText(main, 0, 0);
      ctx.restore();
      if (sub) {
        const sz = fitFont(ctx, sub, 700, style.accentFont, size * 0.2, maxW);
        const w = ctx.measureText(sub).width + sz;
        ctx.fillStyle = style.accentColor;
        ctx.fillRect(cx - w / 2, cy + size * 0.65, w, sz * 1.5);
        ctx.fillStyle = style.textColor;
        ctx.fillText(sub, cx, cy + size * 0.65 + sz * 0.75);
      }
      break;
    }
    case "label": {
      const size = fitFont(ctx, main, 900, style.mainFont, big * 0.85, maxW);
      const w = ctx.measureText(main).width + size;
      ctx.fillStyle = style.accentColor;
      ctx.fillRect(cx - w / 2, cy - size * 0.75, w * e, size * 1.5);
      ctx.fillStyle = "#111111";
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - w / 2, cy - size, w * e, size * 2);
      ctx.clip();
      ctx.fillText(main, cx, cy);
      ctx.restore();
      subLine(cy + size * 1.4, style.textColor);
      break;
    }
    case "silent": {
      const size = fitFont(ctx, main, 600, style.mainFont, big * 0.75, maxW * 0.7);
      const w = Math.max(ctx.measureText(main).width + size * 2, W * 0.4);
      const h = size * (sub ? 4 : 3);
      ctx.fillStyle = "rgba(20,14,8,0.85)";
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.strokeStyle = "rgba(243,230,200,0.85)";
      ctx.lineWidth = Math.max(1, s * 0.003);
      ctx.strokeRect(cx - w / 2 + size * 0.3, cy - h / 2 + size * 0.3, w - size * 0.6, h - size * 0.6);
      ctx.fillStyle = "#f3e6c8";
      ctx.fillText(main, cx, sub ? cy - size * 0.4 : cy);
      if (sub) {
        fitFont(ctx, sub, 400, style.mainFont, size * 0.45, w * 0.8);
        ctx.fillText(sub, cx, cy + size * 0.7);
      }
      break;
    }
    case "float": {
      const rise = (1 - e) * s * 0.06 + Math.sin(card.t * 1.4) * s * 0.006;
      const size = fitFont(ctx, main, 700, style.mainFont, big * 0.85, maxW);
      ctx.translate(0, rise);
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = withAlpha("#ffffff", 0.85);
      ctx.strokeText(main, cx, cy);
      ctx.fillStyle = style.textColor;
      ctx.fillText(main, cx, cy);
      subLine(cy + size * 1.25, withAlpha(style.textColor, 0.8));
      break;
    }
    case "vertical": {
      const chars = Array.from(main);
      const size = Math.min(big * 0.9, (H * 0.7) / Math.max(1, chars.length));
      ctx.font = `700 ${size}px ${style.mainFont}`;
      const x = W * 0.62;
      const top = H / 2 - (chars.length * size * 1.1) / 2;
      ctx.shadowColor = style.accentColor;
      ctx.shadowBlur = size * 0.6;
      chars.forEach((ch, i) => {
        const a = Math.min(1, Math.max(0, card.t * 3 - i * 0.4));
        ctx.globalAlpha = card.alpha * a;
        ctx.fillStyle = style.textColor;
        ctx.fillText(ch, x, top + size * (0.5 + i * 1.1));
      });
      ctx.shadowBlur = 0;
      ctx.globalAlpha = card.alpha * e;
      // A red seal under the title
      const seal = size * 0.9;
      ctx.fillStyle = style.accentColor;
      ctx.fillRect(x - seal / 2, top + chars.length * size * 1.1 + size * 0.3, seal, seal);
      if (sub) {
        const subChars = Array.from(sub).slice(0, 18);
        const ss = size * 0.4;
        ctx.font = `500 ${ss}px ${style.mainFont}`;
        ctx.fillStyle = withAlpha(style.textColor, 0.8);
        subChars.forEach((ch, i) => ctx.fillText(ch, x - size * 1.3, top + ss * (0.5 + i * 1.15)));
      }
      break;
    }
    case "balloon": {
      const size = fitFont(ctx, main, 900, style.mainFont, big * 0.8, maxW * 0.7);
      const sc = easeOutBack(Math.min(1, card.t / 0.4));
      const w = ctx.measureText(main).width + size * 1.6;
      const h = size * 2.4;
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = Math.max(2, s * 0.006);
      ctx.beginPath();
      // Spiky shout balloon
      const spikes = 18;
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i / (spikes * 2)) * Math.PI * 2;
        const k = i % 2 ? 0.82 : 1.06 + hash01(i, 511) * 0.08;
        ctx.lineTo(Math.cos(ang) * (w / 2) * k, Math.sin(ang) * (h / 2) * k);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111111";
      ctx.fillText(main, 0, sub ? -size * 0.2 : 0);
      if (sub) {
        fitFont(ctx, sub, 600, style.accentFont, size * 0.32, w * 0.7);
        ctx.fillStyle = style.accentColor;
        ctx.fillText(sub, 0, size * 0.65);
      }
      break;
    }
    case "neon": {
      const tick = Math.floor(card.t * 14);
      const flick = card.t < 0.8 ? (hash01(tick, 521) < 0.5 ? 0.2 : 1) : hash01(tick, 522) < 0.03 ? 0.4 : 1;
      const size = fitFont(ctx, main, 600, style.mainFont, big, maxW);
      ctx.globalAlpha = card.alpha * flick;
      ctx.lineJoin = "round";
      ctx.shadowColor = style.accentColor;
      ctx.shadowBlur = size * 0.6;
      ctx.lineWidth = size * 0.08;
      ctx.strokeStyle = style.accentColor;
      ctx.strokeText(main, cx, cy);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(main, cx, cy);
      if (sub) {
        ctx.shadowColor = style.secondaryColor;
        fitFont(ctx, sub, 500, style.accentFont, size * 0.32, maxW);
        ctx.fillStyle = style.secondaryColor;
        ctx.fillText(sub, cx, cy + size * 1.2);
      }
      break;
    }
  }
  ctx.restore();
}

/** The picked lyric theme's card (none for the album jacket, which has its own title). */
export function drawThemeTitleCard(f: LookFrame): void {
  if (f.preset === "album_jacket") return;
  drawTitleCard(f, CARD_KIND[f.preset]);
}
