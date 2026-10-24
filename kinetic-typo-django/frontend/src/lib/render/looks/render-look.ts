import type { LookPresetId } from "@/types/project";
import { drawBottomSubtitles, showsKineticLyrics } from "../subtitles";
import { recordTextBounds } from "../text-bounds";
import { balladHud } from "./ballad-hud";
import { cinematicFantasy } from "./cinematic-fantasy";
import { darkGlitch } from "./dark-glitch";
import { digitalCrt } from "./digital-crt";
import type { LookFrame, LookRenderer } from "./frame";
import { eclipseNebula } from "./eclipse-nebula";
import { flatType } from "./flat-type";
import { popCutout } from "./pop-cutout";
import { lyricLookOf, type ThemedPresetId } from "./presets";
import { summerFilm } from "./summer-film";
import { tintPanels } from "./tint-panels";
import { monoAccent } from "./mono-accent";
import { vintagePaper } from "./vintage-paper";
import { pastelDream } from "./pastel-dream";
import { crimsonInk } from "./crimson-ink";
import { sakuraBreeze } from "./sakura-breeze";
import { snowNight } from "./snow-night";
import { rainWindow } from "./rain-window";
import { mangaPanel } from "./manga-panel";
import { deepSea } from "./deep-sea";
import { neonSign } from "./neon-sign";
import { drawOverlapLines } from "./overlap-layer";
import { albumJacket } from "./album-jacket";
import { drawProps } from "./props";
import { applyMotion, motionForLine } from "./motions";
import { applyColorFilter } from "./color-filter";
import { drawOrganicMarks } from "./element-motion";
import { drawReadable } from "./auto-contrast";
import { orientedLyrics } from "./orientation";
import { contrastFor } from "./theme-contrast";

/** How each theme's hand-drawn marks are stroked. */
const MARK_STROKE: Partial<Record<Exclude<LookPresetId, "classic">, "glow" | "brush">> = {
  digital_crt: "glow",
  dark_glitch: "glow",
  neon_sign: "glow",
  eclipse_nebula: "glow",
  deep_sea: "glow",
  crimson_ink: "brush",
  manga_panel: "brush",
  vintage_paper: "brush",
  pop_cutout: "brush",
};

const RENDERERS: Record<Exclude<LookPresetId, "classic">, LookRenderer> = {
  album_jacket: albumJacket,
  pop_cutout: popCutout,
  tint_panels: tintPanels,
  ballad_hud: balladHud,
  cinematic_fantasy: cinematicFantasy,
  digital_crt: digitalCrt,
  dark_glitch: darkGlitch,
  summer_film: summerFilm,
  flat_type: flatType,
  eclipse_nebula: eclipseNebula,
  mono_accent: monoAccent,
  vintage_paper: vintagePaper,
  pastel_dream: pastelDream,
  crimson_ink: crimsonInk,
  sakura_breeze: sakuraBreeze,
  snow_night: snowNight,
  rain_window: rainWindow,
  manga_panel: mangaPanel,
  deep_sea: deepSea,
  neon_sign: neonSign,
};

/** The other picked themes, drawn over the background theme: their decor and overlay only. */
function mixFrames(f: LookFrame): { r: LookRenderer; f: LookFrame }[] {
  return (f.style.mixLooks ?? [])
    .filter((id): id is ThemedPresetId => id !== f.preset && id in RENDERERS)
    .map((id) => ({ r: RENDERERS[id], f: { ...f, preset: id, mixed: true } }));
}

/** The picked theme that draws the lyrics, with a frame in its name so its own lyric elements apply. */
function lyricFrame(f: LookFrame, base: LookRenderer): { r: LookRenderer; f: LookFrame } {
  const id = lyricLookOf(f.style);
  if (id === f.preset || id === "classic" || !(id in RENDERERS)) return { r: base, f };
  return { r: RENDERERS[id], f: { ...f, preset: id } };
}

/**
 * Which part of the frame to draw: everything, only what sits behind the
 * lyrics ("back": background, illustrations behind, screen effects), or only
 * the lyrics with the illustrations in front of them and the subtitles on a
 * clear canvas ("front", for compositing).
 */
export type FrameLayer = "full" | "back" | "front";

/** Draws one frame in a look preset, or one of its layers. */
export function renderLookFrame(
  preset: Exclude<LookPresetId, "classic">,
  f: LookFrame,
  layer: FrameLayer,
): void {
  const transparentBg = layer === "front";
  const r = RENDERERS[preset];
  const mixes = mixFrames(f);
  const lyr = lyricFrame(f, r);
  const { ctx } = f;
  ctx.save();
  if (transparentBg) {
    ctx.clearRect(0, 0, f.W, f.H);
    ctx.save();
    ctx.translate(f.frameShake.x, f.frameShake.y);
    if (showsKineticLyrics(f.subtitles)) drawLyrics(lyr.r, lyr.f, false);
    drawProps(f, true);
    ctx.restore();
  } else {
    // Fill first so the beat shake never uncovers the previous frame at the edges
    ctx.fillStyle = f.style.bgColor;
    ctx.fillRect(0, 0, f.W, f.H);
    ctx.save();
    ctx.translate(f.frameShake.x, f.frameShake.y);
    r.scene(f);
    for (const m of mixes) m.r.decor?.(m.f);
    drawOrganicMarks({
      ctx,
      W: f.W,
      H: f.H,
      timeSec: f.timeSec,
      hop: f.hop,
      motion: f.style.elementMotion,
      blocked: f.blocked,
      color: f.style.accentColor,
      second: f.style.textColor,
      stroke: MARK_STROKE[preset] ?? "pen",
      energy: f.energy,
    });
    drawProps(f, false);
    if (layer === "full") {
      // In the bottom-only display the line is shown in the subtitles alone
      if (showsKineticLyrics(f.subtitles)) drawLyrics(lyr.r, lyr.f);
      drawProps(f, true);
    }
    ctx.restore();
    r.overlay(f);
    for (const m of mixes) m.r.overlay(m.f);
  }
  // Everything so far gets the color filter; the subtitles below keep their colors
  applyColorFilter(ctx, f.style.colorFilter);
  if (f.line && layer !== "back") {
    ctx.save();
    ctx.translate(f.subtitleShift.x, f.subtitleShift.y);
    drawBottomSubtitles({
      ctx,
      line: f.line,
      lineElapsed: f.lineElapsed,
      overlaps: f.overlaps,
      W: f.W,
      H: f.H,
      settings: f.subtitles,
      shiftX: f.subtitleShift.x,
      letterbox: [{ r, f }, ...mixes].some((m) => m.r.letterbox?.(m.f) ?? false),
      isFlashFrame: false,
      transparentBg,
      // A bottom-center cell is taken by the character, so the subtitles go to the top
      placement: f.subtitleTop ? "top" : "bottom",
      mainFont: lyr.f.style.mainFont,
      bounds: f.textBounds,
    });
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Lyrics moved by the global and per-line position, then any overlapping lines
 * beside them. Over a picture they are kept readable as the lyric theme's auto
 * contrast says (contrastFor); on
 * the transparent layer there is no picture to read against, so they are not.
 */
function drawLyrics(r: LookRenderer, f: LookFrame, overPicture = true): void {
  const hasOverlaps = (f.overlaps?.length ?? 0) > 0;
  f.ctx.save();
  f.ctx.translate(f.lyricShift.x, f.lyricShift.y);
  const contrast = contrastFor(f.style, f.preset);
  const mode = overPicture ? contrast.mode : "off";
  const box = drawReadable(
    f.ctx,
    mode,
    (c) => {
      const g = c === f.ctx ? f : { ...f, ctx: c };
      // Only the lyric theme's text counts; mixed themes' decor and overlay are drawn elsewhere
      const lyrics = orientedLyrics(r, g);
      const draw = withMotion(g, () => lyrics(g));
      // The readability check needs the box of the copy it draws on its own layer
      if (f.textBounds || hasOverlaps || c !== f.ctx) return recordTextBounds(g.ctx, draw);
      draw();
      return null;
    },
    contrast.amount,
  );
  if (f.textBounds) f.textBounds.lyrics = box;
  f.ctx.restore();
  if (hasOverlaps) drawOverlapLines(r, f, box);
}

/** The line's lyric motion (see motions.ts) wrapped around the theme's own lyrics. */
function withMotion(f: LookFrame, draw: () => void): () => void {
  const line = f.line;
  if (!line) return draw;
  const motion = motionForLine(f.style, line);
  const exits = f.style.exitMotion !== false;
  if (!motion && !exits) return draw;
  return () =>
    applyMotion(
      motion,
      {
        ctx: f.ctx,
        W: f.W,
        H: f.H,
        elapsed: f.lineElapsed,
        dur: Math.max(0.01, line.endTime - line.startTime),
        energy: f.energy,
        cx: f.W / 2,
        cy: f.H / 2,
        seed: line.index,
      },
      draw,
      exits,
    );
}
