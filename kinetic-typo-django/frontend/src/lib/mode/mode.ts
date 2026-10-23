import type { LookPresetId } from "@/types/project";

/**
 * Which studio the page is: the landing page links to /beginner/, /basic/ and
 * /pro/, and Django writes the mode on #root as data-mode.
 */
export type StudioMode = "beginner" | "basic" | "pro";

export const STUDIO_MODES: readonly StudioMode[] = ["beginner", "basic", "pro"];

export const MODE_LABEL: Record<StudioMode, string> = {
  beginner: "입문",
  basic: "기본",
  pro: "숙련",
};

export const MODE_PATH: Record<StudioMode, string> = {
  beginner: "/beginner/",
  basic: "/basic/",
  pro: "/pro/",
};

/** The only themes a beginner picks from, one at a time. */
export const BEGINNER_THEMES: readonly Exclude<LookPresetId, "classic">[] = [
  "album_jacket",
  "digital_crt",
  "flat_type",
];

/** What the full editor (basic and pro) shows; the beginner page has its own guided layout. */
export interface ModeFeatures {
  /** Up to three themes with every element, instead of one of the beginner themes. */
  themeMix: boolean;
  /** Character and prop layers with their timeline lanes and cues. */
  characters: boolean;
  /** SRT/VTT/ASS/LRC files next to the video. */
  subtitleFiles: boolean;
}

const FEATURES: Record<StudioMode, ModeFeatures> = {
  beginner: {
    themeMix: false,
    characters: false,
    subtitleFiles: false,
  },
  basic: {
    themeMix: true,
    characters: false,
    subtitleFiles: true,
  },
  pro: {
    themeMix: true,
    characters: true,
    subtitleFiles: true,
  },
};

export const isStudioMode = (v: unknown): v is StudioMode =>
  typeof v === "string" && (STUDIO_MODES as readonly string[]).includes(v);

/** Anything unknown (tests, an old page without the attribute) is the full studio. */
export const parseMode = (v: unknown): StudioMode => (isStudioMode(v) ? v : "pro");

export const featuresFor = (mode: StudioMode): ModeFeatures => FEATURES[mode];

/** Each mode keeps its own saved project, so trying a simpler mode never trims the full one. */
export const projectStorageKey = (mode: StudioMode): string =>
  mode === "pro" ? "kinetic-typo-project-v1" : `kinetic-typo-project-${mode}-v1`;

function readMode(): StudioMode {
  if (typeof document === "undefined") return "pro";
  return parseMode(document.getElementById("root")?.dataset.mode);
}

/** Fixed for the life of the page: switching modes is a page load. */
export const MODE: StudioMode = readMode();
export const FEATURES_NOW: ModeFeatures = featuresFor(MODE);
