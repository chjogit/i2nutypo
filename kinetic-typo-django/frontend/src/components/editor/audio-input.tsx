import { useEffect, useRef, useState } from "react";
import { closeAudioGraph, ensureAudioGraph } from "@/lib/audio/audio-graph";
import { usePlaybackStore } from "@/store/playback-store";
import { useProjectStore } from "@/store/project-store";
import { keepSong } from "@/lib/session/shared-song";

/**
 * Picks a local audio file (it stays in the browser; only an object URL is
 * kept). Once loaded, the section shows the song's player bar, which is also
 * the clock for the canvas preview, and a button to pick another file, which
 * also clears the lyrics. The beginner page shows it without its heading, inside a step card.
 */
export function AudioInput({ heading = true }: { heading?: boolean }) {
  const audio = useProjectStore((s) => s.audio);
  const setAudio = useProjectStore((s) => s.setAudio);
  const clearLyrics = useProjectStore((s) => s.clearLyrics);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // Register the player with the playback store and mirror its state
  const objectUrl = audio.kind === "upload" ? audio.objectUrl : null;
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    const playback = usePlaybackStore.getState();
    playback.setAudioElement(el);
    const onPlay = () => {
      // Native controls can start playback too; the analyser needs this gesture
      void ensureAudioGraph(el);
      usePlaybackStore.getState().setPlaying(true);
    };
    const onPause = () => usePlaybackStore.getState().setPlaying(false);
    const onSeeked = () => usePlaybackStore.getState().setCurrentTime(el.currentTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", onSeeked);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("seeked", onSeeked);
      el.pause();
      if (usePlaybackStore.getState().audioEl === el) usePlaybackStore.getState().setAudioElement(null);
    };
  }, [objectUrl]);

  // The analyser graph lives as long as the element
  useEffect(
    () => () => {
      if (audioElRef.current) void closeAudioGraph(audioElRef.current);
    },
    [],
  );

  const handleFile = (file: File) => {
    setError(null);
    const nextUrl = URL.createObjectURL(file);
    const probe = new Audio();
    const cleanupProbe = () => {
      probe.removeAttribute("src");
      probe.load();
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      cleanupProbe();
      if (!Number.isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(nextUrl);
        setError("음원 길이를 읽지 못했습니다.");
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = nextUrl;
      // Another song means other lyrics: start the lyrics box over
      if (useProjectStore.getState().audio.kind === "upload") clearLyrics();
      setAudio({ kind: "upload", fileName: file.name, mimeType: file.type, objectUrl: nextUrl, duration });
      void keepSong(file, duration);
    };
    probe.onerror = () => {
      cleanupProbe();
      URL.revokeObjectURL(nextUrl);
      setError("이 파일은 재생할 수 없는 형식입니다.");
    };
    probe.src = nextUrl;
  };

  return (
    <section aria-label="음원" className="space-y-2 px-4 py-4">
      {heading && <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-400">음원</h2>}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="sr-only"
        aria-label="음원 파일"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {audio.kind === "upload" ? (
        <div className="space-y-2">
          <p className="truncate text-xs text-zinc-300" title={audio.fileName}>
            🎵 {audio.fileName} · {audio.duration.toFixed(1)}초
          </p>
          <audio ref={audioElRef} src={audio.objectUrl} controls preload="auto" className="w-full" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-indigo-500 hover:text-zinc-100"
          >
            다른 음원 선택 (가사 초기화)
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center rounded-md border border-dashed border-zinc-800 px-3 py-4 text-sm text-zinc-400 hover:border-indigo-500 hover:text-zinc-200"
        >
          음원 파일 선택 (mp3, wav, m4a…)
        </button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
