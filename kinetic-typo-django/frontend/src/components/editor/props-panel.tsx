import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PropClip } from "@/types/project";
import { newId } from "@/lib/props/clips";
import { forgetImage } from "@/lib/render/looks/image-cache";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { Fold } from "./fold";
import { CharacterEditor } from "./illustration-panel";
import { TimeField } from "./time-field";

const now = () => usePlaybackStore.getState().currentTime;

const CLIP_SLIDERS: Array<{
  key: keyof Pick<PropClip, "x" | "y" | "scale" | "rot" | "opacity" | "fade">;
  label: string;
  min: number;
  max: number;
  step: number;
  reset: number;
  format: (v: number) => string;
}> = [
  {
    key: "x",
    label: "가로",
    min: -0.2,
    max: 1.2,
    step: 0.01,
    reset: 0.5,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "y",
    label: "세로",
    min: -0.2,
    max: 1.2,
    step: 0.01,
    reset: 0.5,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "scale",
    label: "크기",
    min: 0.03,
    max: 1.5,
    step: 0.01,
    reset: 0.3,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  { key: "rot", label: "회전", min: -180, max: 180, step: 1, reset: 0, format: (v) => `${Math.round(v)}°` },
  {
    key: "opacity",
    label: "투명도",
    min: 0,
    max: 1,
    step: 0.05,
    reset: 1,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  { key: "fade", label: "페이드", min: 0, max: 3, step: 0.1, reset: 0, format: (v) => `${v.toFixed(1)}s` },
];

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-500"
      />
      {children}
    </label>
  );
}

/**
 * Right column, under the illustration: extra pictures (props). Each upload
 * gets a lane in the illustration timeline. The folding list keeps every
 * upload, on the timeline or not, with a table to put it on or take it off the
 * timeline and to remove it from the project. Under it, the clip picked in a
 * lane is placed and timed.
 */
export function PropsPanel() {
  const props = useProjectStore((s) => s.props);
  const addProp = useProjectStore((s) => s.addProp);
  const removeProp = useProjectStore((s) => s.removeProp);
  const setPropOnTimeline = useProjectStore((s) => s.setPropOnTimeline);
  const addPropClip = useProjectStore((s) => s.addPropClip);
  const updatePropClip = useProjectStore((s) => s.updatePropClip);
  const removePropClip = useProjectStore((s) => s.removePropClip);
  const selected = usePropUiStore((s) => s.selected);
  const charPicked = usePropUiStore((s) => s.character);
  const selectCharacter = usePropUiStore((s) => s.selectCharacter);
  const character = useProjectStore((s) => s.images.character);
  const ill = useProjectStore((s) => s.style.illustration);
  const setIllustration = useProjectStore((s) => s.setIllustration);
  const setImage = useProjectStore((s) => s.setImage);
  const charOn = character !== null && ill.showCharacter;
  const select = usePropUiStore((s) => s.select);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Object URLs made here, revoked when the panel goes away. */
  const urlsRef = useRef(new Set<string>());

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) {
        forgetImage(url);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const handleFiles = (files: FileList) => {
    setError(null);
    for (const file of Array.from(files)) {
      const objectUrl = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        urlsRef.current.add(objectUrl);
        addProp(
          {
            id: newId("prop"),
            fileName: file.name,
            objectUrl,
            width: probe.naturalWidth,
            height: probe.naturalHeight,
          },
          now(),
        );
      };
      probe.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setError(`${file.name}: 열 수 없는 이미지 형식입니다.`);
      };
      probe.src = objectUrl;
    }
  };

  const remove = (id: string) => {
    const p = props.find((x) => x.id === id);
    if (!p) return;
    if (selected?.propId === id) select(null);
    removeProp(id);
    forgetImage(p.objectUrl);
    URL.revokeObjectURL(p.objectUrl);
    urlsRef.current.delete(p.objectUrl);
  };

  const removeCharacter = () => {
    if (!character) return;
    selectCharacter(false);
    forgetImage(character.objectUrl);
    URL.revokeObjectURL(character.objectUrl);
    setImage("character", null);
  };

  const selProp = selected ? props.find((p) => p.id === selected.propId && p.onTimeline) : undefined;
  const selClip = selProp?.clips.find((c) => c.id === selected?.clipId);
  const onTimeline = props.filter((p) => p.onTimeline).length;

  return (
    <section className="space-y-3 px-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-400">일러스트</h2>
        <label className="cursor-pointer rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:border-indigo-500">
          + 올리기
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        캐릭터와 소품, 스티커 같은 그림(PNG 권장)을 관리합니다. 그림마다 아래 타임라인에 일러스트 줄이 하나씩
        생기고, 새로 올린 소품은 재생 위치에서 4초 구간으로 시작합니다. 목록에서 이름을 누르면 상세 설정이
        열립니다.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="rounded-md border border-zinc-800">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="prop-list"
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-zinc-900/60"
        >
          <span className="font-semibold text-zinc-200">소재 목록</span>
          <span className="font-mono text-[10px] text-zinc-500">
            {props.length + (character ? 1 : 0)}개 · 타임라인 {onTimeline + (charOn ? 1 : 0)}
          </span>
          <span
            aria-hidden
            className={`ml-auto text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
        {open && (
          <div id="prop-list" className="border-t border-zinc-800">
            {
              <table className="w-full table-fixed text-[11px]">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th scope="col" className="w-9 px-1.5 py-1 font-normal">
                      <span className="sr-only">미리보기</span>
                    </th>
                    <th scope="col" className="px-1 py-1 font-normal">
                      이름
                    </th>
                    <th scope="col" className="w-[4.5rem] px-1 py-1 font-normal">
                      타임라인
                    </th>
                    <th scope="col" className="w-10 px-1 py-1 font-normal">
                      <span className="sr-only">프로젝트에서 제거</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-t border-zinc-800/70 ${charPicked ? "bg-sky-500/5" : ""}`}>
                    <td className="px-1.5 py-1">
                      {character ? (
                        <img
                          src={character.objectUrl}
                          alt=""
                          className="h-7 w-7 rounded border border-zinc-800 bg-zinc-900 object-contain"
                        />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded border border-dashed border-zinc-700">
                          🧍
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => selectCharacter(!charPicked)}
                        aria-pressed={charPicked}
                        className="block w-full truncate text-left text-sky-200 hover:underline"
                      >
                        캐릭터
                      </button>
                      <span className="block truncate text-[10px] text-zinc-500">
                        {character ? character.fileName : "눌러서 PNG 올리기"}
                      </span>
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        disabled={!character}
                        onClick={() => setIllustration({ showCharacter: !ill.showCharacter })}
                        aria-label={`캐릭터 ${charOn ? "타임라인에서 빼기" : "타임라인에 추가"}`}
                        className={`w-full rounded border px-1 py-0.5 disabled:opacity-40 ${
                          charOn || !character
                            ? "border-zinc-700 text-zinc-300 hover:border-indigo-500"
                            : "border-indigo-500 bg-indigo-500/10 text-indigo-200"
                        }`}
                      >
                        {charOn || !character ? "빼기" : "추가"}
                      </button>
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        disabled={!character}
                        onClick={removeCharacter}
                        aria-label="캐릭터 프로젝트에서 제거"
                        title="프로젝트에서 제거"
                        className="w-full rounded border border-zinc-800 px-1 py-0.5 text-red-300 hover:border-red-400 disabled:opacity-40"
                      >
                        제거
                      </button>
                    </td>
                  </tr>
                  {props.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-800/70">
                      <td className="px-1.5 py-1">
                        <img
                          src={p.objectUrl}
                          alt=""
                          className="h-7 w-7 rounded border border-zinc-800 bg-zinc-900 object-contain"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          disabled={!p.onTimeline || p.clips.length === 0}
                          onClick={() => select({ propId: p.id, clipId: p.clips[0].id })}
                          title={p.fileName}
                          className="block w-full truncate text-left text-zinc-200 enabled:hover:underline"
                        >
                          {p.fileName}
                        </button>
                        <span className="text-[10px] text-zinc-500">
                          {p.onTimeline ? `구간 ${p.clips.length}개` : "타임라인에서 뺌"}
                        </span>
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (p.onTimeline && selected?.propId === p.id) select(null);
                            setPropOnTimeline(p.id, !p.onTimeline, now());
                          }}
                          aria-label={`${p.fileName} ${p.onTimeline ? "타임라인에서 빼기" : "타임라인에 추가"}`}
                          className={`w-full rounded border px-1 py-0.5 ${
                            p.onTimeline
                              ? "border-zinc-700 text-zinc-300 hover:border-indigo-500"
                              : "border-indigo-500 bg-indigo-500/10 text-indigo-200"
                          }`}
                        >
                          {p.onTimeline ? "빼기" : "추가"}
                        </button>
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          aria-label={`${p.fileName} 프로젝트에서 제거`}
                          title="프로젝트에서 제거"
                          className="w-full rounded border border-zinc-800 px-1 py-0.5 text-red-300 hover:border-red-400"
                        >
                          제거
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        )}
      </div>

      {charPicked && (
        <div className="space-y-2 rounded-md border border-sky-500/50 px-2 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-sky-200">🧍 캐릭터</span>
            <button
              type="button"
              onClick={() => selectCharacter(false)}
              className="text-indigo-400 hover:underline"
            >
              닫기
            </button>
          </div>
          <CharacterEditor />
        </div>
      )}

      {selProp && selClip ? (
        <div className="space-y-1.5 rounded-md border border-emerald-500/50 px-2 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate font-semibold text-zinc-200">🖼 {selProp.fileName}</span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = addPropClip(selProp.id, now());
                  if (id) select({ propId: selProp.id, clipId: id });
                }}
                title="재생 위치에 이 소재의 구간을 하나 더 만듭니다"
                className="text-indigo-400 hover:underline"
              >
                + 지금 구간
              </button>
              <button
                type="button"
                onClick={() => {
                  removePropClip(selProp.id, selClip.id);
                  select(null);
                }}
                className="text-indigo-400 hover:underline"
              >
                구간 삭제
              </button>
            </span>
          </div>
          <Fold title="시간" className="space-y-1.5 border-t border-zinc-800/70 pt-2">
            <TimeField
              label="시작"
              value={selClip.start}
              onCommit={(v) => updatePropClip(selProp.id, selClip.id, { start: v })}
            />
            <TimeField
              label="끝"
              value={selClip.end}
              onCommit={(v) => updatePropClip(selProp.id, selClip.id, { end: v })}
            />
          </Fold>
          <Fold title="위치 · 크기 · 모양" className="space-y-1.5 border-t border-zinc-800/70 pt-2">
            {CLIP_SLIDERS.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="w-12 shrink-0">{m.label}</span>
                <input
                  type="range"
                  min={m.min}
                  max={m.max}
                  step={m.step}
                  value={selClip[m.key]}
                  onChange={(e) =>
                    updatePropClip(selProp.id, selClip.id, { [m.key]: Number(e.target.value) })
                  }
                  onDoubleClick={() => updatePropClip(selProp.id, selClip.id, { [m.key]: m.reset })}
                  aria-label={`소품 ${m.label}`}
                  className="min-w-0 flex-1 accent-indigo-500"
                />
                <span className="w-10 text-right font-mono text-zinc-300">{m.format(selClip[m.key])}</span>
              </label>
            ))}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-200">
              <Check
                checked={selClip.front}
                onChange={(v) => updatePropClip(selProp.id, selClip.id, { front: v })}
              >
                가사 앞에 놓기
              </Check>
              <Check
                checked={selClip.flip}
                onChange={(v) => updatePropClip(selProp.id, selClip.id, { flip: v })}
              >
                좌우 반전
              </Check>
            </div>
          </Fold>
        </div>
      ) : (
        onTimeline > 0 && (
          <p className="text-[11px] leading-snug text-zinc-500">
            타임라인의 초록 구간을 누르면 여기서 위치, 크기, 회전, 투명도를 바꿀 수 있습니다. 구간은 끌어서
            옮기고 양 끝을 끌어 길이를 바꾸며, 빈 줄을 두 번 누르면 구간이 추가됩니다.
          </p>
        )
      )}
    </section>
  );
}
