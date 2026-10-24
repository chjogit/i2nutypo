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

export interface Project {
  audio: AudioSource;
  images: IllustrationAssets;
  /** Extra pictures (props); like the images they last for the page session only. */
  props: PropAsset[];
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
