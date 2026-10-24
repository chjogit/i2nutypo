import type { ReactNode } from "react";
import { useProjectStore } from "@/store/project-store";

const SUBTITLE_FONTS: Array<{ value: string; label: string }> = [
  { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR (고딕)" },
  { value: "'Nanum Gothic', sans-serif", label: "나눔고딕" },
  { value: "'Nanum Myeongjo', serif", label: "나눔명조" },
  { value: "'Black Han Sans', sans-serif", label: "검은고딕 (Black Han Sans)" },
  { value: "'Noto Sans JP', sans-serif", label: "Noto Sans JP" },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}

/** Settings for the fixed bottom subtitles (pronunciation and meaning rows). */
export function SubtitlePanel() {
  const sub = useProjectStore((s) => s.subtitles);
  const setSubtitles = useProjectStore((s) => s.setSubtitles);
  const fontKnown = SUBTITLE_FONTS.some((f) => f.value === sub.font);

  const sizeInput = (value: number, onChange: (v: number) => void, label: string) => (
    <span className="flex items-center gap-2">
      <input
        type="range"
        min={12}
        max={64}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-28 accent-indigo-500"
      />
      <span className="w-10 text-right font-mono text-zinc-300">{value}px</span>
    </span>
  );

  return (
    <section aria-label="하단 자막" className="px-4 py-4">
      <h2 className="mb-3 flex items-center justify-between text-xs font-semibold tracking-wide text-zinc-400">
        자막
        <span className="font-normal text-zinc-500">{sub.enabled ? "켜짐" : "꺼짐"}</span>
      </h2>
      <div className="space-y-2.5">
        <label className="flex items-center gap-1.5 text-xs text-zinc-200">
          <input
            type="checkbox"
            checked={sub.enabled}
            onChange={(e) => setSubtitles({ enabled: e.target.checked })}
            className="accent-indigo-500"
          />
          하단 자막 표시
        </label>
        {/* Turned off, the subtitle settings fold away */}
        {sub.enabled && (
          <div className="space-y-2.5">
            <div
              role="radiogroup"
              aria-label="자막 스타일"
              className="grid grid-cols-2 overflow-hidden rounded-md border border-zinc-800 text-xs"
            >
              {(
                [
                  ["kinetic", "가사 + 하단 자막", "가운데 움직이는 가사, 아래 발음·뜻"],
                  ["bottomOnly", "하단 자막만", "가사·발음·뜻을 아래에 함께"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={sub.display === value}
                  title={hint}
                  onClick={() => setSubtitles({ display: value })}
                  className={`px-2 py-1.5 ${sub.display === value ? "bg-indigo-500/10 text-indigo-200" : "text-zinc-400 hover:text-zinc-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {sub.display === "bottomOnly"
                ? "가운데 가사 없이, 아래 자막 상자에 가사·발음·뜻을 함께 표시합니다."
                : "가운데에는 움직이는 가사, 아래에는 발음과 뜻을 표시합니다."}
            </p>
            <Row label="폰트">
              <select
                value={sub.font}
                onChange={(e) => setSubtitles({ font: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-200"
              >
                {!fontKnown && <option value={sub.font}>{sub.font}</option>}
                {SUBTITLE_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            {sub.display === "bottomOnly" && (
              <Row label="가사 크기">
                {sizeInput(sub.mainFontSize, (v) => setSubtitles({ mainFontSize: v }), "자막 가사 글자 크기")}
              </Row>
            )}
            <Row label="발음 크기">
              {sizeInput(sub.pronFontSize, (v) => setSubtitles({ pronFontSize: v }), "발음 글자 크기")}
            </Row>
            <Row label="뜻 크기">
              {sizeInput(sub.transFontSize, (v) => setSubtitles({ transFontSize: v }), "뜻 글자 크기")}
            </Row>
            <Row label="색상">
              <span className="flex items-center gap-3">
                {sub.display === "bottomOnly" && (
                  <span className="flex items-center gap-1">
                    가사
                    <input
                      type="color"
                      value={sub.mainColor}
                      onChange={(e) => setSubtitles({ mainColor: e.target.value })}
                      aria-label="자막 가사 색상"
                      className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                    />
                  </span>
                )}
                <span className="flex items-center gap-1">
                  발음
                  <input
                    type="color"
                    value={sub.pronColor}
                    onChange={(e) => setSubtitles({ pronColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                  />
                </span>
                <span className="flex items-center gap-1">
                  뜻
                  <input
                    type="color"
                    value={sub.transColor}
                    onChange={(e) => setSubtitles({ transColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                  />
                </span>
              </span>
            </Row>
            <Row label="위치">
              <span className="flex overflow-hidden rounded-md border border-zinc-800">
                {(["bottom", "top"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    aria-pressed={sub.position === pos}
                    onClick={() => setSubtitles({ position: pos })}
                    className={`px-3 py-1 ${sub.position === pos ? "bg-indigo-500/10 text-indigo-200" : "text-zinc-400 hover:text-zinc-100"}`}
                  >
                    {pos === "bottom" ? "아래" : "위"}
                  </button>
                ))}
              </span>
            </Row>
            <Row label={sub.position === "top" ? "위쪽 여백" : "아래쪽 여백"}>
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={sub.bottomOffset}
                  onChange={(e) => setSubtitles({ bottomOffset: Number(e.target.value) })}
                  aria-label="가장자리 여백"
                  className="w-28 accent-indigo-500"
                />
                <span className="w-10 text-right font-mono text-zinc-300">{sub.bottomOffset}px</span>
              </span>
            </Row>
            <label className="flex items-center gap-1.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={sub.bgBox}
                onChange={(e) => setSubtitles({ bgBox: e.target.checked })}
                className="accent-indigo-500"
              />
              반투명 배경 박스
            </label>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              크기와 여백은 720p 기준이며 화면 비율에 맞춰 자동으로 조절됩니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
