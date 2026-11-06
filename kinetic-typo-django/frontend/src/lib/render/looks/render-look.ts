import type { LookPresetId } from "@/types/project";
import { drawBottomSubtitles, showsKineticLyrics } from "../subtitles";
import { recordTextBounds, type Box } from "../text-bounds";
import { balladHud } from "./ballad-hud";
import { cinematicFantasy } from "./cinematic-fantasy";
import { darkGlitch } from "./dark-glitch";
import { digitalCrt } from "./digital-crt";
import type { LookFrame, LookRenderer } from "./frame";
import type { Ctx2D } from "../motifs";
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
import { drawReadable } from "./auto-contrast";
import { orientedLyrics } from "./orientation";
import { contrastFor } from "./theme-contrast";
import { THEME_EXTRAS } from "./theme-extras";
import { drawThemeTitleCard } from "./title-cards";
import { drawAccentMark, wantsAccentMark } from "./accent-marks";
import { drawInterlude } from "./interlude";
import { capture } from "./pieces";
import { clamp01 } from "./noise";
import { transformScale } from "../logical-blur";
import {
  blurBehind,
  cardContext,
  drawCard,
  drawGlass,
  focalFor,
  paneAround,
  poseAt,
  projectedBox,
  surfaceOf,
  type LyricSurface,
  type Rect,
} from "./lyric-surface";

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
/** A mixed-in theme's extras run at a little over half strength so three themes don't crowd the frame. */
function mixedExtra(ctx: Ctx2D, draw: () => void): void {
  ctx.save();
  ctx.globalAlpha *= 0.55;
  draw();
  ctx.restore();
}

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
    if (showsKineticLyrics(f.subtitles)) drawAccentMark(lyr.f, drawLyrics(lyr.r, lyr.f, false));
    // The title card is type too, so it goes with the lyrics on the clear layer
    drawThemeTitleCard(lyr.f);
    drawInterlude(lyr.f);
    drawProps(f, true);
    ctx.restore();
  } else {
    // Fill first so the beat shake never uncovers the previous frame at the edges
    ctx.fillStyle = f.style.bgColor;
    ctx.fillRect(0, 0, f.W, f.H);
    ctx.save();
    ctx.translate(f.frameShake.x, f.frameShake.y);
    drawScene(r, f);
    for (const m of mixes) {
      m.r.decor?.(m.f);
      mixedExtra(ctx, () => THEME_EXTRAS[m.f.preset]?.back?.(m.f));
    }
    drawProps(f, false);
    THEME_EXTRAS[f.preset]?.mid?.(f);
    if (layer === "full") {
      // In the bottom-only display the line is shown in the subtitles alone
      if (showsKineticLyrics(f.subtitles)) drawAccentMark(lyr.f, drawLyrics(lyr.r, lyr.f));
      drawThemeTitleCard(lyr.f);
      drawInterlude(lyr.f);
      drawProps(f, true);
    }
    THEME_EXTRAS[f.preset]?.front?.(f);
    for (const m of mixes) mixedExtra(ctx, () => THEME_EXTRAS[m.f.preset]?.front?.(m.f));
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
 * The background theme's scene, with its extra back elements (theme-extras.ts)
 * slipped in right before the character, or after the scene when it draws none.
 */
function drawScene(r: LookRenderer, f: LookFrame): void {
  const back = THEME_EXTRAS[f.preset]?.back;
  if (!back) {
    r.scene(f);
    return;
  }
  let drawn = false;
  const once = () => {
    if (drawn) return;
    drawn = true;
    back(f);
  };
  r.scene({ ...f, beforeCharacter: once });
  once();
}

/**
 * Lyrics moved by the global and per-line position, then any overlapping lines
 * beside them. Over a picture they are kept readable as the lyric theme's auto
 * contrast says (contrastFor); on
 * the transparent layer there is no picture to read against, so they are not.
 */
function drawLyrics(r: LookRenderer, f: LookFrame, overPicture = true): Box | null {
  const hasOverlaps = (f.overlaps?.length ?? 0) > 0;
  const surface = f.line ? surfaceOf(f.style) : null;
  const measure = !!f.textBounds || hasOverlaps || wantsAccentMark(f) || !!surface;
  f.ctx.save();
  f.ctx.translate(f.lyricShift.x, f.lyricShift.y);
  const contrast = contrastFor(f.style, f.preset);
  const mode = overPicture ? contrast.mode : "off";
  // The theme's own lyrics for frame h, without the line's motion
  const atRest = (h: LookFrame) => {
    const lyrics = orientedLyrics(r, h);
    const wrap = THEME_EXTRAS[h.preset]?.lyrics;
    return wrap ? () => wrap(h, () => lyrics(h)) : () => lyrics(h);
  };
  const lyricsOn = (target: Ctx2D, background?: CanvasImageSource) =>
    drawReadable(
      target,
      mode,
      (c) => {
        // Only the lyric theme's text counts; mixed themes' decor and overlay are drawn elsewhere
        const g = c === f.ctx ? f : { ...f, ctx: c };
        const draw = withMotion(g, atRest);
        // The readability check needs the box of the copy it draws on its own layer
        if (measure || c !== f.ctx) return recordTextBounds(g.ctx, draw);
        draw();
        return null;
      },
      contrast.amount,
      background,
    );
  const box = surface ? drawOnSurface(f, surface, atRest, lyricsOn, overPicture) : lyricsOn(f.ctx);
  if (f.textBounds) f.textBounds.lyrics = box;
  f.ctx.restore();
  if (hasOverlaps) drawOverlapLines(r, f, box);
  return box;
}

/**
 * The lyrics on a glass pane, in 2.5D depth, or both (lyric-surface.ts).
 * With depth the line is drawn flat on a clear card first, the picture
 * behind is softened, and the card is set into the frame in perspective.
 */
function drawOnSurface(
  f: LookFrame,
  s: LyricSurface,
  atRest: (h: LookFrame) => () => void,
  lyricsOn: (target: Ctx2D, background?: CanvasImageSource) => Box | null,
  overPicture: boolean,
): Box | null {
  const { ctx } = f;
  const line = f.line;
  const main = (ctx as CanvasRenderingContext2D).canvas as HTMLCanvasElement | undefined;
  if (!line || !main || !(main.width > 0)) return lyricsOn(ctx);
  const unit = Math.min(f.W, f.H) * 0.01 * transformScale(ctx);
  const dur = Math.max(0.01, line.endTime - line.startTime);
  const fade = Math.min(clamp01(f.lineElapsed / 0.35), clamp01((dur - f.lineElapsed) / 0.25));
  const grow = 0.93 + 0.07 * (1 - Math.pow(1 - clamp01(f.lineElapsed / 0.45), 3));

  // The pane fits the whole line as it will stand once sung, so it does not grow word by word
  let pane: Rect | null = null;
  if (s.glass !== "off") {
    const rest = Math.max(f.lineElapsed, Math.min(dur - 0.3, dur * 0.9));
    const whole = capture(ctx, (c) =>
      atRest({ ...f, ctx: c, lineElapsed: rest, timeSec: line.startTime + rest, lineProgress: rest / dur })(),
    );
    if (whole) pane = paneAround(whole.text, unit, grow);
  }
  const glass = { frost: s.glass === "frost" ? 1 : 0, timeSec: f.timeSec, unit, alpha: fade };

  if (s.depth < 0.01) {
    if (pane) drawGlass(ctx, main, pane, glass);
    return lyricsOn(ctx);
  }
  if (overPicture) blurBehind(ctx, unit * s.depth * 0.45);
  const card = cardContext(ctx);
  if (!card) return lyricsOn(ctx);
  if (pane) drawGlass(card.c, main, pane, glass);
  const box = lyricsOn(card.c, main);
  if (!box && !pane) return null;
  const pad = box ? (box.y1 - box.y0) * 0.6 + unit * 2 : 0;
  const shadow = unit * 9;
  const area: Box = {
    x0: Math.min(box ? box.x0 - pad : Infinity, pane ? pane.x0 - shadow : Infinity),
    y0: Math.min(box ? box.y0 - pad : Infinity, pane ? pane.y0 - shadow : Infinity),
    x1: Math.max(box ? box.x1 + pad : -Infinity, pane ? pane.x1 + shadow : -Infinity),
    y1: Math.max(box ? box.y1 + pad : -Infinity, pane ? pane.y1 + shadow * 1.4 : -Infinity),
  };
  const pivot = pane ?? box;
  if (!pivot) return null;
  const cx = (pivot.x0 + pivot.x1) / 2;
  const cy = (pivot.y0 + pivot.y1) / 2;
  const pose = poseAt(s.depth, f.lineElapsed, f.lineProgress, f.timeSec, line.index);
  drawCard(ctx, card.canvas, area, cx, cy, pose, unit, s.depth, !!pane);
  return box ? projectedBox(box, cx, cy, focalFor(main.width, main.height), pose) : null;
}

/** The line's lyric motion (see motions.ts) wrapped around the theme's own lyrics. */
function withMotion(f: LookFrame, make: (g: LookFrame) => () => void): () => void {
  const draw = make(f);
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
        capture: (c) => make({ ...f, ctx: c })(),
      },
      draw,
      exits,
      f.preset,
    );
}
