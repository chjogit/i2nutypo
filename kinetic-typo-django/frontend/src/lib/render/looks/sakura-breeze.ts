import { amt, drawCharacterLayer, type LookFrame, type LookRenderer } from "./frame";
import {
  drawBackdrop,
  drawLightLeak,
  drawParticles,
  drawWordLyrics,
  gradientFallback,
  washFrame,
} from "./kit";
import { withAlpha } from "./noise";

// O. Sakura breeze: a spring picture warmed toward pink, petals blowing across in two
// layers, a soft light leak, and lyrics that drift in sideways like the wind.

function decor(f: LookFrame): void {
  drawParticles(f, "petal", amt(f, "petals"), f.style.secondaryColor);
  drawLightLeak(f, amt(f, "leak"), "#ffd6e2");
}

function scene(f: LookFrame): void {
  drawBackdrop(f, "saturate(1.05) brightness(1.04)", gradientFallback("#ffe3ec", "#f7b6c8"));
  washFrame(f, f.style.secondaryColor, 0.3 * amt(f, "blush"), "soft-light");
  decor(f);
  drawCharacterLayer(f, { bounce: f.energy * 0.4, tilt: Math.sin(f.timeSec * 0.9) * 0.02 });
}

function lyrics(f: LookFrame): void {
  const { style } = f;
  drawWordLyrics(f, {
    cells: [6, 5, 10, 9, 2, 1, 14, 13],
    size: [0.055, 0.075],
    weight: 800,
    font: "main",
    motion: "slide",
    motionAmount: amt(f, "drift"),
    color: style.textColor,
    accentColor: style.accentColor,
    stroke: [withAlpha("#ffffff", 0.9), 0.14],
  });
}

function overlay(f: LookFrame): void {
  // A few big petals pass right in front of the lens
  drawParticles(f, "petal", 0.25 * amt(f, "front"), f.style.secondaryColor, 1);
}

export const sakuraBreeze: LookRenderer = { scene, lyrics, overlay, decor };
