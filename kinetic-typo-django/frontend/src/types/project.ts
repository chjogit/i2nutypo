export type LanguageCode = "ko-KR" | "ja-JP" | "en-US";

export type AspectRatio = "16:9" | "9:16" | "1:1";

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
  showCharacter: boolean;
  /** Keep lyrics and subtitles out of the cells marked in noTextCells. */
  avoidCharacter: boolean;
  /** The 4x4 cells (0..15, left to right, top to bottom) the user marked as no-lyrics zones. */
  noTextCells: boolean[];
}

export interface LookElementState {
  on: boolean;
  /** Strength 0..1 while on. */
  amount: number;
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
