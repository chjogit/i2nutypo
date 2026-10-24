import { useEffect, useRef, useState } from "react";
import { forgetImage } from "@/lib/render/looks/image-cache";
import { pickedLooks } from "@/lib/render/looks/presets";
import { useProjectStore } from "@/store/project-store";
import { Tip } from "@/components/ui/tip";

/**
 * The album jacket theme's cover art, for the guided beginner page: shown only
 * while that theme is picked. Without a cover the theme draws the background
 * (picture or video) on the record and the jacket instead.
 */
export function AlbumCoverPicker() {
  const albumPicked = useProjectStore((s) => pickedLooks(s.style).includes("album_jacket"));
  const cover = useProjectStore((s) => s.images.cover);
  const setImage = useProjectStore((s) => s.setImage);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const release = () => {
    const url = urlRef.current;
    if (!url) return;
    forgetImage(url);
    URL.revokeObjectURL(url);
    urlRef.current = null;
  };

  // The picked file lives as long as the page that picked it
  useEffect(() => release, []);

  if (!albumPicked) return null;

  const pick = (file: File) => {
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      release();
      urlRef.current = objectUrl;
      setImage("cover", { fileName: file.name, objectUrl });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("이 파일은 열 수 없는 이미지 형식입니다.");
    };
    probe.src = objectUrl;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="font-semibold text-zinc-300">앨범 커버</span>
        <Tip>
          앨범 자켓 테마의 정사각 커버와 레코드 라벨에 들어가는 그림입니다. 정사각형 그림이 가장 잘 맞습니다.
          커버가 없으면 배경(그림이나 영상)이 커버와 레코드 안에 그려집니다.
        </Tip>
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:border-indigo-500 hover:text-zinc-100">
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pick(file);
            e.target.value = "";
          }}
        />
        {cover ? "앨범 커버 바꾸기" : "앨범 커버 올리기"}
      </label>
      {cover && (
        <p className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span className="truncate">{cover.fileName}</span>
          <button
            type="button"
            onClick={() => {
              release();
              setImage("cover", null);
            }}
            className="shrink-0 text-indigo-400 hover:underline"
          >
            빼기
          </button>
        </p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
