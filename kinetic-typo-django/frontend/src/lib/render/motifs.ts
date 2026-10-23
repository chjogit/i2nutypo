import type { MotifId } from "@/types/project";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface MotifContext {
  ctx: Ctx2D;
  motif: MotifId;
  W: number;
  H: number;
  timeSec: number;
  curAccent: string;
  bgColor: string;
  energy: number;
  isFlashFrame: boolean;
}

/** Background graphics for each of the collab styles. bokeh_scope is drawn by the particle layer. */
export function drawCollabMotif({
  ctx,
  motif,
  W,
  H,
  timeSec,
  curAccent,
  bgColor,
  energy,
  isFlashFrame,
}: MotifContext): void {
  ctx.save();
  switch (motif) {
    case "starburst_flash": {
      // Rotating starburst rays that grow on the beat
      ctx.translate(W * 0.78, H * 0.32);
      ctx.rotate(timeSec * 0.8);
      ctx.strokeStyle = isFlashFrame ? "#16263b" : curAccent + "88";
      ctx.lineWidth = 2.5;
      for (let r = 0; r < 12; r++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(38 + energy * 35, 0);
        ctx.stroke();
      }
      break;
    }
    case "bracket_scope": {
      // Wandering spotlight with a scope crosshair
      const scopeX = W * 0.5 + Math.sin(timeSec * 2) * (W * 0.16);
      const scopeY = H * 0.48 + Math.cos(timeSec * 1.5) * (H * 0.06);
      const rad = Math.min(W, H) * 0.22;
      const grad = ctx.createRadialGradient(scopeX, scopeY, 5, scopeX, scopeY, rad);
      grad.addColorStop(0, "rgba(96, 165, 250, 0.22)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(scopeX, scopeY, rad, 0, Math.PI * 2);
      ctx.fill();

      const cx = scopeX + rad * 0.45;
      const cy = scopeY - rad * 0.15;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, Math.PI * 2);
      ctx.moveTo(cx - 48, cy);
      ctx.lineTo(cx + 48, cy);
      ctx.moveTo(cx, cy - 48);
      ctx.lineTo(cx, cy + 48);
      ctx.stroke();
      break;
    }
    case "dark_chain": {
      // Diagonal dashed chains crossing the screen
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 5;
      ctx.setLineDash([18, 10]);
      ctx.beginPath();
      ctx.moveTo(W * 0.15, 0);
      ctx.lineTo(W * 0.85, H);
      ctx.moveTo(W * 0.85, 0);
      ctx.lineTo(W * 0.15, H);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "grid_timeline": {
      // Editorial grid plus a horizontal accent line
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      const step = Math.round(W / 6);
      for (let x = step; x < W; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.strokeStyle = curAccent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.68);
      ctx.lineTo(W, H * 0.68);
      ctx.stroke();
      break;
    }
    case "lockscreen_ui": {
      // Faint 12:ss clock and a glass notification box behind the lyric
      ctx.font = `700 ${Math.round(H * 0.13)}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.textAlign = "center";
      const sec = Math.floor(timeSec % 60);
      ctx.fillText(`12:${String(sec).padStart(2, "0")}`, W * 0.5, H * 0.25);

      const boxW = W * 0.76;
      const boxH = H * 0.26;
      ctx.fillStyle = "rgba(30, 41, 59, 0.45)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect((W - boxW) / 2, (H - boxH) / 2, boxW, boxH, 24);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "yoha_moon_card": {
      // Rocking square frame around a crescent moon
      const r = Math.min(W, H) * 0.21;
      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate(Math.sin(timeSec * 1.2) * 0.18);
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 3;
      ctx.strokeRect(-r * 1.25, -r * 1.25, r * 2.5, r * 2.5);
      ctx.fillStyle = "rgba(250, 204, 21, 0.22)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.arc(r * 0.28, -r * 0.18, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "vortex_tunnel": {
      // Concentric rings expanding from the center
      for (let ring = 1; ring <= 6; ring++) {
        const rad = (timeSec * 90 + ring * 65) % (Math.max(W, H) * 0.55);
        ctx.strokeStyle = `rgba(251, 191, 36, ${Math.max(0.04, 0.28 - rad / W)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.5, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "neon_godray": {
      // Moonlight beam from the top left
      const rayGrad = ctx.createLinearGradient(0, 0, W * 0.65, H * 0.85);
      rayGrad.addColorStop(0, "rgba(56, 189, 248, 0.28)");
      rayGrad.addColorStop(1, "transparent");
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * 0.42, 0);
      ctx.lineTo(W * 0.85, H);
      ctx.lineTo(W * 0.15, H);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "analog_notebook": {
      // Notebook ruling
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      for (let y = H * 0.22; y < H * 0.82; y += H * 0.12) {
        ctx.beginPath();
        ctx.moveTo(W * 0.12, y);
        ctx.lineTo(W * 0.88, y);
        ctx.stroke();
      }
      break;
    }
    case "film_shards": {
      // Scrolling film strip perforations on both edges
      const stripW = W * 0.07;
      ctx.fillStyle = "rgba(250, 204, 21, 0.85)";
      ctx.fillRect(0, 0, stripW, H);
      ctx.fillRect(W - stripW, 0, stripW, H);
      ctx.fillStyle = "#0b0d13";
      const scrollY = (timeSec * 80) % 52;
      for (let y = -52 + scrollY; y < H; y += 52) {
        ctx.fillRect(stripW * 0.22, y, stripW * 0.56, 26);
        ctx.fillRect(W - stripW * 0.78, y, stripW * 0.56, 26);
      }
      break;
    }
    case "bokeh_scope":
    case "moon_window":
      break;
  }
  ctx.restore();
}
