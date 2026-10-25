import { amt, lineExit, minSide, type LookFrame } from "./frame";
import {
  drawFireflies,
  drawGodRays,
  drawPuffClouds,
  drawRipples,
  drawSchool,
  drawShootingStars,
} from "./extras";
import { drawParticles } from "./kit";
import { withAlpha } from "./noise";

// Pictures that follow the words: when a line sings of stars, rain, flowers,
// the moon, love, fire, snow, the sea, the sun or the sky, the frame fills
// with a little of it for that line. Matching is plain substring search over
// Korean, Japanese and English words, so it needs no setup.

export type KeywordKind =
  "star" | "rain" | "flower" | "moon" | "heart" | "fire" | "snow" | "sea" | "sun" | "sky";

/** Words for each picture; short Korean words that are parts of many others are left out. */
const WORDS: Record<KeywordKind, readonly string[]> = {
  star: ["별", "星", "ほし", "star"],
  rain: ["비가", "빗", "비 내", "장마", "雨", "あめ", "rain"],
  flower: ["꽃", "벚", "花", "桜", "さくら", "flower", "blossom", "petal"],
  moon: ["달빛", "달이", "달을", "보름달", "月", "つき", "moon"],
  heart: ["사랑", "좋아해", "愛", "恋", "好き", "love", "heart"],
  fire: ["불꽃", "불이", "타오르", "火", "炎", "fire", "flame", "burn"],
  snow: ["눈이 내", "눈송이", "눈꽃", "雪", "ゆき", "snow"],
  sea: ["바다", "파도", "海", "波", "sea", "ocean", "wave"],
  sun: ["태양", "햇살", "햇빛", "太陽", "日差し", "陽", "sun"],
  sky: ["하늘", "날개", "날아", "空", "翼", "sky", "wing", "fly"],
};

const ORDER = Object.keys(WORDS) as KeywordKind[];

/** The pictures a line's words call for, at most two, in the order they are listed above. */
export function keywordKinds(text: string): KeywordKind[] {
  const t = text.toLowerCase();
  return ORDER.filter((k) => WORDS[k].some((w) => t.includes(w))).slice(0, 2);
}

const cache = new Map<string, KeywordKind[]>();
function kindsOf(text: string): KeywordKind[] {
  let hit = cache.get(text);
  if (!hit) {
    hit = keywordKinds(text);
    if (cache.size > 500) cache.clear();
    cache.set(text, hit);
  }
  return hit;
}

function drawMoonGlow(f: LookFrame, a: number): void {
  const { ctx, W, H } = f;
  const s = minSide(f);
  const x = W * 0.84;
  const y = H * 0.18;
  const r = s * 0.07;
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 4);
  g.addColorStop(0, withAlpha("#fff6d8", 0.5 * a));
  g.addColorStop(1, withAlpha("#fff6d8", 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  // A crescent: the disc drawn everywhere but inside a second, offset disc
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - r * 2, y - r * 2, r * 4, r * 4);
  ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.85, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.fillStyle = withAlpha("#fffbe8", 0.9 * a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWarmth(f: LookFrame, a: number, color: string, fromBottom: boolean): void {
  const { ctx, W, H } = f;
  const g = fromBottom
    ? ctx.createLinearGradient(0, H, 0, H * 0.5)
    : ctx.createLinearGradient(0, 0, 0, H * 0.5);
  g.addColorStop(0, withAlpha(color, 0.3 * a));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function paint(f: LookFrame, kind: KeywordKind, a: number): void {
  const { style } = f;
  switch (kind) {
    case "star":
      drawParticles(f, "star", a, "#ffffff");
      drawShootingStars(f, a, "#ffffff");
      break;
    case "rain":
      drawParticles(f, "rain", a * 0.8, "#cfe3ff");
      drawRipples(f, a, "#cfe3ff");
      break;
    case "flower":
      drawParticles(f, "petal", a, style.secondaryColor);
      break;
    case "moon":
      drawMoonGlow(f, a);
      break;
    case "heart":
      drawParticles(f, "heart", a * 1.5, style.accentColor);
      drawParticles(f, "heart", a * 0.6, "#ffffff", 1);
      break;
    case "fire":
      drawWarmth(f, a, "#ff7a2f", true);
      drawParticles(f, "ember", a * 1.2, "#ffb347");
      break;
    case "snow":
      drawParticles(f, "snow", a, "#ffffff");
      break;
    case "sea":
      drawParticles(f, "bubble", a, "#cfefff");
      drawRipples(f, a * 0.8, "#cfefff", 0.82);
      break;
    case "sun":
      drawWarmth(f, a, "#ffe08a", false);
      drawGodRays(f, a * 0.8, "#fff1c4", { x: 0.85, y: -0.1 }, 6, Math.PI * 0.65, 1);
      break;
    case "sky":
      drawPuffClouds(f, a * 0.7, "#ffffff", [0.05, 0.25]);
      drawSchool(f, a, "#ffffff", "bird");
      drawFireflies(f, a * 0.3, "#ffffff", [0.05, 0.4]);
      break;
  }
}

/** The pictures for the current line's words, faded in as the line starts and out as it ends. */
export function drawKeywordScenes(f: LookFrame): void {
  const a = amt(f, "keywords");
  const line = f.line;
  if (a <= 0 || !line || f.lineElapsed < 0) return;
  const kinds = kindsOf(line.cleanText);
  if (kinds.length === 0) return;
  const env = Math.min(1, f.lineElapsed / 0.6) * lineExit(f, 0.15);
  if (env <= 0) return;
  const { ctx } = f;
  ctx.save();
  ctx.globalAlpha *= env;
  // Particles thin out at low amounts, so the scenes run a little hot
  for (const k of kinds) paint(f, k, Math.min(1.6, a * 1.8));
  ctx.restore();
}
