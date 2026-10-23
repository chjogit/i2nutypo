import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import type { Project } from "@/types/project";
import { CANVAS_SIZE } from "@/lib/render/canvas-size";
import { stepParticles, createParticles } from "@/lib/render/particles";
import { bpmPulseEnergy, renderFrame } from "@/lib/render/render-frame";
import { resolveIllustrationImages, resolvePropLayers } from "@/lib/render/looks/image-cache";
import type { IllustrationImages } from "@/lib/render/looks/illustration";
import { bassLevels, mixDown } from "./beat-envelope";

export type VideoQuality = 720 | 1080;
export type VideoFps = 30 | 60;

export interface VideoExportOptions {
  /** Short side of the video in pixels. */
  quality: VideoQuality;
  fps: VideoFps;
  signal: AbortSignal;
  /** 0..1 */
  onProgress: (done: number) => void;
}

export interface VideoExportResult {
  blob: Blob;
  extension: "mp4" | "webm";
  width: number;
  height: number;
}

/** The preview draws at 60 fps and moves particles one step per frame. */
const PREVIEW_FPS = 60;

/** Whether this browser can encode video at all (WebCodecs). */
export const canExportVideo = (): boolean =>
  typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window;

/** Pixel size of the output: the frame's short side becomes `quality`, rounded to even numbers for the encoder. */
export function outputSize(aspect: Project["style"]["aspectRatio"], quality: VideoQuality) {
  const base = CANVAS_SIZE[aspect];
  const scale = quality / Math.min(base.width, base.height);
  const even = (n: number) => Math.round((n * scale) / 2) * 2;
  return { width: even(base.width), height: even(base.height), scale, base };
}

const AUDIO_CHUNK_SEC = 1;

/** A copy of `durationSec` of the song from `startSec`, shorter at the end. */
function sliceAudio(song: AudioBuffer, startSec: number, durationSec: number): AudioBuffer {
  const from = Math.round(startSec * song.sampleRate);
  const length = Math.max(1, Math.min(song.length - from, Math.round(durationSec * song.sampleRate)));
  const piece = new AudioBuffer({
    length,
    numberOfChannels: song.numberOfChannels,
    sampleRate: song.sampleRate,
  });
  for (let c = 0; c < song.numberOfChannels; c++) {
    piece.copyToChannel(song.getChannelData(c).subarray(from, from + length), c);
  }
  return piece;
}

async function decodeSong(project: Project): Promise<AudioBuffer | null> {
  if (project.audio.kind !== "upload") return null;
  const data = await (await fetch(project.audio.objectUrl)).arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(data);
  } finally {
    void ctx.close();
  }
}

/** Images still decoding resolve to null; the export waits for them so no frame misses a layer. */
async function loadImages(project: Project, signal: AbortSignal): Promise<IllustrationImages> {
  const want = (["background", "character", "cover"] as const).filter((k) => project.images[k]);
  const wantProps = project.props.filter((p) => p.onTimeline && p.clips.length > 0).length;
  for (let i = 0; i < 50; i++) {
    const images = resolveIllustrationImages(project.images);
    if (want.every((k) => images[k]) && resolvePropLayers(project.props).length === wantProps) return images;
    if (signal.aborted) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return resolveIllustrationImages(project.images);
}

async function pickCodecs(width: number, height: number, audio: AudioBuffer | null) {
  const audioOpts = audio ? { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate } : {};
  const formats: Array<{
    extension: "mp4" | "webm";
    video: VideoCodec[];
    audio: AudioCodec[];
  }> = [
    { extension: "mp4", video: ["avc", "hevc", "vp9", "av1"], audio: ["aac", "opus"] },
    { extension: "webm", video: ["vp9", "vp8", "av1"], audio: ["opus", "vorbis"] },
  ];
  for (const f of formats) {
    const video = await getFirstEncodableVideoCodec(f.video, { width, height, quality: QUALITY_HIGH });
    if (!video) continue;
    if (!audio) return { ...f, video, audio: null };
    const audioCodec = await getFirstEncodableAudioCodec(f.audio, { ...audioOpts, quality: QUALITY_HIGH });
    if (audioCodec) return { ...f, video, audio: audioCodec };
  }
  return null;
}

/**
 * Renders the whole song frame by frame with the preview's renderer and
 * encodes it in the browser (WebCodecs via mediabunny). Nothing is uploaded.
 * MP4 (H.264 + AAC) when the browser can, otherwise WebM.
 */
export async function exportVideo(project: Project, o: VideoExportOptions): Promise<VideoExportResult> {
  const { width, height, scale, base } = outputSize(project.style.aspectRatio, o.quality);
  const song = await decodeSong(project);
  const duration = song?.duration ?? project.duration;
  const codecs = await pickCodecs(width, height, song);
  if (!codecs)
    throw new Error(
      "이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않습니다. 최신 Chrome이나 Edge에서 시도해 주세요.",
    );

  await document.fonts.ready;
  const images = await loadImages(project, o.signal);
  const props = resolvePropLayers(project.props);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("캔버스를 만들지 못했습니다.");

  const output = new Output({
    format:
      codecs.extension === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, { codec: codecs.video, quality: QUALITY_HIGH });
  output.addVideoTrack(videoSource, { frameRate: o.fps });
  const audioSource =
    song && codecs.audio ? new AudioBufferSource({ codec: codecs.audio, quality: QUALITY_HIGH }) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  const frames = Math.max(1, Math.ceil(duration * o.fps));
  const levels = song
    ? bassLevels(
        mixDown(Array.from({ length: song.numberOfChannels }, (_, c) => song.getChannelData(c))),
        song.sampleRate,
        o.fps,
        frames,
      )
    : null;
  const particles = createParticles();
  const extraSteps = Math.max(0, Math.round(PREVIEW_FPS / o.fps) - 1);
  const { style } = project;

  try {
    await output.start();
    // The song goes in one-second pieces just ahead of the frames, so the two tracks interleave as they are written
    let audioSec = 0;
    const feedAudio = async (untilSec: number) => {
      if (!audioSource || !song) return;
      while (audioSec < Math.min(untilSec, song.duration)) {
        await audioSource.add(sliceAudio(song, audioSec, AUDIO_CHUNK_SEC));
        audioSec += AUDIO_CHUNK_SEC;
      }
    };
    for (let f = 0; f < frames; f++) {
      if (o.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      const t = f / o.fps;
      await feedAudio(t + AUDIO_CHUNK_SEC);
      const level = levels ? levels[f] : 0;
      const energy =
        level > 0.05
          ? Math.min(1, level * (style.beatReact / 80))
          : bpmPulseEnergy(t, style.bpm, style.beatReact, true);
      // Logical size stays the preview's, so everything sits where it does there; only the pixels are finer
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderFrame({
        ctx,
        W: base.width,
        H: base.height,
        timeSec: t,
        lines: project.lines,
        style,
        fx: project.fx,
        subtitles: project.subtitles,
        introGateSec: project.sync.introGateSec,
        particles,
        energy,
        animateParticles: true,
        images,
        props,
      });
      for (let s = 0; s < extraSteps; s++)
        stepParticles(particles, project.fx.particleBeatDrift ? energy * 1.4 : 0);
      await videoSource.add(t, 1 / o.fps);
      if (f % 15 === 0) {
        o.onProgress(f / frames);
        // Let the page paint the progress bar and answer clicks
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await feedAudio(Infinity);
    audioSource?.close();
    videoSource.close();
    await output.finalize();
  } catch (e) {
    if (output.state !== "finalized") await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  o.onProgress(1);
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("영상 데이터가 비어 있습니다.");
  return {
    blob: new Blob([buffer], { type: codecs.extension === "mp4" ? "video/mp4" : "video/webm" }),
    extension: codecs.extension,
    width,
    height,
  };
}
