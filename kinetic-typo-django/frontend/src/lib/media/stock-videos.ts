// Free stock videos from Mixkit (mixkit.co) offered as backgrounds in the app.
// Under the Mixkit Stock Video Free License they can be used in commercial
// and personal projects, music videos included, without attribution. The app
// links to each item and loads the file from Mixkit only when the user picks
// it; nothing is bundled or re-hosted here. A video's own page states which
// license it has, so the browser links there.

export type StockCategory = "sky" | "night" | "rain" | "nature" | "space" | "light";

export interface StockVideo {
  id: string;
  title: string;
  /** Korean search words. */
  tags: string;
  category: StockCategory;
  pageUrl: string;
}

export const STOCK_CATEGORIES: ReadonlyArray<readonly [StockCategory, string]> = [
  ["sky", "하늘 · 노을"],
  ["night", "밤 · 도시"],
  ["rain", "비 · 물"],
  ["nature", "꽃 · 자연 · 눈"],
  ["space", "우주 · 추상"],
  ["light", "빛 · 보케"],
];

const page = (slug: string) => `https://mixkit.co/free-stock-video/${slug}/`;

const v = (id: number, title: string, tags: string, category: StockCategory, slug: string): StockVideo => ({
  id: String(id),
  title,
  tags,
  category,
  pageUrl: page(`${slug}-${id}`),
});

export const STOCK_VIDEOS: readonly StockVideo[] = [
  v(14165, "구름 위 꿈속 여행", "구름 몽환 하늘", "sky", "traveling-to-the-dream-world-through-the-clouds"),
  v(
    51105,
    "빠르게 흐르는 흰 구름",
    "구름 파란 하늘 타임랩스",
    "sky",
    "white-clouds-moving-across-a-clear-blue-sky-quickly",
  ),
  v(44496, "고요한 해변의 노을", "노을 해변 바다 석양", "sky", "sunset-from-a-peaceful-beach"),
  v(44499, "야자수 해변 노을", "노을 야자수 여름", "sky", "sunset-on-a-beach-with-a-palm-tree"),
  v(
    51445,
    "해변 너머 지는 해",
    "노을 바다 석양",
    "sky",
    "sunset-behind-the-skyline-on-the-beach-over-the-sea",
  ),
  v(51492, "태평양 해변의 해돋이", "해돋이 아침 바다", "sky", "sunrise-on-a-virgin-pacific-beach"),
  v(4840, "옥상의 노을", "노을 옥상 도시", "sky", "woman-during-a-sunset-on-a-rooftop"),

  v(4451, "조용한 도쿄 밤거리", "밤 도쿄 일본 골목 거리", "night", "quiet-tokyo-street-at-night"),
  v(4231, "도쿄 횡단보도", "도쿄 사람 거리 낮", "night", "pedestrian-walk-in-tokyo"),
  v(4332, "비 오는 밤 타임스스퀘어", "밤 비 도시 네온", "night", "times-square-during-a-rainy-night"),
  v(49878, "밤 도시 항공 촬영", "밤 도시 야경 드론", "night", "big-city-at-night-from-an-aerial-shot"),
  v(41375, "해 질 녘 도시 위", "노을 도시 야경", "night", "tour-high-above-a-city-at-dusk"),
  v(4240, "밤 도로 타임랩스", "밤 차 도로 빛", "night", "time-lapse-of-traffic-at-night"),
  v(3428, "저녁 거리의 사람들", "저녁 거리 사람", "night", "street-with-people-walking-at-dusk"),
  v(4308, "밤 도시 내려다보기", "야경 도시 밤", "night", "aerial-view-of-a-city-during-the-night"),

  v(2846, "비 오는 날 창문", "비 창문 빗방울 감성", "rain", "window-on-a-rainy-day"),
  v(18308, "김 서린 창에 하트", "비 창문 하트 사랑", "rain", "drawing-a-heart-on-a-foggy-window-on-a-rainy"),
  v(18312, "호수에 떨어지는 비", "비 호수 물결", "rain", "rain-falling-on-the-water-of-a-lake-seen-up"),
  v(2716, "지붕에서 떨어지는 빗물", "비 지붕 빗물", "rain", "rain-falling-from-the-roof-on-a-rainy-day"),
  v(4331, "비 오는 밤 도로", "비 밤 차 도로", "rain", "traffic-on-a-rainy-night"),
  v(106, "물방울 파문", "물 물방울 파문", "rain", "water-drops-creating-ripples"),
  v(4422, "밤의 뇌우", "번개 천둥 폭풍 밤", "rain", "thunderstorm-at-night"),
  v(47948, "번개와 천둥", "번개 폭풍", "rain", "lightning-strike-and-thunders"),
  v(5016, "해변으로 밀려오는 파도", "파도 바다 해변", "rain", "waves-coming-to-the-beach"),
  v(2213, "숲속 폭포", "폭포 숲 물", "rain", "waterfall-in-forest"),

  v(48889, "봄날의 벚꽃", "벚꽃 봄 꽃 일본", "nature", "japanese-cherry-blossom-in-spring"),
  v(1168, "바람에 흔들리는 분홍 꽃", "꽃 분홍 바람", "nature", "pink-flowers-wave-in-the-breeze"),
  v(1187, "바람 속 하얀 꽃", "꽃 하얀 바람", "nature", "white-flowers-in-the-breeze"),
  v(4881, "해바라기 들판", "해바라기 여름 들판", "nature", "gigantic-field-of-sunflowers-on-a-sunny-day"),
  v(4075, "시골 초원", "초원 들판 풀", "nature", "countryside-meadow"),
  v(3317, "눈 덮인 숲길", "눈 겨울 숲 길", "nature", "curve-on-a-snowy-forest-road"),
  v(
    34372,
    "나무 사이 햇빛 플레어",
    "햇빛 숲 플레어",
    "nature",
    "lens-flares-from-the-sun-through-the-out-of-focus-trees",
  ),
  v(4281, "마테호른 산 풍경", "산 눈 풍경", "nature", "matterhorn-mountain-landscape"),

  v(1610, "우주의 별", "별 우주 밤하늘", "space", "stars-in-space-background"),
  v(4148, "은하수", "은하수 별 밤하늘", "space", "milky-way-seen-at-night"),
  v(1704, "호수 위 별 타임랩스", "별 호수 밤하늘", "space", "night-sky-with-stars-at-a-calm-lake-time-lapse"),
  v(31562, "프랙털 우주 터널", "터널 우주 추상", "space", "going-through-a-space-tunnel-with-fractal-shapes"),
  v(31497, "검은 큐브 터널", "터널 3D 큐브 추상", "space", "traveling-through-a-tunnel-of-black-cubes-in-3d"),
  v(44818, "흐르는 검은 잉크", "잉크 추상 액체", "space", "abstract-video-of-a-liquid-with-dark-ink-flowing"),
  v(4974, "흑백 추상 구성", "흑백 추상", "space", "monochromatic-visual-compositions"),
  v(3524, "TV 글리치 질감", "글리치 노이즈 TV", "space", "television-glich-texture"),
  v(34317, "파란 빛 삼각 터널", "터널 파랑 빛", "space", "triangular-tunnel-with-blue-lights-in-its-walls"),
  v(4433, "안개 낀 보름달", "달 보름달 밤", "space", "full-moon-with-a-soft-haze"),

  v(38, "깜빡이는 동그란 빛", "보케 빛 반짝", "light", "blinking-round-lights-with-bokeh-effect"),
  v(
    30,
    "밤 자동차 불빛 보케",
    "보케 밤 빛 흐림",
    "light",
    "blurred-abstract-cars-lights-at-night-with-bokeh-effect",
  ),
  v(18140, "빛나는 입자", "입자 빛 우주", "light", "layer-of-luminous-particles-in-space"),
  v(19007, "반짝이 별과 눈송이", "반짝이 눈 별 겨울", "light", "glitter-stars-and-snowflakes"),
  v(47282, "파란 크리스털 빛샘", "빛샘 파랑 오버레이", "light", "blue-crystal-like-light-leak-overlay"),
  v(4064, "밤하늘 불꽃놀이", "불꽃놀이 축제 밤", "light", "fireworks-at-night-sky"),
  v(4157, "해변 불꽃놀이", "불꽃놀이 해변", "light", "fireworks-illuminating-the-beach-sky"),
  v(28897, "검은 배경의 시계", "시계 시간 검정", "light", "slowly-approaching-a-clock-on-a-black-background"),
];

/** Older Mixkit items keep their files at a fixed path; the smaller file is the quick preview. */
export const stockFileUrl = (id: string, height: 360 | 720) =>
  `https://assets.mixkit.co/videos/${id}/${id}-${height}.mp4`;

export const stockThumbUrl = (id: string) => `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`;

export const MIXKIT_LICENSE_URL = "https://mixkit.co/license/#videoFree";

/** Videos whose title or Korean words contain every word of the query. */
export function searchStock(query: string, category: StockCategory | "all"): StockVideo[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return STOCK_VIDEOS.filter(
    (s) =>
      (category === "all" || s.category === category) &&
      words.every((w) => `${s.title} ${s.tags}`.toLowerCase().includes(w)),
  );
}
