import type { FinishSettings } from "./finish";

export type LanguageCode = "ko-KR" | "ja-JP" | "en-US";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "4:5" | "21:9";

export type DisplayMode = "sentence" | "word";

export type MotifId =
  | "bokeh_scope"
  | "starburst_flash"
  | "bracket_scope"
  | "dark_chain"
  | "grid_timeline"
  | "lockscreen_ui"
  | "moon_window"
  | "yoha_moon_card"
  | "vortex_tunnel"
  | "neon_godray"
  | "analog_notebook"
  | "film_shards";

export interface CollabPart {
  partId: string;
  creator: string;
  title: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  secondaryColor: string;
  motif: MotifId;
}

export type WordEffect = "normal" | "slice" | "stretch" | "drop" | "blur" | "mirror" | "impact";

export interface LyricWord {
  text: string;
  isFirstWord: boolean;
  /** The user put a manual line break ("/n") right before this word. */
  breakBefore?: boolean;
  /** Seconds from the start of the line. */
  startOffset: number;
  endOffset: number;
  /**
   * Set when the line is timed character by character (the detail timeline):
   * seconds from the start of the line at which each character of text appears.
   */
  chars?: number[];
  effect: WordEffect;
  isAccent: boolean;
}

/** Style a single lyric line can set for itself (custom mode). */
export interface LineStyle {
  /** Glitch strength, 0..1. */
  glitch?: number;
  /** Shake strength, 0..1. */
  shake?: number;
  /** Text size multiplier, 0.5..2. */
  size?: number;
  /**
   * Text box width multiplier, 0.3..1.6: how wide the lyrics may run before
   * wrapping, without changing the text size (column spacing for vertical lyrics).
   */
  width?: number;
  /** Text box height multiplier, 0.5..2: row spacing (column length, so the wrap, for vertical lyrics). */
  height?: number;
  /** 1: kept as it is when the automatic composition rolls the lines again. */
  lock?: number;
  /** 1: a white flash and a jolt when the line starts (written as "!" at the end of the line). */
  flash?: number;
  /** The line's own lyric motion (1-based number in MOTIONS); none: the theme picks one. */
  motion?: number;
  /** 1: lyrics across, 2: in columns (vertical); none: as the whole video. */
  orient?: number;
}

export interface LyricLine {
  index: number;
  /** Absolute seconds on the song timeline. */
  startTime: number;
  endTime: number;
  /** Main (kinetic) text as typed, including *accent* markers. */
  rawText: string;
  cleanText: string;
  /** Bottom subtitle row 1, e.g. Korean pronunciation of a Japanese line. */
  pronText: string;
  /** Bottom subtitle row 2, e.g. Korean meaning. */
  transText: string;
  /** Moves this line's lyrics from their usual place, as a share of the frame width / height. */
  offsetX: number;
  offsetY: number;
  /** This line's own style settings; a missing key follows the whole video's setting. */
  lineStyle: LineStyle;
  /**
   * Written with a leading "&": sung over the line before it (chorus, duet).
   * Drawn next to the active line instead of replacing it, and left out of the
   * automatic sync, which moves it along with that line.
   */
  overlap: boolean;
  /**
   * When each word (or each character) appears, as a share of the line's
   * length, set on the detail timeline. Missing: the words are spread evenly.
   */
  timing?: number[];
  firstWord: string;
  tokens: string[];
  words: LyricWord[];
  collabPartId: string;
  isBigLine: boolean;
  cameraAngle: number;
}

export type AudioSource =
  | { kind: "none" }
  | {
      kind: "upload";
      fileName: string;
      mimeType: string;
      /** Object URL; only valid for the current page session. */
      objectUrl: string;
      duration: number;
    };

/**
 * Whole-frame look modeled on illustrated lyric MVs. "classic" is the retired kinetic renderer:
 * it stays in the union only so old saves can be read, and loading turns it into "album_jacket".
 */
export type LookPresetId =
  | "classic"
  | "album_jacket"
  | "pop_cutout"
  | "tint_panels"
  | "ballad_hud"
  | "cinematic_fantasy"
  | "digital_crt"
  | "dark_glitch"
  | "summer_film"
  | "flat_type"
  | "eclipse_nebula"
  | "mono_accent"
  | "vintage_paper"
  | "pastel_dream"
  | "crimson_ink"
  | "sakura_breeze"
  | "snow_night"
  | "rain_window"
  | "manga_panel"
  | "deep_sea"
  | "neon_sign";

export interface IllustrationSettings {
  /** Background: slow zoom/pan amount, 0..1. Ignored while locked. */
  motion: number;
  /** Background stays still at its set framing (no zoom/pan, no dragging). */
  bgLocked: boolean;
  /** Background framing: pan in -1..1 of the free margin on each axis, zoom 1..3. */
  bgX: number;
  bgY: number;
  bgZoom: number;
  /** Character stays put: no beat bounce or sway, no dragging. */
  charLocked: boolean;
  /** Character center x and feet y, as shares of the frame. */
  charX: number;
  charY: number;
  /** Character height as a share of the frame height. */
  characterScale: number;
  charFlip: boolean;
  /** Character PNG bounces on the beat. */
  beatBounce: boolean;
  /** How much the character sways, tilts and bounces, 0..1; 0.5 is each theme's own amount. */
  charShake: number;
  /**
   * Times the character leaves and comes back, in time order. While it is gone
   * the no-lyric cells are off; once it is back, the cells it covers at its new
   * place are used instead of the user's cells.
   */
  charCues: CharacterCue[];
  showCharacter: boolean;
  /** Keep lyrics and subtitles out of the cells marked in noTextCells. */
  avoidCharacter: boolean;
  /** The 4x4 cells (0..15, left to right, top to bottom) the user marked as no-lyrics zones. */
  noTextCells: boolean[];
}

/** How a picture leaves or comes on; "cut" switches at once with no effect. */
export type CueEffect = "cut" | "fade" | "wipeDown" | "wipeSide" | "iris";

export interface CharacterCue {
  /** Seconds on the song timeline when the character starts to leave. */
  hideAt: number;
  /** Seconds when it starts to come back; it stays at its new place after that. */
  showAt: number;
  effect: CueEffect;
  /** Length of each transition in seconds. */
  fade: number;
  /** Where it comes back: center x and feet y as shares of the frame. */
  x: number;
  y: number;
}

export interface LookElementState {
  on: boolean;
  /** Strength 0..1 while on. */
  amount: number;
  /** Move from the theme's own place, as shares of the frame width / height (movable elements only). */
  x?: number;
  y?: number;
  /** Turn in degrees around the element's center (movable elements only). */
  rot?: number;
  /** Size multiplier around the element's center, 0.3..3 (movable elements only); missing is 1. */
  size?: number;
}

/** A local image picked by the user; only an object URL is kept. */
export interface ImageAsset {
  fileName: string;
  objectUrl: string;
}

export interface IllustrationAssets {
  background: ImageAsset | null;
  character: ImageAsset | null;
  /** Album cover for the album jacket theme; the background stands in when missing. */
  cover: ImageAsset | null;
}

/** One stretch of time a prop is on screen, with its own placement. */
export interface PropClip {
  id: string;
  /** Seconds on the song timeline. */
  start: number;
  end: number;
  /** Center as shares of the frame width / height. */
  x: number;
  y: number;
  /** Height as a share of the frame height. */
  scale: number;
  /** Turn in degrees. */
  rot: number;
  /** 0..1. */
  opacity: number;
  /** How it comes on at the clip start, and how long that takes in seconds. */
  enter: CueEffect;
  enterSec: number;
  /** How it goes away at the clip end, and how long that takes. */
  exit: CueEffect;
  exitSec: number;
  /** Sway and tilt, 0..1. */
  shake: number;
  /** Bounce on the beat, 0..1. */
  beat: number;
  /** The 4x4 cells (as noTextCells) the lyrics keep out of while this clip is on screen. */
  cells: boolean[];
  /** Drawn over the lyrics instead of behind them. */
  front: boolean;
  flip: boolean;
  /** Part of the picture masked off, or filled with a color; missing when there is none. */
  mask?: PropMask;
}

/**
 * A mask on an illustration clip. The area is a rectangle or ellipse in the
 * picture's own box (shares 0..1 of its width and height), so it moves, turns
 * and scales with the picture.
 */
export interface PropMask {
  on: boolean;
  shape: "rect" | "ellipse";
  /** Center and size of the area, as shares of the picture's box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Soft edge, 0..1 (a share of the area's smaller side). */
  feather: number;
  /** "inside": the area is masked; "outside": everything but the area is. */
  target: "inside" | "outside";
  /** Color laid on the masked part; colorAlpha 0 leaves it see-through. */
  color: string;
  colorAlpha: number;
  /** Color only where the picture has pixels (its silhouette), or over the whole masked area. */
  fill: "picture" | "area";
}

/** A stretch of the song drawn with its own themes instead of the ones picked for the whole video. */
export interface ThemeClip {
  id: string;
  /** Seconds on the song timeline. */
  start: number;
  end: number;
  lookPreset: Exclude<LookPresetId, "classic">;
  mixLooks: Exclude<LookPresetId, "classic">[];
  lyricLook: Exclude<LookPresetId, "classic"> | null;
  /** The clip's own theme colors over its background theme's palette; missing keys use the palette. */
  colors?: Partial<ThemeColors>;
}

/** Theme colors (not the subtitles', which the subtitle panel sets). */
export type ThemeColors = Pick<StyleSettings, "bgColor" | "textColor" | "accentColor" | "secondaryColor">;

/** Lyrics across (horizontal) or in columns (vertical); auto: as the theme sets them. */
export type LyricOrientation = "auto" | "horizontal" | "vertical";

/** A filter on the background video alone (style.bgVideoFilter); the lyrics and decorations keep their colors. */
export interface BgVideoFilter {
  /** 1 leaves the video as it is. */
  brightness: number;
  contrast: number;
  saturate: number;
  /** Degrees, -180..180. */
  hue: number;
  /** 0..1, up to 2% of the frame height. */
  blur: number;
  tint: ColorFilter["kind"];
  /** 0..1. */
  tintAmount: number;
}

/** Whole-frame color filter over everything but the subtitles. */
export interface ColorFilter {
  kind: "none" | "blue" | "yellow" | "mono";
  /** Strength 0..1. */
  amount: number;
}

/**
 * An extra picture the user added (a prop, a sticker, an object). It keeps
 * its place in the project's list while off the timeline; on the timeline
 * it gets a lane of its own.
 */
export interface PropAsset {
  id: string;
  fileName: string;
  /** Object URL; only valid for the current page session. */
  objectUrl: string;
  /** Natural size, for the aspect ratio. */
  width: number;
  height: number;
  onTimeline: boolean;
  clips: PropClip[];
  /** Set for a moving illustration: a video file that plays from each clip's start, looping. */
  video?: { duration: number };
}

/** Fine controls that apply to every look (the "상세" tab). */
export interface DetailSettings {
  /** Glitch strength 0..1; 0.5 is each look's own default. */
  glitch: number;
  /** Shake strength 0..1; 0.3 is each look's own default, higher adds a beat shake to the whole frame. */
  shake: number;
  /** Shift of all lyrics, as shares of the frame width/height (-0.5..0.5). */
  lyricX: number;
  lyricY: number;
  /** Shift of the bottom subtitles, as shares of the frame width/height. */
  subtitleX: number;
  subtitleY: number;
}

/** Always "custom" now: every user adjustment applies. "preset" is only read from old saves and turned into "custom". */
export type StyleMode = "preset" | "custom";

export interface StyleSettings {
  styleMode: StyleMode;
  lookPreset: LookPresetId;
  /**
   * Up to two more themes picked besides the background theme (lookPreset).
   * Their decor and overlay elements are drawn over it; elements of every
   * theme are keyed "<preset>.<element>" in lookElements.
   */
  mixLooks: Exclude<LookPresetId, "classic">[];
  /** Which picked theme draws the lyrics (shape and motion); null means the background theme. */
  lyricLook: Exclude<LookPresetId, "classic"> | null;
  illustration: IllustrationSettings;
  /** Per-theme element switches, keyed "<preset>.<element>"; missing keys use the element default. */
  lookElements: Record<string, LookElementState>;
  /** Lyric font family picked in the lyrics section (lib/fonts/catalog); empty uses the theme's font. */
  lyricFont: string;
  /** Song title and credit line drawn by the album jacket theme; empty draws nothing. */
  coverTitle: string;
  coverCredit: string;
  detail: DetailSettings;
  /** Final color grade and filters over the whole frame; missing means none. */
  finish?: FinishSettings;
  /** Themes for stretches of the song (theme timeline); outside them the picks above apply. */
  themeClips: ThemeClip[];
  /** Theme and illustration clips snap to the lyric lines' starts and ends while dragged. */
  snapToLyrics: boolean;
  /** Motion held for this many frames at 24 fps (1 = smooth, 2 or 3 = limited animation). */
  frameStep: 1 | 2 | 3;
  /** Keeps the middle of the frame free for a character: lyrics go left and right in turn (top and bottom in portrait). */
  centerClear: boolean;
  /**
   * Lyric motions each theme uses (ids from lib/render/looks/motions), five of
   * its eight picked per song; a theme missing here uses its first five.
   */
  motionPicks: Partial<Record<Exclude<LookPresetId, "classic">, string[]>>;
  /** The song the motion picks were made for ("file name|seconds"); another song picks again. */
  motionSong: string;
  /** Blue, yellow or black-and-white over the picture, the subtitles left as they are. */
  colorFilter: ColorFilter;
  /** Brightness, color and blur of the background video only. */
  bgVideoFilter: BgVideoFilter;
  /** Screen transitions on the timeline's transition lane (cut at each clip's middle). */
  transitions: TransitionClip[];
  /** Adjustment layers: an effect over everything for a stretch of the song. */
  adjustClips: AdjustClip[];
  /** How the themes' movable elements move on their own instead of staying put. */
  elementMotion: ElementMotion;
  /** Lyrics leave with a matching motion at the end of each line, not only fade. */
  exitMotion: boolean;
  /** 0..1: each line's lyrics sit somewhere else on screen instead of the same place every time. */
  lyricRoam: number;
  /**
   * Auto contrast chosen for each theme; a theme without an entry uses its own
   * default (see theme-contrast.ts).
   */
  themeContrast: Partial<Record<LookPresetId, ThemeContrast>>;
  /**
   * Turns off every leftover vibration: beat pulses and shake, the jolt on
   * flash lines, hand-drawn boil, illustration sway and film gate weave.
   */
  noVibration: boolean;
  /** Lyrics set across or in columns over the whole video; "auto" keeps each theme's own. */
  lyricOrientation: LyricOrientation;
  /** Timeline clips also snap to the analysed beats while dragged. */
  snapToBeats: boolean;
  activePresetId: string;
  collabRelay: boolean;
  fixedMotif: MotifId;
  language: LanguageCode;
  aspectRatio: AspectRatio;
  displayMode: DisplayMode;
  bgColor: string;
  textColor: string;
  accentColor: string;
  secondaryColor: string;
  mainFont: string;
  accentFont: string;
  bpm: number;
  beatReact: number;
  fontScale: number;
  flashInvert: boolean;
  cameraMatchCut: boolean;
  particles: boolean;
  letterbox: boolean;
  nextPreview: boolean;
}

export type FxToggleKey =
  | "introBokeh"
  | "particleBlue"
  | "particleYellow"
  | "particleWhite"
  | "particleBeatDrift"
  | "motifGraphics"
  | "creditTag"
  | "introGuide"
  | "interludeGuide"
  | "ghostWords"
  | "firstWordUnderline"
  | "fxSlice"
  | "fxStretch"
  | "fxDrop"
  | "fxBlur"
  | "fxMirror"
  | "fxImpact";

export type FxToggles = Record<FxToggleKey, boolean>;

export interface SyncSettings {
  /** No lyric appears before this time (instrumental intro). */
  introGateSec: number;
  /** Force-sync a line when pronunciation similarity reaches this (0..1). */
  similarityThreshold: number;
}

export interface SubtitleSettings {
  enabled: boolean;
  font: string;
  /** Sizes in px at 720p; scaled with the canvas height. */
  pronFontSize: number;
  transFontSize: number;
  pronColor: string;
  transColor: string;
  bgBox: boolean;
  /** Gap from the bottom (or top) edge in px at 720p. */
  bottomOffset: number;
  /** Which edge of the frame the subtitles sit on. */
  position: "bottom" | "top";
  /**
   * "bottomOnly": no kinetic lyrics, the subtitle box carries the lyric line
   * itself above its pronunciation and meaning. "kinetic": kinetic lyrics in
   * the frame with pronunciation and meaning below.
   */
  display: SubtitleDisplay;
  /** Lyric row in the bottom-only display: size in px at 720p and color. */
  mainFontSize: number;
  mainColor: string;
}

export type SubtitleDisplay = "bottomOnly" | "kinetic";

/** A screen transition: the picture is covered (or moved) up to the clip's middle and uncovered after it. */
export type TransitionKind =
  | "flash"
  | "dip"
  | "zoom"
  | "whip"
  | "spin"
  | "glitch"
  | "rgb"
  | "pixel"
  | "circle"
  | "diagonal"
  | "bars"
  | "shutter"
  | "ink"
  | "leak"
  | "slide"
  | "blur";

/** Color a covering transition paints with. */
export type TransitionColor = "accent" | "bg" | "white" | "black";

/**
 * How a theme's lyrics keep readable over the background: "color" shifts their
 * color lighter or darker until they read, "outline" adds a contrasting edge,
 * "off" leaves the theme's colors as they are. amount 0..1 (shown as %) is the
 * contrast they are brought up to and the outline's weight; 0.5 is the usual 3:1.
 */
export interface ThemeContrast {
  mode: AutoContrast;
  amount: number;
}

/** How the lyrics keep readable over the background (ThemeContrast.mode). */
export type AutoContrast = "off" | "color" | "outline";

export interface TransitionClip {
  id: string;
  /** Seconds on the song timeline; the cut is halfway. */
  start: number;
  end: number;
  kind: TransitionKind;
  color: TransitionColor;
}

/** An effect laid over a stretch of the song, like an adjustment layer. */
export type AdjustKind =
  | "zoom"
  | "shake"
  | "tilt"
  | "blur"
  | "invert"
  | "mono"
  | "bright"
  | "saturate"
  | "hue"
  | "rgb"
  | "pixel"
  | "mirror"
  | "vhs"
  | "beatFlash";

export interface AdjustClip {
  id: string;
  start: number;
  end: number;
  kind: AdjustKind;
  /** Strength 0..1. */
  amount: number;
  /** Seconds the effect takes to come in and go out. */
  fade: number;
}

/**
 * How the themes' movable elements behave over time: "still" stays where it
 * was put, "drift" floats slowly, "hop" moves to a new place each line,
 * "draw" is drawn on each line, "organic" does all of these together.
 */
export type ElementMotionMode = "still" | "drift" | "hop" | "draw" | "organic";

export interface ElementMotion {
  mode: ElementMotionMode;
  /** 0..1. */
  amount: number;
  /** 0..1: hand-drawn marks (circles, swooshes, sparkles) drawn on around the lyrics, a new place each line. */
  marks: number;
}

/** Beats found in the song (beat markers on the timeline). */
export interface BeatGrid {
  bpm: number;
  /** Beat times in seconds, in order. */
  times: number[];
  /** Index (0..3) of the first beat that starts a bar. */
  downbeat: number;
}

/** A moving background, uploaded or picked from the free stock videos; decoded in the browser. */
export interface VideoAsset {
  fileName: string;
  objectUrl: string;
  width: number;
  height: number;
  duration: number;
  /** Where a stock video came from, shown as its credit. */
  stock?: { id: string; title: string; pageUrl: string };
}

export interface Project {
  audio: AudioSource;
  images: IllustrationAssets;
  /** Extra pictures (props); like the images they last for the page session only. */
  props: PropAsset[];
  /** Moving background drawn in place of the background picture; page session only. */
  bgVideo: VideoAsset | null;
  /** Beats found in the song, or null before the analysis runs. */
  beats: BeatGrid | null;
  /** Song length in seconds; falls back to a default until audio is loaded. */
  duration: number;
  lyricsText: string;
  /** The lyrics box is folded to a summary once the lyrics are entered. */
  lyricsCollapsed: boolean;
  lines: LyricLine[];
  style: StyleSettings;
  fx: FxToggles;
  sync: SyncSettings;
  subtitles: SubtitleSettings;
}
