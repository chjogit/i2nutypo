import { useEffect, useMemo, useRef, useState } from "react";
import { formatLrcTime } from "@/lib/lyrics/parse";
import { detectLyricsLanguage } from "@/lib/lyrics/tokenize";
import { cleanTranscript } from "@/lib/sync/clean-transcript";
import { syncLineTimes, type TranscriptChunk } from "@/lib/sync/align";
import {
  decodeForWhisper,
  transcribeInWorker,
  WHISPER_LANGUAGE,
  type TranscribeHandle,
} from "@/lib/sync/whisper-client";
import { detectAccelerator, type Accelerator } from "@/lib/sync/device";
import { isDesktopApp, transcribeLocal } from "@/lib/desktop/local-whisper";
import { CPU_WHISPER_MODEL, DEFAULT_WHISPER_MODEL, type TimestampMode } from "@/lib/sync/whisper-protocol";
import { useEngineStore } from "@/store/engine-store";
import { useProjectStore } from "@/store/project-store";
import { LocalEnginePanel } from "./local-engine-panel";

type Phase =
  | { kind: "idle" }
  | { kind: "decoding" }
  | { kind: "loading-model"; progress: number }
  /** progress is only known for the local engine */
  | { kind: "transcribing"; progress?: number }
  | {
      kind: "done";
      chunks: TranscriptChunk[];
      mode: TimestampMode;
      transcript: string;
      /** Chunks removed as non-lyrics (stock phrases, loops) before aligning. */
      dropped: number;
    }
  | { kind: "error"; message: string };

/**
 * Share of a line's sounds that must line up with the transcript for the line
 * to count as confirmed. Lines under it still take the position the forced
 * alignment estimated for them, so a strict bar does not cost placement.
 */
const CONFIRM_THRESHOLD = 0.9;

type SyncMode = "fast" | "normal" | "power";

const SYNC_MODES: ReadonlyArray<{ id: SyncMode; label: string; modelId: string; note: string }> = [
  { id: "fast", label: "FAST", modelId: CPU_WHISPER_MODEL, note: "빠름, 정확도 낮음" },
  { id: "normal", label: "NORMAL", modelId: DEFAULT_WHISPER_MODEL, note: "속도와 정확도 균형" },
  {
    id: "power",
    label: "POWER",
    modelId: "onnx-community/whisper-large-v3-turbo",
    note: "가장 정확, GPU 권장",
  },
];

/**
 * Automatic lyric sync: Whisper transcribes the uploaded song in the browser,
 * then the known lyrics are force-aligned to the transcript by pronunciation.
 * The transcript is kept, so editing the lyrics re-aligns instantly.
 */
export function SyncPanel() {
  const audio = useProjectStore((s) => s.audio);
  const lines = useProjectStore((s) => s.lines);
  const duration = useProjectStore((s) => s.duration);
  const introGateSec = useProjectStore((s) => s.sync.introGateSec);
  const applyLineTimes = useProjectStore((s) => s.applyLineTimes);
  const autoDistribute = useProjectStore((s) => s.autoDistribute);
  const setSync = useProjectStore((s) => s.setSync);
  const [mode, setMode] = useState<SyncMode>("normal");
  const [accelerator, setAccelerator] = useState<Accelerator | null>(null);
  const modeTouchedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const modelId = SYNC_MODES.find((m) => m.id === mode)?.modelId ?? DEFAULT_WHISPER_MODEL;
  const jobRef = useRef<TranscribeHandle | null>(null);
  const [desktop, setDesktop] = useState(false);
  const engine = useEngineStore((s) => s.engine);
  const localModelId = useEngineStore((s) => s.localModelId);
  const useLocal = desktop && engine === "local";

  // Checked after mount so server and client render the same markup
  useEffect(() => setDesktop(isDesktopApp()), []);

  useEffect(() => () => jobRef.current?.cancel(), []);

  // A result belongs to the song it was made from
  const objectUrl = audio.kind === "upload" ? audio.objectUrl : null;
  useEffect(() => {
    jobRef.current?.cancel();
    setPhase({ kind: "idle" });
  }, [objectUrl]);

  // Pick a model the device can handle, unless the user already chose one
  useEffect(() => {
    let alive = true;
    void detectAccelerator().then((acc) => {
      if (!alive) return;
      setAccelerator(acc);
      if (acc === "cpu" && !modeTouchedRef.current) setMode("fast");
    });
    return () => {
      alive = false;
    };
  }, []);

  const isLargeOnCpu = accelerator === "cpu" && mode === "power";

  const busy = phase.kind === "decoding" || phase.kind === "loading-model" || phase.kind === "transcribing";

  const run = async () => {
    if (audio.kind !== "upload" || busy) return;
    const project = useProjectStore.getState();
    const language = WHISPER_LANGUAGE[detectLyricsLanguage(project.lines.map((l) => l.cleanText).join("\n"))];
    try {
      setPhase({ kind: "decoding" });
      const pcm = await decodeForWhisper(audio.objectUrl);
      const callbacks = {
        onStatus: (status: "loading-model" | "transcribing") =>
          setPhase((prev) =>
            status === "loading-model"
              ? { kind: "loading-model", progress: 0 }
              : prev.kind === "transcribing"
                ? prev
                : { kind: "transcribing" },
          ),
        onLoadProgress: (progress: number) => setPhase({ kind: "loading-model", progress }),
        onTranscribeProgress: (progress: number) => setPhase({ kind: "transcribing", progress }),
      };
      const job = useLocal
        ? transcribeLocal(pcm, localModelId, language, callbacks)
        : transcribeInWorker(pcm, modelId, language, callbacks);
      jobRef.current = job;
      const { chunks, text, mode } = await job.result;
      jobRef.current = null;
      // Both engines' output is cleaned the same way before aligning
      const cleaned = cleanTranscript(chunks, mode);
      setPhase({
        kind: "done",
        chunks: cleaned.chunks,
        mode,
        transcript: text,
        dropped: cleaned.dropped,
      });
    } catch (err) {
      jobRef.current = null;
      const message = err instanceof Error ? err.message : String(err);
      if (message === "cancelled") setPhase({ kind: "idle" });
      else if (/fetch|network/i.test(message))
        setPhase({ kind: "error", message: "모델 파일을 내려받지 못했습니다. 인터넷 연결을 확인하세요." });
      else setPhase({ kind: "error", message });
    }
  };

  const cancel = () => jobRef.current?.cancel();

  const done = phase.kind === "done" ? phase : null;
  const result = useMemo(() => {
    if (!done) return null;
    return syncLineTimes(lines, done.chunks, CONFIRM_THRESHOLD, duration, introGateSec);
  }, [done, lines, duration, introGateSec]);
  const confirmed = result ? result.alignments.filter((a) => a.time !== null).length : 0;
  const estimated = result
    ? result.alignments.filter((a) => a.time === null && a.estimate !== null).length
    : 0;

  return (
    <div className="space-y-2.5 border-t border-zinc-800/70 pt-3 text-xs">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-400">자동 싱크</h3>
      <div className="space-y-2.5">
        <p className="leading-relaxed text-zinc-500">
          음원을 {useLocal ? "이 컴퓨터의 GPU로" : "브라우저 안에서"} 음성 인식(Whisper)해 각 줄의 시작 시간을
          맞춥니다. 음원은 밖으로 보내지 않습니다. 처음 한 번은 모델 파일을 내려받습니다.
        </p>
        {desktop && <LocalEnginePanel disabled={busy} />}
        {!useLocal && (
          <>
            <div role="radiogroup" aria-label="싱크 모드" className="grid grid-cols-3 gap-1">
              {SYNC_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  disabled={busy}
                  onClick={() => {
                    modeTouchedRef.current = true;
                    setMode(m.id);
                  }}
                  className={`rounded-md border px-2 py-1.5 text-center ${
                    mode === m.id
                      ? "border-indigo-500 bg-indigo-600/30 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  <span className="block font-semibold tracking-wide">{m.label}</span>
                  <span className="block text-[10px] text-zinc-500">{m.note}</span>
                </button>
              ))}
            </div>
            {accelerator && (
              <p className={accelerator === "webgpu" ? "text-emerald-400" : "text-amber-400"}>
                {accelerator === "webgpu"
                  ? "⚡ GPU 가속(WebGPU)으로 인식합니다."
                  : "🐢 이 브라우저는 WebGPU를 쓸 수 없어 CPU로 인식합니다. 몇 배 느리므로 FAST를 권장합니다."}
              </p>
            )}
            {accelerator === "cpu" && (
              <details className="text-zinc-500">
                <summary className="cursor-pointer">WebGPU 켜는 방법</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>최신 Chrome·Edge(113 이상)는 기본으로 켜져 있습니다. 브라우저를 업데이트해 보세요.</li>
                  <li>
                    주소창에 chrome://gpu 를 열어 WebGPU 항목을 확인하고, 꺼져 있으면 chrome://flags 에서
                    &quot;Unsafe WebGPU Support&quot;를 켠 뒤 다시 시작합니다.
                  </li>
                  <li>chrome://settings/system 에서 &quot;그래픽 가속 사용&quot;이 켜져 있어야 합니다.</li>
                  <li>Safari는 최신 버전(26 이상)에서 지원하고, Firefox는 일부 환경에서만 지원합니다.</li>
                </ul>
              </details>
            )}
            {isLargeOnCpu && (
              <p className="text-amber-400">POWER는 CPU에서 매우 느리고 메모리가 부족할 수 있습니다.</p>
            )}
          </>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={audio.kind !== "upload" || busy || lines.length === 0}
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {done ? "다시 인식" : "음성 인식으로 싱크"}
          </button>
          {busy && phase.kind !== "decoding" && (
            <button type="button" onClick={cancel} className="text-zinc-400 hover:text-zinc-100">
              취소
            </button>
          )}
          <span className="text-zinc-400" role="status">
            {audio.kind !== "upload" && "먼저 음원을 선택하세요"}
            {phase.kind === "decoding" && "음원 읽는 중…"}
            {phase.kind === "loading-model" && `모델 준비 중… ${Math.round(phase.progress * 100)}%`}
            {phase.kind === "transcribing" &&
              (phase.progress !== undefined
                ? `인식 중… ${Math.round(phase.progress * 100)}%`
                : "인식 중… (곡 길이에 따라 몇 분 걸릴 수 있음)")}
          </span>
        </div>

        {phase.kind === "error" && <p className="text-red-400">인식 실패: {phase.message}</p>}

        {done && (
          <div className="space-y-2">
            <p className="text-zinc-300">
              {result?.alignments.length ?? 0}줄 중{" "}
              <span className="font-semibold text-emerald-300">{confirmed}줄</span>은 발음이 90% 이상 맞아
              확인했고, <span className="font-semibold text-amber-300">{estimated}줄</span>은 추정 위치에
              놓았습니다. 나머지는 앞뒤 줄 사이에 배치합니다.
              {lines.some((l) => l.overlap) && " 겹치는 줄(&)은 함께 부르는 줄을 따라 움직입니다."}{" "}
              타임라인에서 바로 고칠 수 있습니다.
            </p>
            <p className="text-zinc-500">
              {done.mode === "word"
                ? "단어 단위 시간으로 맞췄습니다."
                : "이 모델은 단어 단위 시간을 지원하지 않아 구간 단위로 맞췄습니다. 줄 시작이 조금 어긋날 수 있습니다."}{" "}
              {done.dropped > 0 && `간주 등에서 가사가 아닌 인식 결과 ${done.dropped}개를 빼고 맞췄습니다. `}
              가사를 고치면 다시 인식하지 않고 바로 다시 맞춥니다.
            </p>
            <ol className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 p-2">
              {result?.alignments.map((a) => {
                const line = lines[a.lineIdx];
                if (!line) return null;
                const mark = a.time !== null ? "✓" : a.estimate !== null ? "~" : "·";
                const markColor =
                  a.time !== null
                    ? "text-emerald-400"
                    : a.estimate !== null
                      ? "text-amber-400"
                      : "text-zinc-600";
                return (
                  <li key={a.lineIdx} className="flex items-baseline gap-2">
                    <span className={`w-4 shrink-0 ${markColor}`}>{mark}</span>
                    <span className="w-14 shrink-0 font-mono text-indigo-300">
                      {formatLrcTime(result.startTimes[a.lineIdx])}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-zinc-200" title={a.heard || undefined}>
                      {line.cleanText}
                    </span>
                    <span className="shrink-0 font-mono text-zinc-500">
                      {Math.round(a.similarity * 100)}%
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (result) applyLineTimes(result.startTimes);
                  setPhase({ kind: "idle" });
                }}
                className="rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                가사에 시간 적용
              </button>
              <button
                type="button"
                onClick={() => setPhase({ kind: "idle" })}
                className="text-zinc-400 hover:text-zinc-100"
              >
                닫기
              </button>
            </div>
            <details>
              <summary className="cursor-pointer text-zinc-500">인식된 전체 텍스트</summary>
              <p className="mt-1 whitespace-pre-wrap text-zinc-400">{done.transcript.trim() || "(없음)"}</p>
            </details>
          </div>
        )}

        <details className="text-zinc-400">
          <summary className="cursor-pointer text-zinc-500">음원 없이 직접 배치</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              전주 길이 (이 시간 전엔 가사가 나오지 않음)
              <input
                type="number"
                min={0}
                step={0.1}
                value={introGateSec}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0) setSync({ introGateSec: v });
                }}
                className="w-20 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
              />
              초
            </label>
            <button
              type="button"
              onClick={autoDistribute}
              disabled={lines.length === 0}
              className="rounded-md bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              시간 고르게 배분
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
