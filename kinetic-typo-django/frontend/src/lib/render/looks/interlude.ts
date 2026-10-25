import { easeOutBack } from "../easing";
import { amt, minSide, type LookFrame } from "./frame";
import { withAlpha } from "./noise";
import type { ThemedPresetId } from "./presets";

// Interludes: in a long quiet stretch between lines (an instrumental break)
// the frame is not left empty. A small note drifts at the middle, and for the
// last three seconds before the singing comes back, three dots count down in
// the theme's shape, the way karaoke screens show it.

/** Gaps shorter than this pass without a mark. */
const MIN_GAP = 4;
const COUNT_SEC = 3;

type Dot = "circle" | "square" | "diamond" | "heart";

const DOT: Partial<Record<ThemedPresetId, Dot>> = {
  digital_crt: "square",
  flat_type: "square",
  mono_accent: "square",
  dark_glitch: "square",
  manga_panel: "square",
  ballad_hud: "diamond",
  tint_panels: "diamond",
  eclipse_nebula: "diamond",
  pastel_dream: "heart",
  pop_cutout: "heart",
};

function dot(f: LookFrame, kind: Dot, x: number, y: number, r: number): void {
  const { ctx } = f;
  ctx.beginPath();
  if (kind === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
  else if (kind === "diamond") {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.25, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.25, y);
    ctx.closePath();
  } else if (kind === "heart") {
    ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** An eighth note, drawn with paths so it needs no font. */
function note(f: LookFrame, x: number, y: number, size: number): void {
  const { ctx } = f;
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.32, size * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + size * 0.24, y - size, size * 0.08, size);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.32, y - size);
  ctx.quadraticCurveTo(x + size * 0.75, y - size * 0.7, x + size * 0.6, y - size * 0.35);
  ctx.quadraticCurveTo(x + size * 0.6, y - size * 0.65, x + size * 0.32, y - size * 0.75);
  ctx.fill();
}

/** The interlude note and countdown, when the theme's "interlude" element is on. */
export function drawInterlude(f: LookFrame): void {
  const gap = f.gap;
  if (!gap || f.mixed) return;
  const a = amt(f, "interlude");
  if (a <= 0) return;
  // Before the first line the title card has the screen when there is a title
  const first = gap.from < 0;
  if (first && f.style.coverTitle.trim()) return;
  const from = first ? 0 : gap.from;
  if (gap.to - from < MIN_GAP) return;
  const t = f.timeSec;
  const left = gap.to - t;
  const since = t - from;
  if (since < 0.6) return;
  const { ctx, W, H } = f;
  const s = minSide(f);
  const color = f.style.textColor;
  const k = Math.min(1, 0.35 + a);
  ctx.save();
  // The drifting note, fading in after the line has gone and out as the count begins
  const noteIn = Math.min(1, (since - 0.6) / 0.8);
  const noteOut = Math.max(0, Math.min(1, (left - COUNT_SEC) / 0.5));
  const na = noteIn * noteOut * k;
  if (na > 0) {
    ctx.fillStyle = withAlpha(color, 0.75 * na);
    const bob = f.style.noVibration ? 0 : Math.sin(t * 1.6) * s * 0.012;
    note(f, W / 2 - s * 0.02, H * 0.5 + bob, s * 0.08);
  }
  // Three dots, one going out each second
  if (left <= COUNT_SEC + 0.4) {
    const kind = DOT[f.preset] ?? "circle";
    const r = s * 0.02;
    const gapX = r * 4;
    for (let i = 0; i < 3; i++) {
      // Dot i goes out when (3 - i) seconds remain
      const goes = left - (2 - i);
      const appear = Math.min(1, (COUNT_SEC + 0.4 - left) / 0.4);
      const pop = goes > 0 ? 1 : Math.max(0, 1 + goes * 4);
      if (pop <= 0 || appear <= 0) continue;
      ctx.fillStyle = withAlpha(i === 2 ? f.style.accentColor : color, 0.95 * k * appear);
      dot(f, kind, W / 2 + (i - 1) * gapX, H * 0.5, r * easeOutBack(Math.min(1, appear)) * pop);
    }
  }
  ctx.restore();
}
