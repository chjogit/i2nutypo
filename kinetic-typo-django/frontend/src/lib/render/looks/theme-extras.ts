import { amt, minSide, withMoved, type LookFrame } from "./frame";
import {
  drawAurora,
  drawBursts,
  drawConfetti,
  drawDustMotes,
  drawFireflies,
  drawFloatingShapes,
  drawFog,
  drawGiantWord,
  drawGlassTrails,
  drawGlints,
  drawGodRays,
  drawInkSplatter,
  drawJellyfish,
  drawLightning,
  drawMarquee,
  drawProjectorFlicker,
  drawPuffClouds,
  drawPulseRings,
  drawRipples,
  drawSchool,
  drawSfxWords,
  drawShine,
  drawShootingStars,
  drawSparks,
  drawSpeedStreaks,
  drawStarField,
  drawWetReflection,
  drawWindLines,
  withEcho,
} from "./extras";
import { drawParticles } from "./kit";
import { hash01, withAlpha } from "./noise";
import { LOOK_ELEMENTS, type ThemedPresetId } from "./presets";
import { drawClimax } from "./climax";
import { drawKeywordScenes } from "./keyword-scenes";
import { drawLineWipe, WIPE_THEMES } from "./line-wipes";
import { drawBeatPulse } from "./beat-pulse";
import { drawBgPattern } from "./generative-bg";

// The extra elements each theme got for a richer picture, kept apart from the
// theme files: `back` is drawn behind the character (or over the background
// theme when the theme is mixed in), `front` over the lyrics but under the
// theme's own overlay (letterbox, vignette), and `lyrics` wraps the lyric
// drawing (echoes, printed shadows). Each reads its element strength with amt,
// so a switched-off element draws nothing.

export interface ThemeExtras {
  back?: (f: LookFrame) => void;
  /** Over the picture and the illustrations behind the lyrics, under the lyrics. */
  mid?: (f: LookFrame) => void;
  front?: (f: LookFrame) => void;
  lyrics?: (f: LookFrame, draw: () => void) => void;
}

/** A printed drop shadow under whatever `draw` paints (themes without their own glow). */
function blockShadow(f: LookFrame, amount: number, color: string, draw: () => void): void {
  if (amount <= 0) {
    draw();
    return;
  }
  const { ctx } = f;
  const d = minSide(f) * 0.008 * (0.5 + amount);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = d;
  ctx.shadowOffsetY = d;
  draw();
  ctx.restore();
}

const echo = (f: LookFrame, draw: () => void, dir?: { x: number; y: number }) =>
  withEcho(f, amt(f, "echo"), draw, dir);

/** A big moon low in the sky, tinted by the theme (crimson ink). */
function drawMoon(f: LookFrame, color: string): void {
  const a = amt(f, "moon");
  if (a <= 0) return;
  const { ctx, W, H } = f;
  const r = minSide(f) * 0.13;
  // Upper left: the vertical lyrics take the right side and the title card the middle
  const at = { x: W * 0.3, y: H * 0.19 };
  withMoved(f, "moon", at, () => {
    const glow = ctx.createRadialGradient(at.x, at.y, r * 0.8, at.x, at.y, r * 2.6);
    glow.addColorStop(0, withAlpha(color, 0.45 * a));
    glow.addColorStop(1, withAlpha(color, 0));
    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(at.x - r * 2.6, at.y - r * 2.6, r * 5.2, r * 5.2);
    const disc = ctx.createRadialGradient(at.x - r * 0.3, at.y - r * 0.3, r * 0.1, at.x, at.y, r);
    disc.addColorStop(0, withAlpha("#ffd9c2", Math.min(1, 0.5 + a)));
    disc.addColorStop(1, withAlpha(color, Math.min(1, 0.4 + a)));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fill();
    // A thin cloud band crossing the moon
    ctx.fillStyle = withAlpha("#1a0505", 0.55 * a);
    const drift = Math.sin(f.timeSec * 0.1) * r * 0.4;
    ctx.fillRect(at.x - r * 1.6 + drift, at.y + r * 0.15, r * 3.2, r * 0.12);
    ctx.fillRect(at.x - r * 1.2 - drift, at.y + r * 0.42, r * 2.4, r * 0.07);
    ctx.restore();
  });
}

/** A blossoming cherry branch reaching in from the top corner, swaying in the wind. */
function drawBranch(f: LookFrame): void {
  const a = amt(f, "branch");
  if (a <= 0) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const root = { x: W * 1.02, y: -H * 0.02 };
  withMoved(f, "branch", { x: W * 0.85, y: H * 0.12 }, () => {
    ctx.save();
    ctx.translate(root.x, root.y);
    ctx.rotate(Math.sin(f.timeSec * 0.7) * 0.025 * (f.style.noVibration ? 0 : 1));
    ctx.strokeStyle = withAlpha("#5a3a3a", 0.9 * Math.min(1, a + 0.3));
    ctx.lineCap = "round";
    const blossoms: { x: number; y: number }[] = [];
    // A main limb with a few twigs, fixed in shape
    const limb = (x: number, y: number, ang: number, len: number, w: number, depth: number, seed: number) => {
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + ex) / 2, (y + ey) / 2 + len * 0.12, ex, ey);
      ctx.stroke();
      blossoms.push({ x: ex, y: ey });
      if (depth <= 0) return;
      for (let i = 0; i < 2; i++) {
        const t = 0.45 + i * 0.3;
        const bx = x + (ex - x) * t;
        const by = y + (ey - y) * t;
        blossoms.push({ x: bx, y: by });
        limb(
          bx,
          by,
          ang + (i ? 0.6 : -0.5) + (hash01(seed, i) - 0.5) * 0.4,
          len * 0.5,
          w * 0.55,
          depth - 1,
          seed * 3 + i,
        );
      }
    };
    limb(0, 0, Math.PI * 0.82, s * 0.55, s * 0.018, 2, 7);
    for (const [i, b] of blossoms.entries()) {
      for (let j = 0; j < 3; j++) {
        const bx = b.x + (hash01(i, j + 10) - 0.5) * s * 0.05;
        const by = b.y + (hash01(i, j + 20) - 0.5) * s * 0.05;
        const r = s * (0.01 + hash01(i, j + 30) * 0.008);
        ctx.fillStyle = withAlpha(j % 2 ? style.secondaryColor : "#ffffff", 0.9 * Math.min(1, a + 0.3));
        for (let p = 0; p < 5; p++) {
          const ang = (p / 5) * Math.PI * 2 + i;
          ctx.beginPath();
          ctx.ellipse(
            bx + Math.cos(ang) * r * 0.8,
            by + Math.sin(ang) * r * 0.8,
            r * 0.6,
            r * 0.4,
            ang,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.fillStyle = withAlpha(style.accentColor, 0.9);
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  });
}

/** Small neon symbols on the wall (heart, star, arrow, note) that flicker on one by one. */
function drawNeonSigns(f: LookFrame): void {
  const a = amt(f, "signs");
  if (a <= 0) return;
  const { ctx, W, H, style } = f;
  const s = minSide(f);
  const spots = [
    { x: 0.1, y: 0.2, k: 0 },
    { x: 0.9, y: 0.22, k: 1 },
    { x: 0.12, y: 0.72, k: 2 },
    { x: 0.88, y: 0.7, k: 3 },
  ];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, s * 0.007);
  for (const sp of spots) {
    const tick = Math.floor(f.timeSec * 10);
    const flick = hash01(tick, 400 + sp.k) < 0.06 ? 0.25 : 1;
    const on = Math.min(1, Math.max(0, f.timeSec - sp.k * 0.4) / 0.3);
    const alpha = a * flick * on;
    if (alpha <= 0) continue;
    const color = sp.k % 2 ? style.secondaryColor : style.accentColor;
    const x = W * sp.x;
    const y = H * sp.y;
    const r = s * 0.05;
    ctx.strokeStyle = withAlpha("#ffffff", alpha);
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.03;
    ctx.beginPath();
    switch (sp.k) {
      case 0:
        ctx.moveTo(x, y + r * 0.8);
        ctx.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.5, y - r * 1.2, x, y - r * 0.35);
        ctx.bezierCurveTo(x + r * 0.5, y - r * 1.2, x + r * 1.5, y - r * 0.2, x, y + r * 0.8);
        break;
      case 1:
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? r * 0.42 : r;
          const ang = -Math.PI / 2 + (i / 10) * Math.PI * 2;
          ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
        }
        ctx.closePath();
        break;
      case 2:
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x + r * 0.5, y - r * 0.5);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x + r * 0.5, y + r * 0.5);
        break;
      default:
        ctx.moveTo(x - r * 0.3, y + r * 0.6);
        ctx.lineTo(x - r * 0.3, y - r * 0.8);
        ctx.lineTo(x + r * 0.6, y - r);
        ctx.lineTo(x + r * 0.6, y + r * 0.4);
        ctx.moveTo(x - r * 0.3, y + r * 0.6);
        ctx.arc(x - r * 0.55, y + r * 0.6, r * 0.25, 0, Math.PI * 2);
        ctx.moveTo(x + r * 0.6, y + r * 0.4);
        ctx.arc(x + r * 0.35, y + r * 0.4, r * 0.25, 0, Math.PI * 2);
    }
    // Colored tube under a white-hot core
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = Math.max(3, s * 0.012);
    ctx.stroke();
    ctx.strokeStyle = withAlpha("#ffffff", alpha * 0.9);
    ctx.lineWidth = Math.max(1, s * 0.004);
    ctx.stroke();
  }
  ctx.restore();
}

export const THEME_EXTRAS: Partial<Record<ThemedPresetId, ThemeExtras>> = {
  album_jacket: {
    back: (f) => {
      drawGodRays(f, amt(f, "rays"), f.style.secondaryColor, { x: 0.08, y: -0.1 }, 6, Math.PI * 0.3, 1.1);
      drawGiantWord(f, amt(f, "giant"), f.style.textColor);
    },
    front: (f) => {
      drawShine(f, amt(f, "shine"));
      drawMarquee(f, amt(f, "marquee"), {
        y: 0.9,
        band: withAlpha(f.style.accentColor, 0.85),
        ink: "#ffffff",
        angle: -0.03,
      });
    },
    lyrics: (f, draw) => echo(f, draw),
  },
  pop_cutout: {
    back: (f) => {
      const c = [f.style.accentColor, f.style.secondaryColor, "#5ad1ff", "#7bd88f"];
      drawFloatingShapes(f, amt(f, "shapes"), c);
      drawConfetti(f, amt(f, "confetti"), c);
    },
    front: (f) => drawBursts(f, amt(f, "bursts"), [f.style.accentColor, "#ffffff", f.style.textColor]),
    lyrics: (f, draw) => blockShadow(f, amt(f, "shadow"), withAlpha(f.style.accentColor, 0.9), draw),
  },
  tint_panels: {
    back: (f) => {
      drawGiantWord(f, amt(f, "giant"), f.style.secondaryColor, { outline: true });
      drawDustMotes(f, amt(f, "motes"), f.style.secondaryColor);
    },
    front: (f) => drawShine(f, amt(f, "shine"), f.style.secondaryColor),
    lyrics: (f, draw) => echo(f, draw, { x: -1, y: 0.4 }),
  },
  ballad_hud: {
    back: (f) => {
      drawGodRays(f, amt(f, "rays"), "#ffffff", { x: 0.2, y: -0.15 }, 6, Math.PI * 0.4, 0.9);
      drawFireflies(f, amt(f, "motes"), "#ffffff", [0.1, 0.9]);
    },
    front: (f) => drawShine(f, amt(f, "shine"), "#ffffff", 1.6),
    lyrics: (f, draw) => echo(f, draw, { x: 0, y: -1 }),
  },
  cinematic_fantasy: {
    back: (f) => {
      drawGodRays(f, amt(f, "rays"), f.style.accentColor, { x: 0.5, y: 0.3 }, 12, 0, Math.PI * 2);
      drawFog(f, amt(f, "fog"), "#ffe2b0", 0.82);
      drawFireflies(f, amt(f, "fireflies"), f.style.accentColor, [0.45, 0.95]);
    },
    front: (f) => drawShootingStars(f, amt(f, "stars"), "#fff4dc"),
  },
  digital_crt: {
    back: (f) => drawStarField(f, amt(f, "stars"), f.style.secondaryColor, 1),
    front: (f) => {
      drawPulseRings(f, amt(f, "rings"), f.style.secondaryColor);
      drawMarquee(f, amt(f, "marquee"), {
        y: 0.94,
        band: "rgba(0,0,0,0.75)",
        ink: f.style.secondaryColor,
        angle: 0,
        font: "'JetBrains Mono', monospace",
        speed: 1.4,
      });
    },
    lyrics: (f, draw) => echo(f, draw, { x: 1, y: 0 }),
  },
  dark_glitch: {
    back: (f) => drawGiantWord(f, amt(f, "giant"), "#ffffff", { outline: true }),
    front: (f) => {
      drawSpeedStreaks(f, amt(f, "streaks") * f.glitch, "#ffffff");
      drawPulseRings(f, amt(f, "rings"), f.style.accentColor);
    },
    lyrics: (f, draw) => echo(f, draw, { x: 1.5, y: 0 }),
  },
  summer_film: {
    back: (f) => {
      drawPuffClouds(f, amt(f, "puffs"), "#ffffff");
      drawSchool(f, amt(f, "birds"), "#ffffff", "bird");
      drawGlints(f, amt(f, "glints"), "#ffffff", [0.62, 1]);
    },
    front: (f) => drawShine(f, amt(f, "shine"), f.style.secondaryColor),
  },
  flat_type: {
    back: (f) => {
      drawGiantWord(f, amt(f, "giant"), f.style.accentColor, { outline: true });
      drawFloatingShapes(f, amt(f, "shapes"), [
        f.style.accentColor,
        f.style.secondaryColor,
        f.style.textColor,
      ]);
    },
    front: (f) =>
      drawMarquee(f, amt(f, "marquee"), {
        y: 0.88,
        band: f.style.textColor,
        ink: f.style.accentColor,
        angle: -0.07,
        font: f.style.mainFont,
        speed: 1.2,
      }),
    lyrics: (f, draw) => blockShadow(f, amt(f, "shadow"), f.style.secondaryColor, draw),
  },
  eclipse_nebula: {
    back: (f) => {
      drawAurora(f, amt(f, "aurora"), [f.style.accentColor, f.style.secondaryColor]);
      drawPulseRings(f, amt(f, "rings"), f.style.accentColor, { x: 0.5, y: 0.45 });
    },
    front: (f) => drawShootingStars(f, amt(f, "meteors"), f.style.secondaryColor),
    lyrics: (f, draw) => echo(f, draw, { x: 0, y: 1 }),
  },
  mono_accent: {
    back: (f) => {
      drawGiantWord(f, amt(f, "giant"), "#ffffff");
      drawSpeedStreaks(f, amt(f, "streaks"), "#ffffff");
    },
    front: (f) =>
      drawMarquee(f, amt(f, "marquee"), {
        y: 0.12,
        band: f.style.accentColor,
        ink: "#111111",
        angle: 0.05,
        font: f.style.mainFont,
      }),
    lyrics: (f, draw) => blockShadow(f, amt(f, "shadow"), f.style.accentColor, draw),
  },
  vintage_paper: {
    back: (f) => {
      drawGodRays(f, amt(f, "rays"), "#fff1cf", { x: 0.5, y: -0.25 }, 5, Math.PI * 0.5, 0.7);
      drawDustMotes(f, amt(f, "motes"), "#fff6dd");
    },
    front: (f) => drawProjectorFlicker(f, amt(f, "flicker")),
  },
  pastel_dream: {
    back: (f) => {
      drawPuffClouds(f, amt(f, "puffs"), "#ffffff", [0.08, 0.35]);
      drawGlints(f, amt(f, "glints"), "#ffffff");
      drawFireflies(f, amt(f, "fireflies"), f.style.accentColor, [0.05, 0.95]);
    },
    lyrics: (f, draw) => echo(f, draw, { x: 0, y: 1 }),
  },
  crimson_ink: {
    back: (f) => {
      drawMoon(f, f.style.accentColor);
      drawFog(f, amt(f, "fog"), "#ff9a7a", 0.85);
      drawInkSplatter(f, amt(f, "splatter"), "#140303");
    },
  },
  sakura_breeze: {
    back: (f) => {
      drawGodRays(f, amt(f, "rays"), "#fff3d6", { x: 0.15, y: -0.1 }, 6, Math.PI * 0.35, 1);
      drawBranch(f);
    },
    front: (f) => drawWindLines(f, amt(f, "wind"), "#ffffff"),
  },
  snow_night: {
    back: (f) => {
      drawStarField(f, amt(f, "stars"), "#eef5ff", 0.55);
      drawAurora(f, amt(f, "aurora"), ["#5cffc8", f.style.accentColor]);
      drawGlints(f, amt(f, "glints"), "#ffffff", [0.7, 1]);
    },
    front: (f) => drawShootingStars(f, amt(f, "meteors"), "#eef5ff"),
  },
  rain_window: {
    back: (f) => {
      drawWetReflection(f, amt(f, "reflect"), 0.78);
      drawRipples(f, amt(f, "ripples"), f.style.secondaryColor);
    },
    front: (f) => {
      drawGlassTrails(f, amt(f, "trails"));
      drawLightning(f, amt(f, "lightning"));
    },
  },
  manga_panel: {
    back: (f) => drawSpeedStreaks(f, amt(f, "streaks"), "#111111"),
    front: (f) => {
      drawBursts(f, amt(f, "bursts"), ["#111111", f.style.accentColor]);
      drawSfxWords(f, amt(f, "sfx"), "#111111", "#ffffff");
    },
    lyrics: (f, draw) => blockShadow(f, amt(f, "shadow"), "rgba(17,17,17,0.85)", draw),
  },
  deep_sea: {
    back: (f) => {
      drawDustMotes(f, amt(f, "marine"), "#cfefff");
      drawSchool(f, amt(f, "fish"), f.style.secondaryColor, "fish");
      drawJellyfish(f, amt(f, "jelly"), f.style.secondaryColor);
    },
  },
  neon_sign: {
    back: (f) => {
      drawNeonSigns(f);
      drawParticles(f, "rain", amt(f, "rain"), f.style.secondaryColor);
      drawWetReflection(f, amt(f, "reflect"), 0.8);
    },
    front: (f) => drawSparks(f, amt(f, "sparks"), f.style.secondaryColor),
  },
};

// Every theme lands its own hit when a big line starts, and shows what the
// line's words name (stars, rain, flowers …), behind the lyrics
for (const id of Object.keys(LOOK_ELEMENTS) as ThemedPresetId[]) {
  const extras = (THEME_EXTRAS[id] ??= {});
  const back = extras.back;
  extras.back = (f) => {
    // The generated pattern lies under the theme's other extras
    drawBgPattern(f);
    back?.(f);
    // Word pictures and big-line hits come once, from the main theme
    if (f.mixed) return;
    drawKeywordScenes(f);
    drawClimax(f);
  };
  // The beat pulse sits over the lyrics with the other front extras
  const front = extras.front;
  extras.front = (f) => {
    front?.(f);
    if (!f.mixed) drawBeatPulse(f);
  };
}

// Some themes cover the change from one line to the next with a quick wipe
for (const id of WIPE_THEMES) {
  (THEME_EXTRAS[id] ??= {}).mid = (f) => {
    if (!f.mixed) drawLineWipe(f);
  };
}
