import type { FxToggleKey, FxToggles } from "@/types/project";

export interface FxToggleGroup {
  title: string;
  items: ReadonlyArray<{ key: FxToggleKey; label: string }>;
}

// Same groups, keys and labels as the original studio, so saved settings carry over.
export const FX_TOGGLE_GROUPS: readonly FxToggleGroup[] = [
  {
    title: "배경 파티클",
    items: [
      { key: "introBokeh", label: "🌃 전주 보케 (큰 원)" },
      { key: "particleBlue", label: "🔵 파란 파티클" },
      { key: "particleYellow", label: "🟡 노란 파티클" },
      { key: "particleWhite", label: "⚪ 흰 파티클" },
      { key: "particleBeatDrift", label: "💓 비트에 맞춰 흐름 가속" },
    ],
  },
  {
    title: "그래픽 레이어",
    items: [
      { key: "motifGraphics", label: "🌙 16인 합작 모티프 그래픽" },
      { key: "creditTag", label: "🏷 STYLE 크레딧 태그" },
      { key: "introGuide", label: "⏳ 전주 안내 · 카운트다운" },
      { key: "interludeGuide", label: "♪ 간주 안내 문구" },
    ],
  },
  {
    title: "글자 모션",
    items: [
      { key: "ghostWords", label: "👻 대기 단어 흐리게 미리 표시" },
      { key: "firstWordUnderline", label: "➖ 첫 단어 밑줄 바" },
      { key: "fxSlice", label: "🔪 갈라짐 (슬라이스)" },
      { key: "fxStretch", label: "↔ 늘어짐 (자간 확장)" },
      { key: "fxDrop", label: "⬇ 낙하" },
      { key: "fxBlur", label: "🌫 흐려짐 (블러)" },
      { key: "fxMirror", label: "🪞 반사 잔상" },
      { key: "fxImpact", label: "💥 강조 팝 · 그림자" },
    ],
  },
];

export const FX_TOGGLE_KEYS: readonly FxToggleKey[] = FX_TOGGLE_GROUPS.flatMap((g) =>
  g.items.map((it) => it.key),
);

export function defaultFxToggles(): FxToggles {
  return Object.fromEntries(FX_TOGGLE_KEYS.map((k) => [k, true])) as FxToggles;
}

/** Keeps only known boolean keys, so stale or foreign saved data can't break the store. */
export function sanitizeFxToggles(saved: unknown): FxToggles {
  const fx = defaultFxToggles();
  if (saved && typeof saved === "object") {
    const record = saved as Record<string, unknown>;
    for (const key of FX_TOGGLE_KEYS) {
      if (typeof record[key] === "boolean") fx[key] = record[key];
    }
  }
  return fx;
}
