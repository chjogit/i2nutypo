import { useEffect, useRef, useState } from "react";
import type { VideoAsset } from "@/types/project";
import {
  MIXKIT_LICENSE_URL,
  searchStock,
  STOCK_CATEGORIES,
  stockFileUrl,
  stockThumbUrl,
  type StockCategory,
  type StockVideo,
} from "@/lib/media/stock-videos";
import { probeVideo, releasePreviewVideo } from "@/lib/media/video-bg";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";
import { BgVideoFilterControls } from "./bg-video-filter";

const CHIP_ON = "border-indigo-500 bg-indigo-500/15 text-zinc-100";
const CHIP_OFF = "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200";

/** Fetches a stock video into a local file (blob) so the canvas can draw and export it. */
async function fetchStock(s: StockVideo, signal: AbortSignal): Promise<Blob> {
  let last: unknown = null;
  for (const h of [720, 360] as const) {
    try {
      const res = await fetch(stockFileUrl(s.id, h), { mode: "cors", signal });
      if (res.ok) return await res.blob();
      last = new Error(String(res.status));
    } catch (e) {
      if (signal.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("download");
}

/**
 * Moving background: upload a video, or pick one of the free stock videos.
 * Hover a card to play its preview; a click loads it as the background. The
 * picked file is kept in this browser only, like the background picture.
 */
export function BgVideoPicker({ compact = false }: { compact?: boolean }) {
  const bgVideo = useProjectStore((s) => s.bgVideo);
  const setBgVideo = useProjectStore((s) => s.setBgVideo);
  const [cat, setCat] = useState<StockCategory | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ video: StockVideo | null; text: string } | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The object URL dies with this picker's owner; a replaced one is revoked right away
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const adopt = async (blob: Blob, fileName: string, stock?: VideoAsset["stock"]) => {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const meta = await probeVideo(objectUrl);
      const old = urlRef.current ?? useProjectStore.getState().bgVideo?.objectUrl;
      urlRef.current = objectUrl;
      setBgVideo({ fileName, objectUrl, ...meta, stock });
      if (old && old !== objectUrl) URL.revokeObjectURL(old);
      setError(null);
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
      setError({ video: null, text: e instanceof Error ? e.message : "영상을 열지 못했습니다." });
    }
  };

  const pickStock = async (s: StockVideo) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(s.id);
    setError(null);
    try {
      const blob = await fetchStock(s, ac.signal);
      await adopt(blob, `mixkit-${s.id}.mp4`, { id: s.id, title: s.title, pageUrl: s.pageUrl });
    } catch {
      if (!ac.signal.aborted)
        setError({
          video: s,
          text: "이 브라우저에서 바로 받지 못했습니다. 아래 링크에서 내려받아 '영상 올리기'로 넣어 주세요.",
        });
    } finally {
      if (abortRef.current === ac) setBusy(null);
    }
  };

  const remove = () => {
    const url = useProjectStore.getState().bgVideo?.objectUrl;
    setBgVideo(null);
    releasePreviewVideo();
    if (url) URL.revokeObjectURL(url);
    urlRef.current = null;
  };

  const list = searchStock(q, cat);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="font-semibold text-zinc-300">배경 영상</span>
        <Tip>
          배경 그림 대신 움직이는 영상을 깝니다. 노래보다 짧으면 반복됩니다. 직접 올린 영상과 고른 영상은 이
          브라우저 안에서만 쓰이고 어디에도 올라가지 않습니다. 무료 영상은 Mixkit(mixkit.co)의 무료 라이선스
          영상으로, 상업용·뮤직비디오에도 출처 표기 없이 쓸 수 있습니다. 영상마다 라이선스가 다를 수 있으니
          카드의 ↗ 링크에서 확인하세요.
        </Tip>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto rounded-md border border-zinc-800 px-2 py-1 text-zinc-300 hover:border-indigo-500"
        >
          영상 올리기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void adopt(f, f.name);
          }}
        />
      </div>

      {bgVideo && (
        <div className="flex items-center gap-2 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-2 py-1.5 text-[11px]">
          <span className="min-w-0 flex-1 truncate text-zinc-200" title={bgVideo.fileName}>
            🎞 {bgVideo.stock ? bgVideo.stock.title : bgVideo.fileName}
            <span className="ml-1 text-zinc-500">{bgVideo.duration.toFixed(1)}초</span>
          </span>
          {bgVideo.stock && (
            <a
              href={bgVideo.stock.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 hover:underline"
            >
              출처 ↗
            </a>
          )}
          <button type="button" onClick={remove} className="text-red-300 hover:underline">
            빼기
          </button>
        </div>
      )}
      {bgVideo && <BgVideoFilterControls />}

      <div className="flex flex-wrap gap-1">
        {(
          [["all", "전체"], ...STOCK_CATEGORIES] as ReadonlyArray<readonly [StockCategory | "all", string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={cat === id}
            onClick={() => setCat(id)}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${cat === id ? CHIP_ON : CHIP_OFF}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색 (예: 비, 도쿄, 노을)"
        aria-label="무료 배경 영상 검색"
        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-amber-700/60 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-snug text-amber-200"
        >
          {error.text}
          {error.video && (
            <a
              href={error.video.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-indigo-300 underline"
            >
              {error.video.title} 페이지 ↗
            </a>
          )}
        </p>
      )}
      <div
        className={`grid gap-1.5 overflow-y-auto pr-1 ${compact ? "max-h-64 grid-cols-3" : "max-h-80 grid-cols-2"}`}
      >
        {list.map((s) => (
          <StockCard
            key={s.id}
            video={s}
            busy={busy === s.id}
            picked={bgVideo?.stock?.id === s.id}
            onPick={() => void pickStock(s)}
          />
        ))}
        {list.length === 0 && (
          <p className="col-span-full py-3 text-center text-[11px] text-zinc-500">찾는 영상이 없습니다.</p>
        )}
      </div>
      <p className="text-[10px] text-zinc-600">
        무료 영상 제공: Mixkit ·{" "}
        <a
          href={MIXKIT_LICENSE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-zinc-400"
        >
          라이선스
        </a>
      </p>
    </div>
  );
}

function StockCard({
  video,
  busy,
  picked,
  onPick,
}: {
  video: StockVideo;
  busy: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [thumbOk, setThumbOk] = useState(true);
  return (
    <div
      className={`group relative overflow-hidden rounded-md border ${picked ? "border-indigo-400" : "border-zinc-800 hover:border-zinc-600"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        title={`${video.title} — 눌러서 배경으로`}
        className="block w-full text-left"
      >
        <div className="relative aspect-video bg-zinc-900">
          {hover ? (
            <video
              src={stockFileUrl(video.id, 360)}
              muted
              autoPlay
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : thumbOk ? (
            <img
              src={stockThumbUrl(video.id)}
              alt=""
              loading="lazy"
              onError={() => setThumbOk(false)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-lg text-zinc-700">🎞</span>
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-zinc-100">
              받는 중…
            </span>
          )}
        </div>
        <span className="block truncate px-1.5 py-1 text-[10px] text-zinc-300">{video.title}</span>
      </button>
      <a
        href={video.pageUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${video.title} Mixkit 페이지`}
        className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-zinc-200 opacity-0 hover:text-indigo-200 focus:opacity-100 group-hover:opacity-100"
      >
        ↗
      </a>
    </div>
  );
}
