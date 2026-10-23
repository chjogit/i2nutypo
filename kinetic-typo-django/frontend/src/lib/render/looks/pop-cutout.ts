import { easeOutBack } from "../easing";
import {
  amt,
  boxHeight,
  clampCenter,
  drawCharacterLayer,
  drawIllustration,
  fadeIn,
  fitWidth,
  lineExit,
  lyricRegion,
  minSide,
  type LookFrame,
  type LookRenderer,
} from "./frame";
import { hash01, hashSigned, withAlpha } from "./noise";
import { fitScale, wrapText } from "../wrap";

// A. Pop cutout: pastel flat color, bouncing SD character, mixed-size lyric block, wobbly hand-drawn frame.

/** Halftone dots fading in from the lower right corner. */
function drawHalftone(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  const halftone = amt(f, "halftone");
  if (halftone > 0) {
    const step = minSide(f) * 0.035;
    ctx.save();
    ctx.fillStyle = withAlpha(style.accentColor, 0.4 * halftone);
    for (let y = H * 0.55; y < H + step; y += step) {
      for (let x = W * 0.55; x < W + step; x += step) {
        const k = Math.min(1, ((x - W * 0.55) / (W * 0.45) + (y - H * 0.55) / (H * 0.45)) / 2);
        const r = step * 0.38 * k;
        if (r < 0.5) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function scene(f: LookFrame): void {
  const { ctx, W, H, style } = f;
  ctx.fillStyle = style.bgColor;
  ctx.fillRect(0, 0, W, H);
  if (f.images.background) {
    ctx.save();
    ctx.globalAlpha = 1 - amt(f, "wash") * 0.85;
    drawIllustration(f, { x: 0, y: 0, w: W, h: H });
    ctx.restore();
  }

  drawHalftone(f);

  const hop = Math.abs(Math.sin(f.timeSec * Math.PI * (style.bpm / 60) * 0.5)) * amt(f, "hop");
  drawCharacterLayer(f, {
    bounce: f.energy + hop * 0.8,
    tilt: Math.sin(f.timeSec * 2.1) * 0.08 * amt(f, "hop"),
  });
}

function lyrics(f: LookFrame): void {
  const line = f.line;
  if (!line) return;
  const { ctx, H, style } = f;
  const { rect: area } = lyricRegion(f, [5, 6, 9, 10, 1, 2, 4, 7, 8, 11, 13, 14, 0, 3, 12, 15]);
  let base = minSide(f) * 0.085 * style.fontScale * Math.min(1, area.w / (f.W * 0.5));
  const maxW = fitWidth(f, area.w * 0.88);
  const exit = lineExit(f, 0.08);
  const pop = amt(f, "pop");
  const outline = amt(f, "outline");

  // Each word gets its own size; the block is centered in the free area
  type Item = { text: string; size: number; w: number; accent: boolean; e: number; seed: number };
  const layout = (gap: number): Item[][] => {
    const rows: Item[][] = [[]];
    let rowW = 0;
    line.words.forEach((word, i) => {
      const seed = line.index * 31 + i;
      let size = base * (word.isAccent ? 1.45 : 0.72 + hash01(seed, 7) * 0.5);
      const measure = (t: string) => ctx.measureText(t).width;
      // A word (or spaced Japanese phrase) wider than the free space shrinks to fit whole
      ctx.font = `400 ${size}px ${style.mainFont}`;
      size *= fitScale(word.text, maxW, measure);
      ctx.font = `400 ${size}px ${style.mainFont}`;
      // Cut between characters only if it still does not fit
      const pieces = measure(word.text) > maxW ? wrapText(word.text, maxW, measure) : [word.text];
      pieces.forEach((text, k) => {
        const w = measure(text);
        const forced = k > 0 || (k === 0 && word.breakBefore);
        if ((forced || rowW + w > maxW) && rows[rows.length - 1].length > 0) {
          rows.push([]);
          rowW = 0;
        }
        rows[rows.length - 1].push({
          text,
          size,
          w,
          accent: word.isAccent,
          e: f.lineElapsed - word.startOffset,
          seed: seed + k * 101,
        });
        rowW += w + gap;
      });
    });
    return rows;
  };

  const topLimit = f.subtitleTop ? H * 0.2 : H * 0.04;
  const bottomLimit = f.subtitleVisible ? H * 0.78 : H * 0.95;
  const height = (rows: Item[][]) =>
    rows.reduce((acc, r) => acc + Math.max(...r.map((it) => it.size)) * 1.12 * boxHeight(f), 0);
  // Long lines shrink until the block fits between the subtitles and the frame edge
  let gap = base * 0.12;
  let rows = layout(gap);
  for (let i = 0; i < 6 && height(rows) > bottomLimit - topLimit; i++) {
    base *= 0.85;
    gap = base * 0.12;
    rows = layout(gap);
  }
  const total = height(rows);
  let y = Math.max(topLimit, Math.min(area.y + area.h / 2 - total / 2, bottomLimit - total));
  const widths = rows.map((row) => row.reduce((acc, it) => acc + it.w + gap, 0) - gap);
  // Pulled back on screen when the lyric shift would push it off
  const cx = clampCenter(f, area.x + area.w / 2, Math.max(...widths));
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  rows.forEach((row, r) => {
    const rowH = Math.max(...row.map((it) => it.size)) * boxHeight(f);
    let x = cx - widths[r] / 2;
    y += rowH;
    for (const it of row) {
      if (it.e >= 0) {
        const t = Math.min(1, it.e / 0.28);
        // pop 0 fades in plainly; pop 1 overshoots with a tilt
        const scale = (pop > 0 ? 1 + (easeOutBack(t) - 1) * pop * 1.4 : 1) * exit;
        ctx.save();
        ctx.globalAlpha = pop > 0 ? 1 : t;
        ctx.translate(x + it.w / 2, y - it.size * 0.35);
        ctx.rotate(hashSigned(it.seed, 3) * 0.1 * pop);
        ctx.scale(scale, scale);
        ctx.font = `400 ${it.size}px ${style.mainFont}`;
        if (outline > 0) {
          ctx.lineWidth = it.size * 0.26 * outline;
          ctx.strokeStyle = style.secondaryColor;
          ctx.strokeText(it.text, -it.w / 2, it.size * 0.35);
        }
        ctx.fillStyle = it.accent ? style.accentColor : style.textColor;
        ctx.fillText(it.text, -it.w / 2, it.size * 0.35);
        ctx.restore();
      }
      x += it.w + gap;
    }
    y += rowH * 0.12;
  });

  // Small translation in the accent color, like the English lines in the reference MVs
  const caption = !f.subtitles.enabled ? line.transText || line.pronText : "";
  if (caption) {
    ctx.font = `700 ${base * 0.32}px ${style.accentFont}`;
    ctx.fillStyle = withAlpha(style.accentColor, fadeIn(f.lineElapsed - 0.15, 0.3) * exit);
    ctx.textAlign = "center";
    ctx.fillText(caption.toUpperCase(), cx, y + base * 0.45, maxW);
  }
  ctx.restore();
}

function overlay(f: LookFrame): void {
  const frame = amt(f, "frame");
  if (frame <= 0) return;
  const { ctx, W, H, style } = f;
  // Hand-drawn border that "boils" at 8fps; strength sets wobble and weight
  const boil = Math.floor(f.timeSec * 8);
  const inset = minSide(f) * 0.035;
  const wobble = 1 + frame * 4;
  ctx.save();
  ctx.strokeStyle = style.textColor;
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass === 0 ? 2 + frame * 3 : 1 + frame;
    ctx.beginPath();
    const corners = [
      [inset, inset],
      [W - inset, inset],
      [W - inset, H - inset],
      [inset, H - inset],
    ];
    corners.forEach(([cx, cy], i) => {
      const jx = hashSigned(boil * 8 + i, pass) * wobble;
      const jy = hashSigned(boil * 8 + i + 4, pass) * wobble;
      if (i === 0) ctx.moveTo(cx + jx, cy + jy);
      else ctx.lineTo(cx + jx, cy + jy);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

export const popCutout: LookRenderer = { scene, lyrics, overlay, decor: drawHalftone };
