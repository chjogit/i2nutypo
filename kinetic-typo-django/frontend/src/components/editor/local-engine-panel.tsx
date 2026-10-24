import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteLocalModel,
  downloadLocalModel,
  getLocalWhisperInfo,
  LOCAL_BACKEND_LABEL,
  type DownloadHandle,
  type LocalWhisperInfo,
} from "@/lib/desktop/local-whisper";
import { useEngineStore } from "@/store/engine-store";

const formatSize = (mb: number) => (mb >= 1000 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB`);

/**
 * Desktop-only: choose between the in-browser recognizer and whisper.cpp on
 * the local GPU, and manage the local model files.
 */
export function LocalEnginePanel({ disabled }: { disabled: boolean }) {
  const engine = useEngineStore((s) => s.engine);
  const setEngine = useEngineStore((s) => s.setEngine);
  const modelId = useEngineStore((s) => s.localModelId);
  const setModelId = useEngineStore((s) => s.setLocalModelId);
  const [info, setInfo] = useState<LocalWhisperInfo | null>(null);
  const [download, setDownload] = useState<{ progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const downloadRef = useRef<DownloadHandle | null>(null);

  const refresh = useCallback(() => {
    getLocalWhisperInfo().then(setInfo, (err: unknown) => setError(String(err)));
  }, []);

  useEffect(() => {
    refresh();
    return () => downloadRef.current?.cancel();
  }, [refresh]);

  const model = info?.models.find((m) => m.id === modelId) ?? null;
  const local = engine === "local";

  const startDownload = async () => {
    if (!model || download) return;
    setError(null);
    setDownload({ progress: 0 });
    const job = downloadLocalModel(model.id, (progress) => setDownload({ progress }));
    downloadRef.current = job;
    try {
      await job.result;
    } catch (err) {
      const message = String(err);
      if (message !== "cancelled") setError(message);
    } finally {
      downloadRef.current = null;
      setDownload(null);
      refresh();
    }
  };

  const remove = async () => {
    if (!model) return;
    await deleteLocalModel(model.id).catch((err: unknown) => setError(String(err)));
    refresh();
  };

  const radio = (value: "browser" | "local", label: string) => (
    <label className="flex items-center gap-1.5">
      <input
        type="radio"
        name="recognition-engine"
        checked={engine === value}
        onChange={() => setEngine(value)}
        disabled={disabled}
        className="accent-indigo-500"
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-300">
        <span className="text-zinc-400">인식 엔진</span>
        {radio("browser", "브라우저")}
        {radio("local", "로컬 GPU (선택)")}
      </div>

      {local && info && (
        <>
          <p className={info.backend === "cpu" ? "text-amber-400" : "text-emerald-400"}>
            {info.backend === "cpu"
              ? "🐢 이 앱은 GPU 없이 빌드되어 CPU로 인식합니다. NVIDIA는 cuda, 그 밖의 GPU는 vulkan 기능으로 빌드하면 빨라집니다."
              : `⚡ ${LOCAL_BACKEND_LABEL[info.backend]}로 whisper.cpp를 실행합니다.`}
          </p>
          <label className="flex items-center justify-between gap-3 text-zinc-400">
            모델
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={disabled || download !== null}
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-200"
            >
              {info.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.installed ? "✓ " : ""}
                  {m.label} · {m.note} · {formatSize(m.sizeMb)}
                </option>
              ))}
            </select>
          </label>
          {model && !model.installed && (
            <div className="flex items-center gap-2">
              {download ? (
                <>
                  <span className="text-zinc-400" role="status">
                    모델 내려받는 중… {Math.round(download.progress * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadRef.current?.cancel()}
                    className="text-zinc-400 hover:text-zinc-100"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startDownload}
                  disabled={disabled}
                  className="rounded-md border border-indigo-500 px-2.5 py-1 font-semibold text-indigo-300 hover:bg-indigo-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  모델 내려받기 ({formatSize(model.sizeMb)})
                </button>
              )}
            </div>
          )}
          {model?.installed && (
            <p className="flex items-center gap-2 text-zinc-500">
              모델 준비됨.
              <button
                type="button"
                onClick={remove}
                disabled={disabled}
                className="underline hover:text-zinc-300"
              >
                삭제
              </button>
            </p>
          )}
        </>
      )}
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
