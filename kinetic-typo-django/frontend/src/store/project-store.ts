import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { BEGINNER_THEMES, FEATURES_NOW, MODE, projectStorageKey } from "@/lib/mode/mode";
import type {
  AudioSource,
  FxToggleKey,
  FxToggles,
  ImageAsset,
  LookElementState,
  LookPresetId,
  LyricLine,
  Project,
  PropAsset,
  PropClip,
  StyleSettings,
  SubtitleSettings,
  SyncSettings,
  ThemeClip,
} from "@/types/project";
import { defaultFxToggles, sanitizeFxToggles } from "@/lib/fx/toggles";
import {
  autoDistributeLyrics,
  hasTimestamps,
  parseLyrics,
  serializeTimedLyrics,
  type TimedLyric,
} from "@/lib/lyrics/parse";
import { normalizeMultilineJapaneseBlocks, splitLyricTriplet } from "@/lib/lyrics/triplet";
import { SAMPLE_LYRICS } from "@/lib/lyrics/samples";
import { pickMotions, sanitizeMotionPicks } from "@/lib/render/looks/motions";
import { sanitizeColorFilter } from "@/lib/render/looks/color-filter";
import { freshSeed, mulberry32, textSeed } from "@/lib/random";
import { composeLines, composeStyle, rerollMotion } from "@/lib/compose/auto-compose";
import { linesToLrc } from "@/lib/sync/align";
import {
  DEFAULT_ILLUSTRATION,
  getLookElement,
  getLookPreset,
  isLookPresetId,
  lookElementKey,
  pickedLooks,
  sanitizeLookElements,
  sanitizeMixLooks,
  isThemedPresetId,
  classicToAlbumElements,
  MAX_MIX_LOOKS,
} from "@/lib/render/looks/presets";
import { DEFAULT_DETAIL, sanitizeDetail } from "@/lib/render/detail";
import { findLyricFont } from "@/lib/fonts/catalog";
import { sanitizeCues } from "@/lib/render/looks/cues";
import { fitClip, freeAt, makeClip, MIN_CLIP, newId, sortClips } from "@/lib/props/clips";
import { sanitizeThemeClips } from "@/lib/render/theme-clips";
import { sanitizeCells } from "@/lib/render/looks/layout";

/** A saved 0..1 setting, or the fallback when missing or broken. */
const sanitizeUnit = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export const DEFAULT_DURATION = 32;

const DEFAULT_STYLE_THEME = "album_jacket" as const;

export const DEFAULT_STYLE: StyleSettings = {
  styleMode: "custom",
  lookPreset: "album_jacket",
  mixLooks: [],
  lyricLook: null,
  illustration: DEFAULT_ILLUSTRATION,
  lookElements: {},
  detail: DEFAULT_DETAIL,
  activePresetId: "collab_16_relay",
  collabRelay: true,
  fixedMotif: "yoha_moon_card",
  language: "ko-KR",
  aspectRatio: "16:9",
  displayMode: "sentence",
  lyricFont: "",
  coverTitle: "",
  coverCredit: "",
  ...getLookPreset("album_jacket").palette,
  bpm: 98,
  beatReact: 88,
  fontScale: 1.0,
  flashInvert: true,
  cameraMatchCut: true,
  particles: true,
  letterbox: false,
  nextPreview: true,
  themeClips: [],
  snapToLyrics: true,
  frameStep: 1,
  centerClear: false,
  motionPicks: {},
  motionSong: "",
  colorFilter: { kind: "none", amount: 0.6 },
};

export const DEFAULT_SYNC: SyncSettings = {
  introGateSec: 6.0,
  similarityThreshold: 0.7,
};

export const DEFAULT_SUBTITLES: SubtitleSettings = {
  enabled: true,
  font: "'Noto Sans KR', sans-serif",
  pronFontSize: 22,
  transFontSize: 28,
  pronColor: "#fde047",
  transColor: "#ffffff",
  bgBox: true,
  bottomOffset: 48,
  position: "bottom",
  display: "kinetic",
  mainFontSize: 34,
  mainColor: "#ffffff",
};

interface ProjectActions {
  setLyricsText: (text: string) => void;
  /**
   * Takes lyrics typed without times and folds the box. Lines keep their
   * current times when the line count is unchanged; otherwise they are spread
   * over the song. Text with [mm:ss] times is used as typed.
   */
  commitLyricsInput: (text: string) => void;
  setLyricsCollapsed: (collapsed: boolean) => void;
  /** Empties the lyrics, e.g. when another song is picked. */
  clearLyrics: () => void;
  /** Edits one line's text or times from the timeline. */
  updateLine: (index: number, patch: Partial<TimedLyric>) => void;
  removeLine: (index: number) => void;
  /** Rolls themes, colors, elements, strengths and unlocked lines' motions from a seed. */
  autoCompose: (seed: number) => void;
  /** Puts back an earlier composition (its style and lyrics). */
  restoreComposition: (snap: { style: StyleSettings; lyricsText: string }) => void;
  /** Gives one line another of the lyric theme's motions. */
  rerollLine: (index: number) => void;
  /** Changes several lines at once (lines picked together in the timeline). */
  updateLines: (indices: readonly number[], patch: (line: TimedLyric) => Partial<TimedLyric>) => void;
  removeLines: (indices: readonly number[]) => void;
  /** Gives each of these lines another motion. */
  rerollLines: (indices: readonly number[]) => void;
  /**
   * Puts a theme clip with the whole video's themes over start..end, cutting
   * back any theme clips already there; returns its id.
   */
  setThemeSpan: (start: number, end: number) => string | null;
  autoDistribute: () => void;
  loadSampleLyrics: () => void;
  setAudio: (audio: AudioSource) => void;
  setStyle: (patch: Partial<StyleSettings>) => void;
  /** Makes one theme the only pick and loads its palette and fonts. */
  applyLookPreset: (id: LookPresetId) => void;
  /**
   * Picks or unpicks a theme (at most three). The first pick becomes the
   * background theme and loads its palette.
   */
  toggleTheme: (id: LookPresetId) => void;
  /** Makes a picked theme the background theme (it draws the picture and character). */
  setBaseLook: (id: Exclude<LookPresetId, "classic">) => void;
  /** Picks which theme draws the lyrics; null follows the background theme. */
  setLyricLook: (id: Exclude<LookPresetId, "classic"> | null) => void;
  /** Loads a theme's colors and fonts without changing the picks. */
  applyPalette: (id: LookPresetId) => void;
  setIllustration: (patch: Partial<StyleSettings["illustration"]>) => void;
  setImage: (slot: "background" | "character" | "cover", asset: ImageAsset | null) => void;
  /** Adds an uploaded prop to the list and puts it on the timeline with one clip at `at`. */
  addProp: (asset: Omit<PropAsset, "onTimeline" | "clips">, at: number) => void;
  /** Takes a prop out of the project; the caller revokes its object URL. */
  removeProp: (id: string) => void;
  /** Shows or hides a prop's lane; it stays in the list either way. Coming back without clips adds one at `at`. */
  setPropOnTimeline: (id: string, on: boolean, at: number) => void;
  /** Adds a clip at `at` when that time is free in the prop's lane; returns its id. */
  addPropClip: (id: string, at: number) => string | null;
  updatePropClip: (id: string, clipId: string, patch: Partial<PropClip>) => void;
  removePropClip: (id: string, clipId: string) => void;
  /** Adds a theme clip at `at` with the whole video's current themes, when that time is free; returns its id. */
  addThemeClip: (at: number) => string | null;
  /**
   * Puts one theme on the theme timeline over the empty stretch around `at`
   * (the whole song when the lane is empty); returns the new clip's id.
   */
  placeTheme: (id: Exclude<LookPresetId, "classic">, at: number) => string | null;
  updateThemeClip: (id: string, patch: Partial<ThemeClip>) => void;
  removeThemeClip: (id: string) => void;
  /** Switches one element on/off or changes its strength; the theme defaults to the background theme. */
  setLookElement: (id: string, patch: Partial<LookElementState>, preset?: LookPresetId) => void;
  setDetail: (patch: Partial<StyleSettings["detail"]>) => void;
  setSync: (patch: Partial<SyncSettings>) => void;
  setSubtitles: (patch: Partial<SubtitleSettings>) => void;
  /** Rewrites the lyrics with new start times (one per current line). */
  applyLineTimes: (startTimes: readonly number[]) => void;
  setFx: (key: FxToggleKey, on: boolean) => void;
  setFxGroup: (keys: readonly FxToggleKey[], on: boolean) => void;
  /** Replaces the lyrics and settings with a saved project file's; media stay. */
  importProject: (saved: unknown) => void;
}

export type ProjectStore = Project & ProjectActions;

const reparse = (s: Pick<Project, "lyricsText" | "duration" | "sync">): LyricLine[] =>
  parseLyrics(s.lyricsText, { duration: s.duration, introGateSec: s.sync.introGateSec });

const initialLyrics = SAMPLE_LYRICS["ko-KR"];

const toTimed = (l: LyricLine): TimedLyric => ({
  startTime: l.startTime,
  endTime: l.endTime,
  rawText: l.rawText,
  pronText: l.pronText,
  transText: l.transText,
  offsetX: l.offsetX,
  offsetY: l.offsetY,
  lineStyle: l.lineStyle,
  overlap: l.overlap,
});

/** Rewrites the lyrics from edited lines; a line moved into the intro lowers the intro gate. */
const fromTimed = (s: Pick<Project, "duration" | "sync">, timed: TimedLyric[]) => {
  const lyricsText = serializeTimedLyrics(timed, s.duration);
  const first = timed.length ? Math.min(...timed.map((l) => l.startTime)) : s.sync.introGateSec;
  const sync = { ...s.sync, introGateSec: Math.min(s.sync.introGateSec, first) };
  return { lyricsText, sync, lines: reparse({ lyricsText, duration: s.duration, sync }) };
};

/**
 * A saved project (local storage or a project file) laid over the current
 * one, with every field checked. Audio, images and illustrations are never in
 * it, so they stay as they are.
 */
function restoreProject(persisted: unknown, current: ProjectStore): ProjectStore {
  const p = (persisted ?? {}) as Partial<Project>;
  const merged: ProjectStore = {
    ...current,
    lyricsText: typeof p.lyricsText === "string" ? p.lyricsText : current.lyricsText,
    lyricsCollapsed: p.lyricsCollapsed === true,
    style: {
      ...current.style,
      ...p.style,
      illustration: {
        ...current.style.illustration,
        ...p.style?.illustration,
        noTextCells: sanitizeCells(p.style?.illustration?.noTextCells),
        charCues: sanitizeCues(p.style?.illustration?.charCues),
        charShake: sanitizeUnit(p.style?.illustration?.charShake, 0.5),
      },
      // Saves from the retired classic look move to the album jacket theme with their effects
      lookElements:
        p.style?.lookPreset === "classic"
          ? classicToAlbumElements(p.style, p.fx, sanitizeLookElements(p.style.lookElements))
          : sanitizeLookElements(p.style?.lookElements),
      lyricFont: findLyricFont(String(p.style?.lyricFont ?? "")) ? String(p.style?.lyricFont) : "",
      coverTitle: typeof p.style?.coverTitle === "string" ? p.style.coverTitle : "",
      coverCredit: typeof p.style?.coverCredit === "string" ? p.style.coverCredit : "",
      detail: sanitizeDetail(p.style?.detail),
      styleMode: "custom",
      lookPreset: isLookPresetId(p.style?.lookPreset) ? p.style.lookPreset : current.style.lookPreset,
      mixLooks: sanitizeMixLooks(p.style?.mixLooks),
      lyricLook: isThemedPresetId(p.style?.lyricLook) ? p.style.lyricLook : null,
      themeClips: sanitizeThemeClips(p.style?.themeClips),
      snapToLyrics: p.style?.snapToLyrics !== false,
      frameStep: p.style?.frameStep === 2 || p.style?.frameStep === 3 ? p.style.frameStep : 1,
      centerClear: p.style?.centerClear === true,
      motionPicks: sanitizeMotionPicks(p.style?.motionPicks),
      motionSong: typeof p.style?.motionSong === "string" ? p.style.motionSong : "",
      colorFilter: sanitizeColorFilter(p.style?.colorFilter),
    },
    sync: { ...current.sync, ...p.sync },
    subtitles: {
      ...current.subtitles,
      ...p.subtitles,
      position: p.subtitles?.position === "top" ? "top" : "bottom",
      display: p.subtitles?.display === "bottomOnly" ? "bottomOnly" : "kinetic",
    },
    fx: sanitizeFxToggles(p.fx),
  };
  // A beginner works with one of the three beginner themes and nothing mixed in
  if (!FEATURES_NOW.themeMix) {
    const st = merged.style;
    const base = (BEGINNER_THEMES as readonly LookPresetId[]).includes(st.lookPreset)
      ? st.lookPreset
      : DEFAULT_STYLE.lookPreset;
    merged.style = { ...st, lookPreset: base, mixLooks: [], lyricLook: null, themeClips: [] };
  }
  return { ...merged, lines: reparse(merged) };
}

/** What a project file and local storage keep: everything but the page-session media. */
export const savedPart = (s: ProjectStore) => ({
  lyricsText: s.lyricsText,
  lyricsCollapsed: s.lyricsCollapsed,
  style: s.style,
  fx: s.fx,
  sync: s.sync,
  subtitles: s.subtitles,
});

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      audio: { kind: "none" },
      images: { background: null, character: null, cover: null },
      props: [],
      duration: DEFAULT_DURATION,
      lyricsText: initialLyrics,
      lyricsCollapsed: false,
      lines: reparse({ lyricsText: initialLyrics, duration: DEFAULT_DURATION, sync: DEFAULT_SYNC }),
      style: DEFAULT_STYLE,
      fx: defaultFxToggles(),
      sync: DEFAULT_SYNC,
      subtitles: DEFAULT_SUBTITLES,

      setLyricsText: (lyricsText) => set((s) => ({ lyricsText, lines: reparse({ ...s, lyricsText }) })),

      commitLyricsInput: (text) =>
        set((s) => {
          const trimmed = text.trim();
          if (!trimmed) return { lyricsText: "", lines: [], lyricsCollapsed: false };
          if (hasTimestamps(trimmed)) {
            return {
              lyricsText: trimmed,
              lines: reparse({ ...s, lyricsText: trimmed }),
              lyricsCollapsed: true,
            };
          }
          const blocks = normalizeMultilineJapaneseBlocks(trimmed).map(splitLyricTriplet);
          if (blocks.length === s.lines.length) {
            const timed = s.lines.map((l, i) => ({
              ...toTimed(l),
              rawText: blocks[i].mainRaw,
              pronText: blocks[i].pronText,
              transText: blocks[i].transText,
              overlap: blocks[i].overlap && i > 0,
            }));
            return { ...fromTimed(s, timed), lyricsCollapsed: true };
          }
          const lyricsText = autoDistributeLyrics(trimmed, s.duration, s.sync.introGateSec);
          return { lyricsText, lines: reparse({ ...s, lyricsText }), lyricsCollapsed: true };
        }),

      setLyricsCollapsed: (lyricsCollapsed) => set({ lyricsCollapsed }),

      clearLyrics: () => set({ lyricsText: "", lines: [], lyricsCollapsed: false }),

      updateLine: (index, patch) =>
        set((s) => {
          if (!s.lines[index]) return {};
          const timed = s.lines.map((l, i) => (i === index ? { ...toTimed(l), ...patch } : toTimed(l)));
          return fromTimed(s, timed);
        }),

      autoCompose: (seed) =>
        set((s) => {
          const style = { ...s.style, ...composeStyle(s.style, seed) };
          if (s.lines.length === 0) return { style };
          return { style, ...fromTimed(s, composeLines(s.lines.map(toTimed), style, seed)) };
        }),

      restoreComposition: ({ style, lyricsText }) =>
        set((s) => ({ style, lyricsText, lines: reparse({ ...s, lyricsText }) })),

      rerollLine: (index) =>
        set((s) => {
          const line = s.lines[index];
          if (!line) return {};
          const motion = rerollMotion(line, s.style, mulberry32(freshSeed()));
          const timed = s.lines.map((l, i) =>
            i === index ? { ...toTimed(l), lineStyle: { ...l.lineStyle, motion } } : toTimed(l),
          );
          return fromTimed(s, timed);
        }),

      updateLines: (indices, patch) =>
        set((s) => {
          const pick = new Set(indices);
          if (![...pick].some((i) => s.lines[i])) return {};
          const timed = s.lines.map((l, i) => {
            const t = toTimed(l);
            return pick.has(i) ? { ...t, ...patch(t) } : t;
          });
          return fromTimed(s, timed);
        }),

      removeLines: (indices) =>
        set((s) => {
          const pick = new Set(indices);
          const timed = s.lines.filter((_, i) => !pick.has(i)).map(toTimed);
          if (timed.length === s.lines.length) return {};
          return { ...fromTimed(s, timed), lyricsCollapsed: timed.length > 0 && s.lyricsCollapsed };
        }),

      rerollLines: (indices) =>
        set((s) => {
          const pick = new Set(indices);
          const rand = mulberry32(freshSeed());
          const timed = s.lines.map((l) =>
            pick.has(s.lines.indexOf(l))
              ? { ...toTimed(l), lineStyle: { ...l.lineStyle, motion: rerollMotion(l, s.style, rand) } }
              : toTimed(l),
          );
          return fromTimed(s, timed);
        }),

      setThemeSpan: (rawStart, rawEnd) => {
        let added: string | null = null;
        set((s) => {
          const start = Math.round(Math.max(0, rawStart) * 100) / 100;
          const end = Math.round(Math.min(s.duration, rawEnd) * 100) / 100;
          if (end - start < MIN_CLIP - 1e-6) return {};
          // Clips under the new one are cut back to its edges (split when it lands inside one)
          const kept = (s.style.themeClips ?? []).flatMap((c): ThemeClip[] => {
            if (c.end <= start || c.start >= end) return [c];
            const parts: ThemeClip[] = [];
            if (c.start < start) parts.push({ ...c, end: start });
            if (c.end > end) parts.push({ ...c, id: parts.length ? newId("theme") : c.id, start: end });
            return parts.filter((p) => p.end - p.start >= MIN_CLIP - 1e-6);
          });
          const clip: ThemeClip = {
            id: newId("theme"),
            start,
            end,
            lookPreset: s.style.lookPreset === "classic" ? DEFAULT_STYLE_THEME : s.style.lookPreset,
            mixLooks: s.style.mixLooks,
            lyricLook: s.style.lyricLook,
          };
          added = clip.id;
          return { style: { ...s.style, themeClips: sortClips([...kept, clip]) } };
        });
        return added;
      },

      removeLine: (index) =>
        set((s) => {
          if (!s.lines[index]) return {};
          const timed = s.lines.filter((_, i) => i !== index).map(toTimed);
          return { ...fromTimed(s, timed), lyricsCollapsed: timed.length > 0 && s.lyricsCollapsed };
        }),

      autoDistribute: () =>
        set((s) => {
          const lyricsText = autoDistributeLyrics(s.lyricsText, s.duration, s.sync.introGateSec);
          return { lyricsText, lines: reparse({ ...s, lyricsText }) };
        }),

      loadSampleLyrics: () =>
        set((s) => {
          const lyricsText = SAMPLE_LYRICS[s.style.language];
          return { lyricsText, lines: reparse({ ...s, lyricsText }), lyricsCollapsed: true };
        }),

      setAudio: (audio) =>
        set((s) => {
          const duration =
            audio.kind === "upload" ? Math.max(6, Number(audio.duration.toFixed(1))) : DEFAULT_DURATION;
          // Another song gets its own mix of lyric motions; the same song keeps the user's picks
          const song = audio.kind === "upload" ? `${audio.fileName}|${duration}` : "";
          const style =
            song && song !== s.style.motionSong
              ? { ...s.style, motionSong: song, motionPicks: pickMotions(textSeed(song)) }
              : s.style;
          return { audio, duration, style, lines: reparse({ ...s, duration }) };
        }),

      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),

      applyLookPreset: (id) =>
        set((s) => ({
          style: { ...s.style, ...getLookPreset(id).palette, lookPreset: id, mixLooks: [], lyricLook: null },
        })),

      toggleTheme: (id) =>
        set((s) => {
          const st = s.style;
          const picked = pickedLooks(st);
          if (!isThemedPresetId(id)) return {};
          if (picked.includes(id)) {
            // Unpicking the last theme goes back to the default theme, with its colors and element defaults
            if (picked.length === 1) {
              const lookElements = Object.fromEntries(
                Object.entries(st.lookElements).filter(
                  ([k]) => !k.startsWith(`${DEFAULT_STYLE.lookPreset}.`),
                ),
              );
              return {
                style: {
                  ...st,
                  ...getLookPreset(DEFAULT_STYLE.lookPreset).palette,
                  lookPreset: DEFAULT_STYLE.lookPreset,
                  mixLooks: [],
                  lyricLook: null,
                  lookElements,
                },
              };
            }
            // Unpicking: the next theme takes over the background
            const rest = picked.filter((p) => p !== id) as Exclude<LookPresetId, "classic">[];
            return {
              style: {
                ...st,
                lookPreset: rest[0],
                mixLooks: rest.slice(1),
                lyricLook: st.lyricLook === id ? null : st.lyricLook,
              },
            };
          }
          if (picked.length > MAX_MIX_LOOKS) return {};
          return { style: { ...st, mixLooks: [...st.mixLooks, id] } };
        }),

      setBaseLook: (id) =>
        set((s) => {
          const picked = pickedLooks(s.style);
          if (!picked.includes(id) || s.style.lookPreset === id) return {};
          const mixLooks = picked.filter((p) => p !== id) as Exclude<LookPresetId, "classic">[];
          return { style: { ...s.style, lookPreset: id, mixLooks } };
        }),

      setLyricLook: (id) => set((s) => ({ style: { ...s.style, lyricLook: id } })),

      applyPalette: (id) => set((s) => ({ style: { ...s.style, ...getLookPreset(id).palette } })),

      setIllustration: (patch) =>
        set((s) => ({ style: { ...s.style, illustration: { ...s.style.illustration, ...patch } } })),

      setImage: (slot, asset) => set((s) => ({ images: { ...s.images, [slot]: asset } })),

      addProp: (asset, at) =>
        set((s) => ({
          props: [...s.props, { ...asset, onTimeline: true, clips: [makeClip(at, s.duration)] }],
        })),

      removeProp: (id) => set((s) => ({ props: s.props.filter((p) => p.id !== id) })),

      setPropOnTimeline: (id, on, at) =>
        set((s) => ({
          props: s.props.map((p) =>
            p.id !== id
              ? p
              : {
                  ...p,
                  onTimeline: on,
                  clips: on && p.clips.length === 0 ? [makeClip(at, s.duration)] : p.clips,
                },
          ),
        })),

      addPropClip: (id, at) => {
        let added: string | null = null;
        set((s) => ({
          props: s.props.map((p) => {
            if (p.id !== id || !freeAt(p.clips, at)) return p;
            const made = makeClip(at, s.duration);
            const clip = fitClip(made, made, p.clips, s.duration);
            if (clip.end - clip.start < MIN_CLIP - 1e-6) return p;
            added = clip.id;
            return { ...p, clips: sortClips([...p.clips, clip]) };
          }),
        }));
        return added;
      },

      updatePropClip: (id, clipId, patch) =>
        set((s) => ({
          props: s.props.map((p) => {
            if (p.id !== id) return p;
            const cur = p.clips.find((c) => c.id === clipId);
            if (!cur) return p;
            const timed = patch.start !== undefined || patch.end !== undefined;
            const next = { ...cur, ...patch };
            const clip = timed ? fitClip(next, cur, p.clips, s.duration) : next;
            return { ...p, clips: sortClips(p.clips.map((c) => (c.id === clipId ? clip : c))) };
          }),
        })),

      addThemeClip: (at) => {
        let added: string | null = null;
        set((s) => {
          const clips = s.style.themeClips ?? [];
          if (!freeAt(clips, at)) return {};
          const start = Math.round(Math.min(Math.max(0, at), Math.max(0, s.duration - MIN_CLIP)) * 100) / 100;
          const made: ThemeClip = {
            id: newId("theme"),
            start,
            end: Math.min(s.duration, start + 8),
            lookPreset: s.style.lookPreset === "classic" ? DEFAULT_STYLE_THEME : s.style.lookPreset,
            mixLooks: s.style.mixLooks,
            lyricLook: s.style.lyricLook,
          };
          const clip = fitClip(made, made, clips, s.duration);
          if (clip.end - clip.start < MIN_CLIP - 1e-6) return {};
          added = clip.id;
          return { style: { ...s.style, themeClips: sortClips([...clips, clip]) } };
        });
        return added;
      },

      placeTheme: (id, at) => {
        let added: string | null = null;
        set((s) => {
          const clips = s.style.themeClips ?? [];
          if (!freeAt(clips, at)) return {};
          const start = Math.max(0, ...clips.filter((c) => c.end <= at).map((c) => c.end));
          const end = Math.min(s.duration, ...clips.filter((c) => c.start > at).map((c) => c.start));
          if (end - start < MIN_CLIP - 1e-6) return {};
          const clip: ThemeClip = {
            id: newId("theme"),
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            lookPreset: id,
            mixLooks: [],
            lyricLook: null,
          };
          added = clip.id;
          return { style: { ...s.style, themeClips: sortClips([...clips, clip]) } };
        });
        return added;
      },

      updateThemeClip: (id, patch) =>
        set((s) => {
          const clips = s.style.themeClips ?? [];
          const cur = clips.find((c) => c.id === id);
          if (!cur) return {};
          const next = { ...cur, ...patch };
          const timed = patch.start !== undefined || patch.end !== undefined;
          const clip = timed ? fitClip(next, cur, clips, s.duration) : next;
          return {
            style: { ...s.style, themeClips: sortClips(clips.map((c) => (c.id === id ? clip : c))) },
          };
        }),

      removeThemeClip: (id) =>
        set((s) => ({
          style: { ...s.style, themeClips: (s.style.themeClips ?? []).filter((c) => c.id !== id) },
        })),

      removePropClip: (id, clipId) =>
        set((s) => ({
          props: s.props.map((p) =>
            p.id === id ? { ...p, clips: p.clips.filter((c) => c.id !== clipId) } : p,
          ),
        })),

      setDetail: (patch) => set((s) => ({ style: { ...s.style, detail: { ...s.style.detail, ...patch } } })),

      setLookElement: (id, patch, theme) =>
        set((s) => {
          const preset = theme ?? s.style.lookPreset;
          const key = lookElementKey(preset, id);
          const next = { ...getLookElement(s.style.lookElements, preset, id), ...patch };
          return { style: { ...s.style, lookElements: { ...s.style.lookElements, [key]: next } } };
        }),

      setSync: (patch) =>
        set((s) => {
          const sync = { ...s.sync, ...patch };
          return { sync, lines: reparse({ ...s, sync }) };
        }),

      applyLineTimes: (startTimes) =>
        set((s) => {
          if (startTimes.length !== s.lines.length || s.lines.length === 0) return {};
          const lyricsText = linesToLrc(s.lines, startTimes);
          // A first line found inside the intro would otherwise be pushed back to the gate
          const sync = { ...s.sync, introGateSec: Math.min(s.sync.introGateSec, Math.min(...startTimes)) };
          return { lyricsText, sync, lines: reparse({ ...s, lyricsText, sync }) };
        }),

      setSubtitles: (patch) => set((s) => ({ subtitles: { ...s.subtitles, ...patch } })),

      setFx: (key, on) => set((s) => ({ fx: { ...s.fx, [key]: on } })),

      importProject: (saved) => set((s) => restoreProject(saved, s)),

      setFxGroup: (keys, on) =>
        set((s) => {
          const fx: FxToggles = { ...s.fx };
          for (const key of keys) fx[key] = on;
          return { fx };
        }),
    }),
    {
      name: projectStorageKey(MODE),
      // Rehydrated from the client (StudioShell) so the server-rendered HTML matches the first paint.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      // Audio and images are object URLs that die with the page, so they are never persisted.
      partialize: savedPart,
      merge: restoreProject,
    },
  ),
);
