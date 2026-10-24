import type {
  FxToggles,
  IllustrationSettings,
  LookElementState,
  LookPresetId,
  StyleSettings,
} from "@/types/project";

export interface LookPreset {
  id: LookPresetId;
  emoji: string;
  label: string;
  /** One line shown under the preset button. */
  description: string;
  /** Style fields applied when the preset is picked; the user can still change them after. */
  palette: Pick<
    StyleSettings,
    "bgColor" | "textColor" | "accentColor" | "secondaryColor" | "mainFont" | "accentFont"
  >;
}

const GOTHIC = "'Noto Sans JP', 'Noto Sans KR', sans-serif";
const HEAVY = "'Dela Gothic One', 'Black Han Sans', 'Noto Sans JP', sans-serif";
const MINCHO = "'Shippori Mincho', 'Nanum Myeongjo', serif";

export const LOOK_PRESETS: readonly LookPreset[] = [
  {
    id: "album_jacket",
    emoji: "💿",
    label: "앨범 자켓",
    description: "커버 한 장으로: 흐린 배경, 도는 레코드, 곡 제목과 가사 칸",
    palette: {
      bgColor: "#0d0b2e",
      textColor: "#ffffff",
      accentColor: "#3d3dff",
      secondaryColor: "#a5b4fc",
      mainFont: "'Noto Sans KR', 'Noto Sans JP', sans-serif",
      accentFont: "'Noto Sans KR', 'Noto Sans JP', sans-serif",
    },
  },
  {
    id: "pop_cutout",
    emoji: "🟨",
    label: "팝 컷아웃",
    description: "파스텔 단색, 통통 튀는 캐릭터, 크기가 섞인 가사 블록",
    palette: {
      bgColor: "#fbe38e",
      textColor: "#1c1917",
      accentColor: "#ef4f5f",
      secondaryColor: "#ffffff",
      mainFont: HEAVY,
      accentFont: GOTHIC,
    },
  },
  {
    id: "tint_panels",
    emoji: "🟪",
    label: "틴트 조각 패널",
    description: "한 색조로 물든 일러스트, 조각 패널, 빛줄기",
    palette: {
      bgColor: "#1a0b3d",
      textColor: "#ffffff",
      accentColor: "#8b5cf6",
      secondaryColor: "#f0abfc",
      mainFont: GOTHIC,
      accentFont: "'JetBrains Mono', monospace",
    },
  },
  {
    id: "ballad_hud",
    emoji: "🤍",
    label: "감성 발라드 HUD",
    description: "하얗게 번진 빛, 얇은 HUD 장식, 작은 「- 가사 -」",
    palette: {
      bgColor: "#efe7f3",
      textColor: "#ffffff",
      accentColor: "#8f7fd8",
      secondaryColor: "#f4c6d7",
      mainFont: MINCHO,
      accentFont: "'JetBrains Mono', monospace",
    },
  },
  {
    id: "cinematic_fantasy",
    emoji: "🌕",
    label: "시네마틱 판타지",
    description: "레터박스, 금빛 광채, 떠오르는 등불, 세로쓰기",
    palette: {
      bgColor: "#120a05",
      textColor: "#fff4dc",
      accentColor: "#f6b44a",
      secondaryColor: "#ff7a3d",
      mainFont: MINCHO,
      accentFont: MINCHO,
    },
  },
  {
    id: "digital_crt",
    emoji: "🖥",
    label: "디지털 UI · CRT",
    description: "창 프레임 속 일러스트, 픽셀 격자, 타자 효과",
    palette: {
      bgColor: "#0b0614",
      textColor: "#e0fbff",
      accentColor: "#ff4fd8",
      secondaryColor: "#22d3ee",
      mainFont: GOTHIC,
      accentFont: "'JetBrains Mono', monospace",
    },
  },
  {
    id: "dark_glitch",
    emoji: "⬛",
    label: "다크 글리치",
    description: "검은 화면, RGB 분리, 흩뿌린 [ 가사 ]",
    palette: {
      bgColor: "#000000",
      textColor: "#ffffff",
      accentColor: "#c084fc",
      secondaryColor: "#38bdf8",
      mainFont: GOTHIC,
      accentFont: "'JetBrains Mono', monospace",
    },
  },
  {
    id: "summer_film",
    emoji: "🌊",
    label: "청량 여름 필름",
    description: "파란 하늘과 구름, 햇살 플레어, 폴라로이드 액자와 필름 띠",
    palette: {
      bgColor: "#5cc8f2",
      textColor: "#ffffff",
      accentColor: "#1673c9",
      secondaryColor: "#fff3b0",
      mainFont: GOTHIC,
      accentFont: GOTHIC,
    },
  },
  {
    id: "flat_type",
    emoji: "🅰",
    label: "플랫 대형 타이포",
    description: "줄마다 뒤집히는 단색 면, 화면을 채우는 굵은 가사, 스티커 장식",
    palette: {
      bgColor: "#ff5b3a",
      textColor: "#141414",
      accentColor: "#ffffff",
      secondaryColor: "#2f5bff",
      mainFont: HEAVY,
      accentFont: GOTHIC,
    },
  },
  {
    id: "eclipse_nebula",
    emoji: "🌑",
    label: "이클립스 성운",
    description: "검은 우주, 캐릭터 뒤의 빛나는 링, 금빛 플레어, 넓은 자간의 가사",
    palette: {
      bgColor: "#05040b",
      textColor: "#f6f1ff",
      accentColor: "#a77bff",
      secondaryColor: "#ffc56b",
      mainFont: MINCHO,
      accentFont: GOTHIC,
    },
  },
  {
    id: "mono_accent",
    emoji: "◼",
    label: "모노 포인트 컬러",
    description: "흑백 그림에 한 가지 색만, 굵은 색 띠와 라벨 상자 가사",
    palette: {
      bgColor: "#111111",
      textColor: "#f5f5f5",
      accentColor: "#ff3b3b",
      secondaryColor: "#ffffff",
      mainFont: HEAVY,
      accentFont: GOTHIC,
    },
  },
  {
    id: "vintage_paper",
    emoji: "📜",
    label: "빈티지 종이 액자",
    description: "세피아 색감, 낡은 종이, 장식 테두리와 필름 스크래치",
    palette: {
      bgColor: "#2b1d10",
      textColor: "#3a2612",
      accentColor: "#8a5a2b",
      secondaryColor: "#f3e6c8",
      mainFont: MINCHO,
      accentFont: MINCHO,
    },
  },
  {
    id: "pastel_dream",
    emoji: "🫧",
    label: "파스텔 꿈결",
    description: "부드럽게 번진 그림, 보케와 작은 하트, 떠오르는 가사",
    palette: {
      bgColor: "#fde7f1",
      textColor: "#6b4a8a",
      accentColor: "#ff7eb6",
      secondaryColor: "#c9e7ff",
      mainFont: GOTHIC,
      accentFont: GOTHIC,
    },
  },
  {
    id: "crimson_ink",
    emoji: "🏮",
    label: "붉은 먹 동양풍",
    description: "붉게 물든 그림, 먹 붓질, 낙관, 불티와 세로 가사",
    palette: {
      bgColor: "#1a0505",
      textColor: "#fff1e6",
      accentColor: "#c8102e",
      secondaryColor: "#ffb347",
      mainFont: MINCHO,
      accentFont: MINCHO,
    },
  },
  {
    id: "sakura_breeze",
    emoji: "🌸",
    label: "벚꽃 바람",
    description: "분홍빛 봄, 바람에 날리는 꽃잎, 옆으로 흘러드는 가사",
    palette: {
      bgColor: "#fff0f4",
      textColor: "#7a2e4a",
      accentColor: "#e0457b",
      secondaryColor: "#ffc1d3",
      mainFont: GOTHIC,
      accentFont: MINCHO,
    },
  },
  {
    id: "snow_night",
    emoji: "❄",
    label: "눈 내리는 겨울밤",
    description: "푸른 밤, 앞뒤로 내리는 눈, 달빛과 넓은 자간의 가사",
    palette: {
      bgColor: "#070d1c",
      textColor: "#eef5ff",
      accentColor: "#4f7cff",
      secondaryColor: "#bcd4ff",
      mainFont: MINCHO,
      accentFont: GOTHIC,
    },
  },
  {
    id: "rain_window",
    emoji: "☔",
    label: "비 내리는 창가",
    description: "흐린 유리 너머 거리, 빗줄기와 물방울, 타자 치듯 나오는 가사",
    palette: {
      bgColor: "#0b1118",
      textColor: "#e8f1fb",
      accentColor: "#ff8a5b",
      secondaryColor: "#8fb8de",
      mainFont: GOTHIC,
      accentFont: "'JetBrains Mono', monospace",
    },
  },
  {
    id: "manga_panel",
    emoji: "💥",
    label: "만화 컷",
    description: "스크린톤 흑백, 컷 분할, 집중선과 말풍선 가사",
    palette: {
      bgColor: "#ffffff",
      textColor: "#111111",
      accentColor: "#e11d48",
      secondaryColor: "#ffffff",
      mainFont: HEAVY,
      accentFont: GOTHIC,
    },
  },
  {
    id: "deep_sea",
    emoji: "🐋",
    label: "심해 물빛",
    description: "푸른 물속, 일렁이는 빛, 물기둥 빛줄기와 거품",
    palette: {
      bgColor: "#020c1c",
      textColor: "#e6fbff",
      accentColor: "#1f6fb2",
      secondaryColor: "#7fe3ff",
      mainFont: GOTHIC,
      accentFont: GOTHIC,
    },
  },
  {
    id: "neon_sign",
    emoji: "🔆",
    label: "네온 사인",
    description: "어두운 벽, 깜빡이며 켜지는 네온 글자와 네온 테두리",
    palette: {
      bgColor: "#07040a",
      textColor: "#ffffff",
      accentColor: "#ff2fb4",
      secondaryColor: "#3ef0ff",
      mainFont: GOTHIC,
      accentFont: GOTHIC,
    },
  },
];

export const LOOK_PRESET_IDS: readonly LookPresetId[] = LOOK_PRESETS.map((p) => p.id);

export function isLookPresetId(value: unknown): value is LookPresetId {
  return typeof value === "string" && (LOOK_PRESET_IDS as readonly string[]).includes(value);
}

export function getLookPreset(id: LookPresetId): LookPreset {
  return LOOK_PRESETS.find((p) => p.id === id) ?? LOOK_PRESETS[0];
}

export const DEFAULT_ILLUSTRATION: IllustrationSettings = {
  motion: 0.6,
  bgLocked: false,
  bgX: 0,
  bgY: 0,
  bgZoom: 1,
  charLocked: false,
  charX: 0.24,
  charY: 1,
  characterScale: 0.8,
  charFlip: false,
  beatBounce: true,
  charShake: 0.5,
  charCues: [],
  showCharacter: true,
  avoidCharacter: true,
  noTextCells: Array<boolean>(16).fill(false),
};

/**
 * Where an element is drawn, which decides when it takes effect:
 * scene — only while its theme is the background theme;
 * lyrics — only while its theme draws the lyrics;
 * decor, overlay — whenever its theme is picked.
 */
export type ElementRole = "scene" | "decor" | "lyrics" | "overlay";

export interface LookElementDef {
  id: string;
  label: string;
  on: boolean;
  amount: number;
  role: ElementRole;
  /** A shape with a place of its own (a record, a ring, a seal): the user can move and turn it. */
  move?: boolean;
}

export type ThemedPresetId = Exclude<LookPresetId, "classic">;

const role =
  (r: ElementRole) =>
  (id: string, label: string, amount = 0.6, on = true): LookElementDef => ({
    id,
    label,
    on,
    amount,
    role: r,
  });
const sc = role("scene");
const dc = role("decor");
const ly = role("lyrics");
const ov = role("overlay");
/** Marks an element as movable. */
const mv = (d: LookElementDef): LookElementDef => ({ ...d, move: true });

/** What each theme draws, as switches with a strength the user can tune. */
export const LOOK_ELEMENTS: Record<ThemedPresetId, readonly LookElementDef[]> = {
  album_jacket: [
    sc("blurbg", "흐린 커버 배경", 0.7),
    mv(sc("vinyl", "도는 레코드", 0.4)),
    mv(sc("jacket", "정사각 커버", 0.8, false)),
    sc("pulse", "박자에 맞춰 숨쉬기", 0.6),
    dc("bands", "사선 그림자 띠", 0.6),
    dc("bokeh", "시작 전 빛망울", 0.8),
    dc("particles", "눈송이와 별", 0.6, false),
    mv(ov("title", "곡 제목과 크레딧", 1)),
    ov("wave", "소리 선", 0.8),
    ov("progress", "재생 바", 0.8, false),
    ov("intro", "시작 전 카운트", 0.8),
    ov("flash", "강조 단어 번쩍임", 0.6, false),
    ov("letterbox", "위아래 검은 띠", 1, false),
    ly("ghost", "부를 단어 미리 흐리게", 0.6, false),
    ly("impact", "강조 단어 튀어나오기", 0.6),
    ly("underline", "첫 단어 밑줄", 0.8, false),
    ly("next", "다음 줄 미리보기", 0.7),
  ],
  pop_cutout: [
    sc("wash", "배경색 덮기", 0.3),
    dc("halftone", "망점 무늬", 0.6),
    ov("frame", "손그림 테두리", 0.7),
    ly("pop", "글자 팝 등장", 0.7),
    ly("outline", "흰 외곽선", 0.6),
    sc("hop", "캐릭터 통통", 0.5),
  ],
  tint_panels: [
    sc("wash", "색조 물들이기", 0.55),
    sc("panels", "조각 패널", 0.7),
    dc("beams", "빛줄기", 0.6),
    ov("sparkles", "반짝이", 0.6),
    ly("glow", "글자 글로우", 0.6),
    ov("vignette", "비네팅 · 그레인", 0.6),
  ],
  ballad_hud: [
    ov("pillarbox", "4:3 화면", 1),
    dc("bloom", "빛 번짐", 0.6),
    sc("ink", "잉크 번짐", 0.7),
    ov("hud", "HUD 장식", 0.7),
    ov("dust", "먼지 입자", 0.5),
    ov("grain", "필름 그레인", 0.5),
  ],
  cinematic_fantasy: [
    ov("letterbox", "레터박스", 1),
    dc("grade", "금빛 색보정", 0.55),
    mv(dc("halo", "광채 · 링", 0.6)),
    ov("lanterns", "등불", 0.6),
    ly("glow", "글자 빛", 0.6),
    ov("vignette", "비네팅 · 그레인", 0.6),
  ],
  digital_crt: [
    dc("city", "네온 픽셀 도시", 0.6),
    sc("wash", "네온 색 입히기", 0.55),
    dc("grid", "픽셀 격자", 0.6),
    ov("scanlines", "스캔라인", 0.6),
    ly("fringe", "RGB 번짐", 0.6),
    sc("jolt", "창 흔들림", 0.6),
    ov("hud", "REC · 슬라이더", 0.7),
  ],
  dark_glitch: [
    sc("desat", "흑백 톤", 0.55),
    sc("bands", "화면 밀림", 0.6),
    dc("blocks", "픽셀 조각", 0.6),
    ly("rgb", "RGB 분리", 0.6),
    ov("prism", "프리즘 빛", 0.6),
    ov("bubbles", "물방울", 0.5),
    mv(ov("sidebar", "측면 캡션", 0.7)),
    ov("grain", "비네팅 · 그레인", 0.6),
  ],
  summer_film: [
    mv(sc("polaroid", "폴라로이드 액자", 0.7)),
    dc("clouds", "흘러가는 구름", 0.6),
    dc("flare", "햇살 플레어", 0.6),
    ov("film", "필름 띠", 0.8),
    ov("flash", "줄 시작 플래시", 0.5),
    ly("rise", "글자 떠오르기", 0.6),
  ],
  flat_type: [
    sc("flip", "줄마다 색 뒤집기", 1),
    mv(sc("stamp", "대형 단어 배경", 0.7)),
    dc("stripes", "사선 스트라이프", 0.6),
    dc("dots", "동그라미 스티커", 0.6),
    sc("outline", "캐릭터 흰 테두리", 0.6),
    ly("slam", "글자 쾅 등장", 0.7),
  ],
  eclipse_nebula: [
    dc("nebula", "성운 안개", 0.6),
    dc("stars", "별빛", 0.6),
    mv(dc("ring", "이클립스 링", 0.7)),
    ov("flare", "보라 · 금빛 플레어", 0.6),
    ly("glow", "글자 빛", 0.6),
    ov("vignette", "비네팅 · 그레인", 0.5),
  ],
  mono_accent: [
    sc("mono", "흑백 처리", 1),
    mv(dc("band", "포인트 색 띠", 0.7)),
    mv(dc("ring", "포인트 원", 0.6)),
    ly("label", "라벨 상자", 0.8),
    ly("slide", "옆에서 밀려오기", 0.6),
    ov("grain", "그레인", 0.5),
  ],
  vintage_paper: [
    sc("sepia", "세피아 색감", 0.8),
    dc("paper", "종이 질감", 0.6),
    ov("frame", "장식 테두리", 0.8),
    ov("vignette", "필름 비네팅", 0.6),
    ov("scratches", "필름 스크래치", 0.5),
    ly("soft", "흐릿하게 나타나기", 0.6),
  ],
  pastel_dream: [
    sc("soft", "부드러운 번짐", 0.6),
    dc("bokeh", "보케", 0.6),
    dc("hearts", "작은 하트", 0.5),
    ov("haze", "밝은 안개", 0.5),
    ly("float", "떠오르기", 0.6),
  ],
  crimson_ink: [
    sc("crimson", "붉은 색보정", 0.6),
    mv(dc("brush", "먹 붓질", 0.7)),
    mv(dc("seal", "낙관", 0.8)),
    ov("embers", "불티", 0.6),
    ov("vignette", "비네팅", 0.6),
    ly("glow", "글자 빛", 0.6),
  ],
  sakura_breeze: [
    sc("blush", "분홍 색감", 0.6),
    dc("petals", "꽃잎", 0.7),
    dc("leak", "빛 번짐", 0.5),
    ov("front", "앞쪽 큰 꽃잎", 0.6),
    ly("drift", "옆으로 흘러들기", 0.6),
  ],
  snow_night: [
    sc("cold", "차가운 색보정", 0.6),
    dc("snow", "눈", 0.7),
    mv(dc("moon", "달빛", 0.6)),
    ov("front", "앞쪽 눈", 0.6),
    ov("frost", "서리 가장자리", 0.5),
    ly("glow", "글자 빛", 0.5),
  ],
  rain_window: [
    sc("blur", "흐린 유리", 0.6),
    dc("rain", "빗줄기", 0.7),
    dc("neon", "거리 불빛 보케", 0.6),
    ov("drops", "유리 물방울", 0.6),
    ov("mist", "김 서림", 0.5),
    ly("type", "타자 효과", 0.8),
  ],
  manga_panel: [
    sc("ink", "흑백 잉크", 1),
    dc("tone", "스크린톤", 0.6),
    dc("speed", "집중선", 0.6),
    ov("panels", "컷 분할", 0.8),
    ly("pop", "말풍선 팝", 0.7),
  ],
  deep_sea: [
    sc("depth", "깊은 물빛", 0.6),
    dc("caustics", "일렁이는 빛", 0.6),
    dc("bubbles", "거품", 0.6),
    ov("rays", "물속 빛줄기", 0.6),
    ov("dark", "어두운 가장자리", 0.6),
    ly("sway", "가사 흔들림", 0.6),
  ],
  neon_sign: [
    sc("glowwash", "네온 반사광", 0.5),
    dc("bricks", "벽돌 벽", 0.6),
    dc("tube", "네온 테두리", 0.8),
    ly("flicker", "켜질 때 깜빡임", 0.7),
    ov("haze", "어두운 안개", 0.6),
  ],
};

/** Themes picked besides the background theme, at most this many (three in all). */
export const MAX_MIX_LOOKS = 2;

export const isThemedPresetId = (value: unknown): value is ThemedPresetId =>
  isLookPresetId(value) && value !== "classic";

/** Keeps known themes only, without repeats, and no more than MAX_MIX_LOOKS. */
export function sanitizeMixLooks(saved: unknown): ThemedPresetId[] {
  if (!Array.isArray(saved)) return [];
  const out: ThemedPresetId[] = [];
  for (const v of saved) if (isThemedPresetId(v) && !out.includes(v)) out.push(v);
  return out.slice(0, MAX_MIX_LOOKS);
}

export const lookElementKey = (preset: LookPresetId, id: string): string => `${preset}.${id}`;

/** The element's saved state, or its default. */
export function getLookElement(
  elements: Readonly<Record<string, LookElementState>>,
  preset: LookPresetId,
  id: string,
): LookElementState {
  const saved = elements[lookElementKey(preset, id)];
  if (saved) return saved;
  const def = isThemedPresetId(preset) ? LOOK_ELEMENTS[preset].find((d) => d.id === id) : undefined;
  return { on: def?.on ?? false, amount: def?.amount ?? 0 };
}

/** Picked themes in order: the background theme first, then the mixed ones. */
export function pickedLooks(style: Pick<StyleSettings, "lookPreset" | "mixLooks">): LookPresetId[] {
  return [style.lookPreset, ...style.mixLooks.filter((m) => m !== style.lookPreset)];
}

/** The theme that draws the lyrics: the chosen one when it is picked, else the background theme. */
export function lyricLookOf(
  style: Pick<StyleSettings, "lookPreset" | "mixLooks" | "lyricLook">,
): LookPresetId {
  const picked = pickedLooks(style);
  return style.lyricLook && picked.includes(style.lyricLook) ? style.lyricLook : style.lookPreset;
}

/** True when an element of a picked theme is drawn with the current roles. */
export function elementInEffect(
  style: Pick<StyleSettings, "lookPreset" | "mixLooks" | "lyricLook">,
  preset: ThemedPresetId,
  def: LookElementDef,
): boolean {
  if (def.role === "scene") return style.lookPreset === preset;
  if (def.role === "lyrics") return lyricLookOf(style) === preset;
  return pickedLooks(style).includes(preset);
}

/** Effective strength: 0 when off. */
export function lookElementAmount(
  elements: Readonly<Record<string, LookElementState>>,
  preset: LookPresetId,
  id: string,
): number {
  const st = getLookElement(elements, preset, id);
  return st.on ? st.amount : 0;
}

/** Keeps only well-formed entries from saved data. */
export function sanitizeLookElements(saved: unknown): Record<string, LookElementState> {
  const out: Record<string, LookElementState> = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const { on, amount, x, y, rot } = v as Record<string, unknown>;
    if (typeof on === "boolean" && typeof amount === "number" && Number.isFinite(amount)) {
      const st: LookElementState = { on, amount: Math.min(1, Math.max(0, amount)) };
      const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
      if (fin(x)) st.x = Math.min(0.6, Math.max(-0.6, x));
      if (fin(y)) st.y = Math.min(0.6, Math.max(-0.6, y));
      if (fin(rot)) st.rot = Math.min(180, Math.max(-180, rot));
      out[k] = st;
    }
  }
  return out;
}

/**
 * Element switches for a save made with the retired classic look: it becomes the album jacket
 * theme, and the classic effects the user had on or off carry over to the matching elements.
 * Entries the save already has are kept.
 */
export function classicToAlbumElements(
  style: Partial<StyleSettings> | undefined,
  fx: Partial<FxToggles> | undefined,
  elements: Readonly<Record<string, LookElementState>>,
): Record<string, LookElementState> {
  const s = style ?? {};
  const x = fx ?? {};
  const particles =
    s.particles !== false &&
    (x.particleBlue === true || x.particleYellow === true || x.particleWhite === true);
  const carried: Record<string, boolean | undefined> = {
    next: s.nextPreview,
    ghost: x.ghostWords,
    impact: x.fxImpact,
    underline: x.firstWordUnderline,
    particles: s.particles === undefined && fx === undefined ? undefined : particles,
    bokeh: x.introBokeh,
    intro: x.introGuide,
    flash: s.flashInvert,
    letterbox: s.letterbox,
  };
  const out = { ...elements };
  for (const [id, on] of Object.entries(carried)) {
    const key = lookElementKey("album_jacket", id);
    if (typeof on !== "boolean" || key in out) continue;
    out[key] = { on, amount: getLookElement({}, "album_jacket", id).amount };
  }
  return out;
}
