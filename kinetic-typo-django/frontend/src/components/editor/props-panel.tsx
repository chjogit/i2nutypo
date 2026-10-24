import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CueEffect, PropAsset, PropClip } from "@/types/project";
import { newId } from "@/lib/props/clips";
import { ENTER_EFFECTS, EXIT_EFFECTS, MAX_CUE_FADE, MIN_CUE_FADE } from "@/lib/render/looks/cues";
import { forgetImage } from "@/lib/render/looks/image-cache";
import { blockedCells, CELLS, GRID } from "@/lib/render/looks/layout";
import { CANVAS_SIZE } from "@/lib/render/canvas-size";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { usePropUiStore } from "@/store/prop-ui-store";
import { Fold } from "./fold";
import { TimeField } from "./time-field";
import { probeVideo } from "@/lib/media/video-bg";
import { Tip } from "@/components/ui/tip";

const now = () => usePlaybackStore.getState().currentTime;

const CLIP_SLIDERS: Array<{
  key: keyof Pick<PropClip, "x" | "y" | "scale" | "rot" | "opacity">;
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
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "일러스트 N", numbered in upload order. */
export const illustrationName = (props: readonly PropAsset[], id: string): string =>
  `일러스트 ${props.findIndex((p) => p.id === id) + 1}`;

/** How the picked clip comes on or goes away: effect and its length. */
function EffectRow({
  label,
  effects,
  effect,
  sec,
  onChange,
}: {
  label: string;
  effects: ReadonlyArray<readonly [CueEffect, string]>;
  effect: CueEffect;
  sec: number;
  onChange: (patch: { effect?: CueEffect; sec?: number }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
      <span className="w-12 shrink-0">{label}</span>
      <select
        value={effect}
        onChange={(e) => onChange({ effect: e.target.value as CueEffect })}
        aria-label={`${label} 효과`}
        className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-zinc-200"
      >
        {effects.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
      <input
        type="range"
        min={MIN_CUE_FADE}
        max={MAX_CUE_FADE}
        step={0.1}
        value={sec}
        disabled={effect === "cut"}
        onChange={(e) => onChange({ sec: Number(e.target.value) })}
        aria-label={`${label} 길이`}
        className="w-20 accent-indigo-500 disabled:opacity-30"
      />
      <span className="w-8 text-right font-mono text-zinc-300">{sec.toFixed(1)}s</span>
    </div>
  );
}

/**
 * The 4x4 red cells the lyrics avoid while the clip is on screen, laid out in
 * the frame's shape. Click or drag over cells to mark or clear them.
 */
function ClipCells({
  clip,
  asset,
  onChange,
}: {
  clip: PropClip;
  asset: PropAsset;
  onChange: (cells: boolean[]) => void;
}) {
  const aspect = useProjectStore((s) => s.style.aspectRatio);
  const paintRef = useRef<boolean | null>(null);
  const size = CANVAS_SIZE[aspect];
  const paint = (c: number) => {
    if (paintRef.current === null || clip.cells[c] === paintRef.current) return;
    const next = [...clip.cells];
    next[c] = paintRef.current;
    onChange(next);
  };
  /** The cells the picture covers at its place, at the logical frame size. */
  const fromPicture = () => {
    const h = clip.scale * size.height;
    const w = (asset.width / Math.max(1, asset.height)) * h;
    const rect = { x: clip.x * size.width - w / 2, y: clip.y * size.height - h / 2, w, h };
    onChange(blockedCells(rect, size.width, size.height));
  };
  return (
    <div className="space-y-1.5">
      <div
        className="mx-auto grid w-full max-w-[200px] touch-none overflow-hidden rounded border border-zinc-800"
        style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)`, aspectRatio: `${size.width} / ${size.height}` }}
        onPointerUp={() => (paintRef.current = null)}
        onPointerLeave={() => (paintRef.current = null)}
      >
        {Array.from({ length: CELLS }, (_, c) => (
          <button
            key={c}
            type="button"
            aria-pressed={clip.cells[c]}
            aria-label={`${Math.floor(c / GRID) + 1}행 ${(c % GRID) + 1}열 ${clip.cells[c] ? "빨간 칸 지우기" : "빨간 칸 만들기"}`}
            onPointerDown={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              paintRef.current = !clip.cells[c];
              paint(c);
            }}
            onPointerEnter={() => paint(c)}
            className={`border border-zinc-900 ${clip.cells[c] ? "bg-red-500/40" : "bg-zinc-900/60 hover:bg-zinc-800"}`}
          />
        ))}
      </div>
      <div className="flex justify-center gap-3 text-[11px]">
        <button type="button" onClick={fromPicture} className="text-indigo-400 hover:underline">
          그림 자리로 채우기
        </button>
        <button
          type="button"
          onClick={() => onChange(Array<boolean>(CELLS).fill(false))}
          className="text-indigo-400 hover:underline"
        >
          모두 지우기
        </button>
      </div>
    </div>
  );
}

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
 * Right column: the illustrations (일러스트 1, 2, 3 ...), characters and props
 * alike. Each upload gets a lane in the timeline. The folding list keeps every
 * upload, on the timeline or not, with a table to put it on or take it off the
 * timeline and to remove it from the project. Under it, the clip picked in a
 * lane is placed and timed, given its effects for coming on and going away,
 * its sway and beat bounce, and the red cells the lyrics avoid while it shows.
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
      if (file.type.startsWith("video/")) {
        // A moving illustration: plays from each clip's start and loops
        probeVideo(objectUrl)
          .then((meta) => {
            urlsRef.current.add(objectUrl);
            addProp(
              {
                id: newId("prop"),
                fileName: file.name,
                objectUrl,
                width: meta.width,
                height: meta.height,
                video: { duration: meta.duration },
              },
              now(),
            );
          })
          .catch(() => {
            URL.revokeObjectURL(objectUrl);
            setError(`${file.name}: 이 브라우저가 재생할 수 없는 영상입니다.`);
          });
        continue;
      }
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
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        그림·영상을 올리면 일러스트 레이어로
        <Tip>
          캐릭터, 소품, 스티커 같은 그림(PNG 권장)을 올리면 일러스트 1, 2, 3… 으로 쌓이고, 그림마다 아래
          타임라인에 줄이 하나씩 생깁니다. 새 그림은 재생 위치에서 4초 구간으로 시작합니다. 구간마다 나타나는
          효과와 사라지는 효과, 흔들림, 비트 움직임, 빨간 칸을 따로 정할 수 있습니다. 구간을 고르고 Delete
          키를 누르면 그 구간이 지워집니다. 영상(MP4·WebM·MOV)도 올릴 수 있고, 구간이 시작될 때 처음부터
          재생되며 구간보다 짧으면 반복됩니다. 영상은 소리 없이 들어갑니다. 배경 전체를 영상으로 깔려면 효과
          패널의 "배경 영상"을 쓰세요.
        </Tip>
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
            {props.length}개 · 타임라인 {onTimeline}
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
                  {props.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-800/70">
                      <td className="px-1.5 py-1">
                        {p.video ? (
                          <video
                            src={p.objectUrl}
                            muted
                            playsInline
                            preload="metadata"
                            aria-label="영상"
                            className="h-7 w-7 rounded border border-zinc-800 bg-zinc-900 object-contain"
                          />
                        ) : (
                          <img
                            src={p.objectUrl}
                            alt=""
                            className="h-7 w-7 rounded border border-zinc-800 bg-zinc-900 object-contain"
                          />
                        )}
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          disabled={!p.onTimeline || p.clips.length === 0}
                          onClick={() => select({ propId: p.id, clipId: p.clips[0].id })}
                          title={p.fileName}
                          className="block w-full truncate text-left text-zinc-200 enabled:hover:underline"
                        >
                          {illustrationName(props, p.id)}
                        </button>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {p.onTimeline ? `구간 ${p.clips.length}개` : "타임라인에서 뺌"} · {p.fileName}
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

      {selProp && selClip ? (
        <div className="space-y-1.5 rounded-md border border-emerald-500/50 px-2 py-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate font-semibold text-zinc-200" title={selProp.fileName}>
              🖼 {illustrationName(props, selProp.id)}
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = addPropClip(selProp.id, now());
                  if (id) select({ propId: selProp.id, clipId: id });
                }}
                title="재생 위치에 이 일러스트의 구간을 하나 더 만듭니다 (다른 자리에서 다시 나타나기)"
                className="text-indigo-400 hover:underline"
              >
                타임라인 추가
              </button>
              <button
                type="button"
                onClick={() => {
                  removePropClip(selProp.id, selClip.id);
                  select(null);
                }}
                className="text-indigo-400 hover:underline"
              >
                현재 구간 삭제
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
                  aria-label={`일러스트 ${m.label}`}
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
          <Fold title="나타남 · 사라짐" className="space-y-1.5 border-t border-zinc-800/70 pt-2">
            <EffectRow
              label="나타남"
              effects={ENTER_EFFECTS}
              effect={selClip.enter}
              sec={selClip.enterSec}
              onChange={({ effect, sec }) =>
                updatePropClip(selProp.id, selClip.id, {
                  ...(effect && { enter: effect }),
                  ...(sec !== undefined && { enterSec: sec }),
                })
              }
            />
            <EffectRow
              label="사라짐"
              effects={EXIT_EFFECTS}
              effect={selClip.exit}
              sec={selClip.exitSec}
              onChange={({ effect, sec }) =>
                updatePropClip(selProp.id, selClip.id, {
                  ...(effect && { exit: effect }),
                  ...(sec !== undefined && { exitSec: sec }),
                })
              }
            />
            <p className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              다른 자리에서 다시 나오게 하기
              <Tip>
                퇴장 후 다른 자리에서 다시 나오게 하려면 &quot;타임라인 추가&quot;로 구간을 하나 더 만들고
                옮기세요.
              </Tip>
            </p>
          </Fold>
          <Fold title="흔들림 · 비트 움직임" className="space-y-1.5 border-t border-zinc-800/70 pt-2">
            {(
              [
                ["shake", "흔들림"],
                ["beat", "비트 움직임"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="w-16 shrink-0">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selClip[key]}
                  onChange={(e) => updatePropClip(selProp.id, selClip.id, { [key]: Number(e.target.value) })}
                  onDoubleClick={() => updatePropClip(selProp.id, selClip.id, { [key]: 0 })}
                  aria-label={`일러스트 ${label}`}
                  className="min-w-0 flex-1 accent-indigo-500"
                />
                <span className="w-10 text-right font-mono text-zinc-300">{pct(selClip[key])}</span>
              </label>
            ))}
          </Fold>
          <Fold title="빨간 칸 (가사 금지)" className="space-y-1.5 border-t border-zinc-800/70 pt-2">
            <p className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              빨간 칸 = 가사가 피하는 곳
              <Tip>
                이 구간이 화면에 있는 동안 가사가 빨간 칸을 피해 갑니다. 칸을 누르거나 끌어서 만들고 지웁니다.
              </Tip>
            </p>
            <ClipCells
              clip={selClip}
              asset={selProp}
              onChange={(cells) => updatePropClip(selProp.id, selClip.id, { cells })}
            />
          </Fold>
        </div>
      ) : (
        onTimeline > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            초록 구간을 눌러 편집
            <Tip>
              타임라인의 초록 구간을 누르면 여기서 위치, 크기, 효과, 흔들림, 빨간 칸을 바꿀 수 있습니다.
              구간은 끌어서 옮기고 양 끝을 끌어 길이를 바꾸며, 빈 줄을 두 번 누르면 구간이 추가됩니다.
            </Tip>
          </p>
        )
      )}
    </section>
  );
}
