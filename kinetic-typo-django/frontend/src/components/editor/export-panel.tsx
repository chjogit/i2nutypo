import { useEffect, useRef, useState } from "react";
import { FEATURES_NOW } from "@/lib/mode/mode";
import {
  buildSubtitleFile,
  countSubtitleCues,
  SUBTITLE_FORMATS,
  SUBTITLE_MIME,
  type SubtitleFormat,
  type SubtitleRows,
} from "@/lib/export/subtitle-formats";
import {
  canExportVideo,
  exportVideo,
  isVideoKind,
  outputSize,
  type EncodeLevel,
  type ExportKind,
  type VideoFps,
  type VideoQuality,
} from "@/lib/export/video-export";
import { ProjectFile } from "./project-file";
import { TimeField } from "./time-field";
import { RangeBar } from "./range-bar";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";

type VideoState =
  | { kind: "idle" }
  | { kind: "running"; progress: number; startedAt: number }
  | { kind: "done"; url: string; fileName: string; sizeMb: number; note: string }
  | { kind: "error"; message: string };

/** Base name for saved files: the cover title, else the song's file name. */
function baseName(): string {
  const { style, audio } = useProjectStore.getState();
  const fromAudio = audio.kind === "upload" ? audio.fileName.replace(/\.[^.]+$/, "") : "";
  const name = (style.coverTitle || fromAudio || "kinetic-typo").trim();
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "kinetic-typo";
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const formatTime = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

const KINDS: Array<{ value: ExportKind; label: string; hint: string }> = [
  { value: "video", label: "영상", hint: "보이는 그대로 MP4 영상으로 저장합니다." },
  {
    value: "green",
    label: "그린백",
    hint: "가사, 가사 앞 일러스트, 자막만 초록 바탕에 그립니다. 다른 편집기에서 크로마키로 합성하세요.",
  },
  {
    value: "black",
    label: "블랙백",
    hint: "가사, 가사 앞 일러스트, 자막만 검은 바탕에 그립니다. 스크린(밝게) 합성용입니다.",
  },
  {
    value: "png",
    label: "투명 PNG",
    hint: "가사, 가사 앞 일러스트, 자막을 투명 배경 PNG 연속 이미지로 ZIP에 담습니다.",
  },
  {
    value: "layers",
    label: "앞·뒤 레이어",
    hint: "가사 뒤(배경·뒤 일러스트·효과)와 가사 앞(가사·앞 일러스트·자막)을 back/, front/ 폴더의 PNG로 나눠 ZIP에 담습니다.",
  },
];

const LEVELS: Array<{ value: EncodeLevel; label: string }> = [
  { value: "standard", label: "표준" },
  { value: "high", label: "높음" },
  { value: "best", label: "최고" },
];

const ROW_LABELS: Array<{ key: keyof SubtitleRows; label: string }> = [
  { key: "main", label: "원문" },
  { key: "pron", label: "발음" },
  { key: "trans", label: "뜻" },
];

/**
 * Saves the finished video (rendered and encoded in this browser) and the
 * synced lyrics as subtitle files. Nothing leaves the device.
 */
export function ExportPanel() {
  const lineCount = useProjectStore((s) => s.lines.length);
  const lines = useProjectStore((s) => s.lines);
  const aspectRatio = useProjectStore((s) => s.style.aspectRatio);
  const introGateSec = useProjectStore((s) => s.sync.introGateSec);
  const hasAudio = useProjectStore((s) => s.audio.kind === "upload");
  const duration = useProjectStore((s) => s.duration);

  const [quality, setQuality] = useState<VideoQuality>(1080);
  const [fps, setFps] = useState<VideoFps>(30);
  const [kind, setKind] = useState<ExportKind>("video");
  const [level, setLevel] = useState<EncodeLevel>("high");
  const [withAudio, setWithAudio] = useState(true);
  /** Part of the song to save; null is the whole song. */
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [video, setVideo] = useState<VideoState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const [supported, setSupported] = useState(true);

  const [format, setFormat] = useState<SubtitleFormat>("srt");
  const [rows, setRows] = useState<SubtitleRows>({ main: true, pron: true, trans: true });

  // Checked after mount so the first paint matches the server HTML
  useEffect(() => setSupported(canExportVideo()), []);

  // Stop a running export and free a finished file when the panel goes away
  const doneUrl = video.kind === "done" ? video.url : null;
  useEffect(
    () => () => {
      if (doneUrl) URL.revokeObjectURL(doneUrl);
    },
    [doneUrl],
  );
  useEffect(() => () => abortRef.current?.abort(), []);

  const startVideo = async () => {
    usePlaybackStore.getState().pause();
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();
    setVideo({ kind: "running", progress: 0, startedAt });
    try {
      const result = await exportVideo(useProjectStore.getState(), {
        kind,
        quality,
        fps,
        level,
        withAudio,
        range: range ?? undefined,
        signal: controller.signal,
        onProgress: (progress) => setVideo({ kind: "running", progress, startedAt }),
      });
      const suffix = kind === "video" ? "" : `-${kind}`;
      const fileName = `${baseName()}${suffix}.${result.extension}`;
      setVideo({
        kind: "done",
        url: URL.createObjectURL(result.blob),
        fileName,
        sizeMb: result.blob.size / 1_000_000,
        note:
          result.extension === "zip"
            ? `${result.width}×${result.height} PNG ${result.frames}장 ZIP`
            : result.extension === "mp4"
              ? `${result.width}×${result.height} MP4`
              : `${result.width}×${result.height} WebM (이 브라우저는 MP4 인코딩을 지원하지 않아 WebM으로 저장)`,
      });
    } catch (e) {
      if (controller.signal.aborted) setVideo({ kind: "idle" });
      else setVideo({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const saveSubtitles = () => {
    const project = useProjectStore.getState();
    const text = buildSubtitleFile(project.lines, {
      format,
      rows,
      introGateSec: project.sync.introGateSec,
      subtitles: project.subtitles,
      mainFont: project.style.lyricFont || project.style.mainFont,
      aspectRatio: project.style.aspectRatio,
      title: project.style.coverTitle,
    });
    // BOM keeps Korean and Japanese readable in Windows players and editors
    saveBlob(
      new Blob(["﻿", text], { type: `${SUBTITLE_MIME[format]};charset=utf-8` }),
      `${baseName()}.${format}`,
    );
  };

  const size = outputSize(aspectRatio, quality);
  const cueCount = countSubtitleCues(lines, rows, introGateSec);
  const running = video.kind === "running";
  const elapsed = running ? (performance.now() - video.startedAt) / 1000 : 0;
  const remaining =
    running && video.progress > 0.02 ? (elapsed / video.progress) * (1 - video.progress) : null;

  const chip = (active: boolean) =>
    `px-2 py-1 ${active ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"} disabled:opacity-50`;

  return (
    <section aria-label="내보내기" className="space-y-4 px-4 py-4">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-400">내보내기</h2>

      <div className="space-y-2">
        <h3 className="text-xs font-medium text-zinc-200">완성 영상</h3>
        <div
          role="radiogroup"
          aria-label="저장 방식"
          className="grid grid-cols-3 overflow-hidden rounded-md border border-zinc-800 text-xs sm:grid-cols-5"
        >
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={k.value === kind}
              disabled={running}
              onClick={() => setKind(k.value)}
              className={chip(k.value === kind)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-xs leading-snug text-zinc-500">{KINDS.find((k) => k.value === kind)?.hint}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">해상도</span>
          <div className="flex rounded-md border border-zinc-800">
            {([720, 1080] as const).map((q) => (
              <button
                key={q}
                type="button"
                disabled={running}
                onClick={() => setQuality(q)}
                className={chip(q === quality)}
              >
                {q}p
              </button>
            ))}
          </div>
          <span className="ml-2 text-zinc-500">프레임</span>
          <div className="flex rounded-md border border-zinc-800">
            {([24, 30, 60] as const).map((f) => (
              <button
                key={f}
                type="button"
                disabled={running}
                onClick={() => setFps(f)}
                className={chip(f === fps)}
              >
                {f}fps
              </button>
            ))}
          </div>
          {isVideoKind(kind) && (
            <>
              <span className="ml-2 text-zinc-500">화질</span>
              <div className="flex rounded-md border border-zinc-800">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    disabled={running}
                    onClick={() => setLevel(l.value)}
                    className={chip(l.value === level)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-200">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={range !== null}
              disabled={running}
              onChange={(e) => setRange(e.target.checked ? { start: 0, end: duration } : null)}
              className="accent-indigo-500"
            />
            일부 구간만
          </label>
          {isVideoKind(kind) && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={withAudio}
                disabled={running || !hasAudio}
                onChange={(e) => setWithAudio(e.target.checked)}
                className="accent-indigo-500"
              />
              음원 넣기
            </label>
          )}
          <span className="text-zinc-500">
            {size.width}×{size.height} · {formatTime(range ? Math.max(0, range.end - range.start) : duration)}
          </span>
        </div>
        {range && (
          <div className="grid gap-1.5 rounded-md border border-zinc-800 p-2 sm:grid-cols-2">
            <TimeField
              label="시작"
              value={range.start}
              onCommit={(v) => setRange({ start: Math.min(v, range.end - 0.5), end: range.end })}
            />
            <TimeField
              label="끝"
              value={range.end}
              onCommit={(v) => setRange({ start: range.start, end: Math.max(v, range.start + 0.5) })}
            />
            <div className="sm:col-span-2">
              <RangeBar
                start={range.start}
                end={range.end}
                duration={duration}
                marks={lines.map((l) => l.startTime)}
                disabled={running}
                onChange={(start, end) => setRange({ start, end })}
              />
            </div>
          </div>
        )}
        {!isVideoKind(kind) && (
          <p className="text-xs text-amber-400/90">
            PNG는 1초에 {fps}장씩 쌓여 파일이 큽니다. 긴 곡은 일부 구간만 저장하거나 24fps를 쓰세요.
          </p>
        )}

        {!supported ? (
          <p className="text-xs text-amber-400">
            이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않습니다. 최신 Chrome이나 Edge에서 열어 주세요.
          </p>
        ) : running ? (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(video.progress * 100)}
              className="h-2 overflow-hidden rounded-full bg-zinc-800"
            >
              <div
                className="h-full bg-indigo-500 transition-[width]"
                style={{ width: `${video.progress * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                만드는 중 {Math.round(video.progress * 100)}%
                {remaining !== null && ` · 남은 시간 약 ${formatTime(remaining)}`}
              </span>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-red-500 hover:text-red-300"
              >
                취소
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              이 탭을 열어 둔 채 기다려 주세요. 다른 탭으로 가면 느려질 수 있습니다.
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={lineCount === 0}
            onClick={() => void startVideo()}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {lineCount === 0
              ? "가사를 넣으면 영상을 만들 수 있어요"
              : isVideoKind(kind)
                ? `MP4 ${KINDS.find((k) => k.value === kind)?.label} 만들기`
                : `${KINDS.find((k) => k.value === kind)?.label} ZIP 만들기`}
          </button>
        )}
        {isVideoKind(kind) && !hasAudio && lineCount > 0 && (
          <p className="text-xs text-zinc-500">음원이 없으면 소리 없는 영상이 만들어집니다.</p>
        )}
        {video.kind === "done" && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 px-3 py-2 text-xs">
            <span className="min-w-0 truncate text-zinc-300" title={video.fileName}>
              ✅ {video.note} · {video.sizeMb.toFixed(1)}MB
            </span>
            <a
              href={video.url}
              download={video.fileName}
              className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-500"
            >
              저장
            </a>
          </div>
        )}
        {video.kind === "error" && (
          <p className="text-xs text-red-400">영상을 만들지 못했습니다: {video.message}</p>
        )}
      </div>

      {FEATURES_NOW.subtitleFiles && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-zinc-200">자막 파일</h3>
          <div
            role="radiogroup"
            aria-label="자막 형식"
            className="grid grid-cols-4 rounded-md border border-zinc-800 text-xs"
          >
            {SUBTITLE_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={f.value === format}
                title={f.hint}
                onClick={() => setFormat(f.value)}
                className={chip(f.value === format)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">{SUBTITLE_FORMATS.find((f) => f.value === format)?.hint}</p>
          <div className="flex items-center gap-4 text-xs text-zinc-200">
            <span className="text-zinc-500">담을 줄</span>
            {ROW_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rows[key]}
                  onChange={(e) => setRows({ ...rows, [key]: e.target.checked })}
                  className="accent-indigo-500"
                />
                {label}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={cueCount === 0}
            onClick={saveSubtitles}
            className="w-full rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cueCount === 0 ? "저장할 자막이 없어요" : `${format.toUpperCase()} 자막 저장 (${cueCount}줄)`}
          </button>
        </div>
      )}

      <ProjectFile />
    </section>
  );
}
