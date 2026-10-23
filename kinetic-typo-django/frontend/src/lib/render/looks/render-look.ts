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
import { albumJacket } from "./album-jacket";

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

/** Draws one frame in a look preset. With transparentBg only the lyric text is drawn. */
export function renderLookFrame(
  preset: Exclude<LookPresetId, "classic">,
  f: LookFrame,
  transparentBg: boolean,
): void {
  const r = RENDERERS[preset];
  const mixes = mixFrames(f);
  const lyr = lyricFrame(f, r);
  const { ctx } = f;
  ctx.save();
  if (transparentBg) {
    ctx.clearRect(0, 0, f.W, f.H);
    if (showsKineticLyrics(f.subtitles)) drawLyrics(lyr.r, lyr.f);
  } else {
    // Fill first so the beat shake never uncovers the previous frame at the edges
    ctx.fillStyle = f.style.bgColor;
    ctx.fillRect(0, 0, f.W, f.H);
    ctx.save();
    ctx.translate(f.frameShake.x, f.frameShake.y);
    r.scene(f);
    for (const m of mixes) m.r.decor?.(m.f);
    // In the bottom-only display the line is shown in the subtitles alone
    if (showsKineticLyrics(f.subtitles)) drawLyrics(lyr.r, lyr.f);
    ctx.restore();
    r.overlay(f);
    for (const m of mixes) m.r.overlay(m.f);
  }
  if (f.line) {
    ctx.save();
    ctx.translate(f.subtitleShift.x, f.subtitleShift.y);
    drawBottomSubtitles({
      ctx,
      line: f.line,
      lineElapsed: f.lineElapsed,
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

/** Lyrics moved by the global and per-line position. */
function drawLyrics(r: LookRenderer, f: LookFrame): void {
  f.ctx.save();
  f.ctx.translate(f.lyricShift.x, f.lyricShift.y);
  // Only the lyric theme's text counts; mixed themes' decor and overlay are drawn elsewhere
  if (f.textBounds) f.textBounds.lyrics = recordTextBounds(f.ctx, () => r.lyrics(f));
  else r.lyrics(f);
  f.ctx.restore();
}
