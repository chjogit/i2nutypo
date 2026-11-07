import {
  AudioBufferSource,
  BufferTarget,
  StreamTarget,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import { filterBackground } from "@/lib/render/bg-filter";
import type { Project } from "@/types/project";
import { ensureKineticFonts } from "@/lib/render/kinetic/fonts";
import { motionStyleOf } from "@/lib/render/kinetic/styles";
import { CANVAS_SIZE } from "@/lib/render/canvas-size";
import { createParticles } from "@/lib/render/particles";
import { bpmPulseEnergy, renderFrame, steppedTime } from "@/lib/render/render-frame";
import type { FrameLayer } from "@/lib/render/looks/render-look";
import { resolveIllustrationImages, resolvePropLayers } from "@/lib/render/looks/image-cache";
import type { IllustrationImages } from "@/lib/render/looks/illustration";
import { bassLevels, mixDown } from "./beat-envelope";
import { BT709_LIMITED, rgbaToI420Bt709 } from "./yuv";
import { ZipWriter } from "./zip";
import { encodeSgi, encodeTga, SEQUENCE_EXT, type SequenceFormat } from "./image-formats";
import { openProResWriter, type ProResWriter } from "./prores";
import { openPropVideoReaders } from "@/lib/media/prop-video";
import { openVideoReader, type VideoFrameReader } from "@/lib/media/video-bg";
import { beatGridPulse } from "@/lib/beats/detect";
import { edgeGain } from "@/lib/shorts/highlight";

export type VideoQuality = 720 | 1080 | 1440 | 2160;
/** Every output size, short side in pixels. */
export const VIDEO_QUALITIES: readonly VideoQuality[] = [720, 1080, 1440, 2160];
export type VideoFps = 24 | 30 | 60;
/** Encoder bitrate step: 표준, 높음, 최고. */
export type EncodeLevel = "standard" | "high" | "best";
/**
 * "video": the whole frame as MP4/WebM. "green" / "black": the lyrics,
 * the illustrations in front of them and the subtitles on a flat color, for
 * keying in another editor. "png": the same front layer as transparent PNG
 * frames in a ZIP. "layers": front and back layers as two PNG folders in a ZIP.
 * "mov": the front layer as a MOV in ProRes 4444 XQ with alpha.
 */
export type ExportKind = "video" | "green" | "black" | "png" | "layers" | "mov";

export interface VideoExportOptions {
  kind: ExportKind;
  /** Short side of the video in pixels. */
  quality: VideoQuality;
  fps: VideoFps;
  level: EncodeLevel;
  /** Part of the song to export, in seconds; the whole song when missing. */
  range?: { start: number; end: number };
  /** Put the song in the video (video kinds only). */
  withAudio: boolean;
  /**
   * Frame shape to render at instead of the project's own (a vertical 9:16
   * short of a 16:9 project). The lyrics and themes lay themselves out again for it.
   */
  aspect?: Project["style"]["aspectRatio"];
  /** Seconds the song fades in at the start of the part and out at its end (shorts). */
  audioFade?: { in: number; out: number };
  /** Image format of the frames for "png" and "layers" (PNG, TGA or SGI). */
  sequence?: SequenceFormat;
  /** What the export is doing besides drawing frames (downloading the ProRes encoder, encoding). */
  onStage?: (text: string | null) => void;
  signal: AbortSignal;
  /** 0..1 */
  onProgress: (done: number) => void;
  /**
   * A file the user picked to save into (video kinds). The video is written
   * there as it is encoded instead of being held in memory, so long songs at
   * high sizes do not run the tab out of memory. The result's blob is then null.
   */
  saveTo?: FileSystemWritableFileStream;
}

export interface VideoExportResult {
  /** The file, or null when it was written straight into `saveTo`. */
  blob: Blob | null;
  extension: "mp4" | "webm" | "zip" | "mov";
  width: number;
  height: number;
  frames: number;
}

const LEVEL_QUALITY = { standard: QUALITY_MEDIUM, high: QUALITY_HIGH, best: QUALITY_VERY_HIGH } as const;

/** Flat colors for keying. */
const KEY_COLOR = { green: "#00b140", black: "#000000" } as const;

export const isVideoKind = (k: ExportKind): boolean => k === "video" || k === "green" || k === "black";

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
function sliceAudio(
  song: AudioBuffer,
  startSec: number,
  durationSec: number,
  gain?: (sampleIndex: number) => number,
): AudioBuffer {
  const from = Math.round(startSec * song.sampleRate);
  const length = Math.max(1, Math.min(song.length - from, Math.round(durationSec * song.sampleRate)));
  const piece = new AudioBuffer({
    length,
    numberOfChannels: song.numberOfChannels,
    sampleRate: song.sampleRate,
  });
  for (let c = 0; c < song.numberOfChannels; c++) {
    const src = song.getChannelData(c).subarray(from, from + length);
    if (!gain) {
      piece.copyToChannel(src, c);
      continue;
    }
    const faded = new Float32Array(length);
    for (let i = 0; i < length; i++) faded[i] = src[i] * gain(i);
    piece.copyToChannel(faded, c);
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
  // Video illustrations get their frames from a reader, not the image cache
  const wantProps = project.props.filter((p) => p.onTimeline && p.clips.length > 0 && !p.video).length;
  for (let i = 0; i < 50; i++) {
    const images = resolveIllustrationImages(project.images);
    if (want.every((k) => images[k]) && resolvePropLayers(project.props).length === wantProps) return images;
    if (signal.aborted) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return resolveIllustrationImages(project.images);
}

async function pickCodecs(
  width: number,
  height: number,
  audio: AudioBuffer | null,
  quality: (typeof LEVEL_QUALITY)[EncodeLevel],
) {
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
    const video = await getFirstEncodableVideoCodec(f.video, { width, height, quality });
    if (!video) continue;
    if (!audio) return { ...f, video, audio: null };
    const audioCodec = await getFirstEncodableAudioCodec(f.audio, { ...audioOpts, quality: QUALITY_HIGH });
    if (audioCodec) return { ...f, video, audio: audioCodec };
  }
  return null;
}

/** Draws frame t of the project (one layer, or the whole frame) on ctx at the output scale. */
interface FrameJob {
  project: Project;
  ctx: CanvasRenderingContext2D;
  scale: number;
  base: { width: number; height: number };
  images: IllustrationImages;
  props: ReturnType<typeof resolvePropLayers>;
  particles: ReturnType<typeof createParticles>;
  /** This frame of the background video, when there is one. */
  bgFrame?: IllustrationImages["background"];
}

function drawAt(job: FrameJob, t: number, energy: number, layer: FrameLayer) {
  const { project, ctx, scale, base } = job;
  const images = job.bgFrame
    ? { ...job.images, background: filterBackground(job.bgFrame, project.style.bgVideoFilter, "export") }
    : job.images;
  // Logical size stays the preview's, so everything sits where it does there; only the pixels are finer
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderFrame({
    ctx,
    W: base.width,
    H: base.height,
    timeSec: steppedTime(t, project.style.frameStep),
    lines: project.lines,
    style: project.style,
    fx: project.fx,
    subtitles: project.subtitles,
    introGateSec: project.sync.introGateSec,
    particles: job.particles,
    energy,
    animateParticles: true,
    images,
    props: job.props,
    layer,
  });
}

const canvasPng = (canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => {
      if (!b) reject(new Error("PNG로 바꾸지 못했습니다."));
      else void b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/png"),
  );

/**
 * Renders the song (or the chosen part) frame by frame with the preview's
 * renderer, in this browser; nothing is uploaded. Video kinds are encoded with
 * WebCodecs via mediabunny, MP4 (H.264 + AAC) when the browser can, otherwise
 * WebM. PNG kinds are written into a ZIP.
 */
export async function exportVideo(
  sourceProject: Project,
  options: VideoExportOptions,
): Promise<VideoExportResult> {
  let o = options;
  const project =
    o.aspect && o.aspect !== sourceProject.style.aspectRatio
      ? { ...sourceProject, style: { ...sourceProject.style, aspectRatio: o.aspect } }
      : sourceProject;
  const { width, height, scale, base } = outputSize(project.style.aspectRatio, o.quality);
  const song = await decodeSong(project);
  const songEnd = song?.duration ?? project.duration;
  const from = Math.max(0, Math.min(o.range?.start ?? 0, songEnd));
  const to = Math.max(from + 1 / o.fps, Math.min(o.range?.end ?? songEnd, songEnd));
  const video = isVideoKind(o.kind);
  const audio = video && o.withAudio ? song : null;
  const codecs = video ? await pickCodecs(width, height, audio, LEVEL_QUALITY[o.level]) : null;
  if (video && !codecs)
    throw new Error(
      "이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않습니다. 최신 Chrome이나 Edge에서 시도해 주세요.",
    );

  // The picked file is an .mp4; when this browser can only make WebM, the video is kept in memory instead
  if (o.saveTo && codecs?.extension !== "mp4") {
    await o.saveTo.abort().catch(() => undefined);
    o = { ...o, saveTo: undefined };
  }

  // The motion styles' type (Pretendard, Inter, Noto) is loaded for every glyph of the lyrics first
  if (motionStyleOf(project.style)) await ensureKineticFonts(project.lyricsText, project.style.lyricFont);
  await document.fonts.ready;
  const images = await loadImages(project, o.signal);
  const props = resolvePropLayers(project.props);

  // Keyed and PNG frames are drawn on a clear canvas first
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const sequence: SequenceFormat = o.kind === "png" || o.kind === "layers" ? (o.sequence ?? "png") : "png";
  const ctx = canvas.getContext("2d", { alpha: o.kind !== "video", willReadFrequently: sequence !== "png" });
  if (!ctx) throw new Error("캔버스를 만들지 못했습니다.");
  const keyed = o.kind === "green" || o.kind === "black";
  const out = keyed ? document.createElement("canvas") : canvas;
  out.width = width;
  out.height = height;
  const outCtx = keyed ? out.getContext("2d", { alpha: false }) : ctx;
  if (!outCtx) throw new Error("캔버스를 만들지 못했습니다.");

  const job: FrameJob = { project, ctx, scale, base, images, props, particles: createParticles() };
  const songFrames = Math.max(1, Math.ceil(songEnd * o.fps));
  const levels = song
    ? bassLevels(
        mixDown(Array.from({ length: song.numberOfChannels }, (_, c) => song.getChannelData(c))),
        song.sampleRate,
        o.fps,
        songFrames,
      )
    : null;
  const { style } = project;
  const firstFrame = Math.floor(from * o.fps);
  const frames = Math.max(1, Math.ceil(to * o.fps) - firstFrame);
  const energyAt = (f: number, t: number) => {
    const level = levels ? (levels[Math.min(levels.length - 1, f)] ?? 0) : 0;
    return level > 0.05
      ? Math.min(1, level * (style.beatReact / 80))
      : project.beats
        ? beatGridPulse(t, project.beats, style.beatReact, true)
        : bpmPulseEnergy(t, style.bpm, style.beatReact, true);
  };
  // Background video frames, decoded for exactly the frames written
  const bgReader: VideoFrameReader | null = project.bgVideo
    ? await openVideoReader(
        project.bgVideo,
        Array.from({ length: frames }, (_, i) => (firstFrame + i) / o.fps),
        width,
      ).catch(() => null)
    : null;
  // Video illustrations, decoded frame by frame like the background video
  const propReader = project.props.some((p) => p.video && p.onTimeline)
    ? await openPropVideoReaders(
        project.props,
        Array.from({ length: frames }, (_, i) => (firstFrame + i) / o.fps),
        width,
      )
    : null;
  const nextBg = async () => {
    if (bgReader) job.bgFrame = (await bgReader.next()) ?? job.bgFrame;
    if (propReader) job.props = resolvePropLayers(project.props, await propReader.next());
  };
  const frameFile = async (): Promise<Uint8Array<ArrayBuffer>> => {
    if (sequence === "png") return canvasPng(canvas);
    const data = ctx.getImageData(0, 0, width, height).data;
    return sequence === "tga" ? encodeTga(data, width, height) : encodeSgi(data, width, height);
  };
  let prores: ProResWriter | null = null;
  const tick = async (i: number) => {
    if (o.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
    if (i % 15 === 0) {
      o.onProgress(i / frames);
      // Let the page paint the progress bar and answer clicks
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  try {
    if (o.kind === "mov") {
      o.onStage?.("ProRes 인코더 준비 중");
      prores = await openProResWriter({
        fps: o.fps,
        onDownload: (share) => o.onStage?.(`ProRes 인코더 내려받는 중 ${Math.round(share * 100)}%`),
      });
      o.onStage?.(null);
      for (let i = 0; i < frames; i++) {
        await tick(i);
        const f = firstFrame + i;
        const t = f / o.fps;
        const energy = energyAt(f, t);
        await nextBg();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        drawAt(job, t, energy, "front");
        await prores.add(await canvasPng(canvas));
      }
      o.onStage?.("MOV 파일 마무리 중");
      const blob = await prores.finish();
      o.onStage?.(null);
      o.onProgress(1);
      return { blob, extension: "mov", width, height, frames };
    }
    if (!video) {
      const zip = new ZipWriter();
      const pad = (n: number) => String(n).padStart(6, "0");
      const ext = SEQUENCE_EXT[sequence];
      for (let i = 0; i < frames; i++) {
        await tick(i);
        const f = firstFrame + i;
        const t = f / o.fps;
        const energy = energyAt(f, t);
        await nextBg();
        if (o.kind === "layers") {
          drawAt(job, t, energy, "back");
          zip.add(`back/${pad(i)}.${ext}`, await frameFile());
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, width, height);
        }
        drawAt(job, t, energy, "front");
        zip.add(`${o.kind === "layers" ? "front/" : ""}${pad(i)}.${ext}`, await frameFile());
      }
      o.onProgress(1);
      return { blob: zip.finish(), extension: "zip", width, height, frames };
    }
    return await encode();
  } finally {
    bgReader?.dispose();
    propReader?.dispose();
    prores?.dispose();
    o.onStage?.(null);
    canvas.width = 0;
    canvas.height = 0;
    out.width = 0;
    out.height = 0;
  }

  async function encode(): Promise<VideoExportResult> {
    if (!codecs || !outCtx) throw new Error("영상 인코더를 찾지 못했습니다.");
    const mp4 = codecs.extension === "mp4";
    const output = new Output({
      // Written to a file as it goes, the index goes at the end; held in memory, it goes first for quick playback
      format: mp4
        ? new Mp4OutputFormat({ fastStart: o.saveTo ? false : "in-memory" })
        : new WebMOutputFormat(),
      target: o.saveTo ? new StreamTarget(o.saveTo, { chunked: true }) : new BufferTarget(),
    });
    // Frames go to the encoder as BT.709 limited-range YUV, the form players, editors and upload sites
    // expect; a canvas frame would be tagged full range with an sRGB curve
    const videoSource = new VideoSampleSource({ codec: codecs.video, quality: LEVEL_QUALITY[o.level] });
    output.addVideoTrack(videoSource, { frameRate: o.fps });
    const audioSource =
      audio && codecs.audio ? new AudioBufferSource({ codec: codecs.audio, quality: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    let yuv: Uint8Array | undefined;
    const addFrame = async (i: number) => {
      const rgba = outCtx.getImageData(0, 0, width, height).data;
      yuv = rgbaToI420Bt709(rgba, width, height, yuv);
      const sample = new VideoSample(yuv, {
        format: "I420",
        codedWidth: width,
        codedHeight: height,
        timestamp: i / o.fps,
        duration: 1 / o.fps,
        colorSpace: BT709_LIMITED,
      });
      try {
        await videoSource.add(sample);
      } finally {
        sample.close();
      }
    };
    try {
      await output.start();
      // The song goes in one-second pieces just ahead of the frames, so the two tracks interleave as they are written
      let audioSec = 0;
      const span = to - from;
      const feedAudio = async (untilSec: number) => {
        if (!audioSource || !audio) return;
        while (audioSec < Math.min(untilSec, span)) {
          const at = audioSec;
          const fade = o.audioFade;
          const gain = fade
            ? (i: number) => edgeGain(at + i / audio.sampleRate, span, fade.in, fade.out)
            : undefined;
          await audioSource.add(
            sliceAudio(audio, from + audioSec, Math.min(AUDIO_CHUNK_SEC, span - audioSec), gain),
          );
          audioSec += AUDIO_CHUNK_SEC;
        }
      };
      for (let i = 0; i < frames; i++) {
        await tick(i);
        const f = firstFrame + i;
        const t = f / o.fps;
        await feedAudio(i / o.fps + AUDIO_CHUNK_SEC);
        const energy = energyAt(f, t);
        await nextBg();
        if (keyed) {
          job.ctx.setTransform(1, 0, 0, 1, 0, 0);
          job.ctx.clearRect(0, 0, width, height);
          drawAt(job, t, energy, "front");
          outCtx.fillStyle = KEY_COLOR[o.kind as "green" | "black"];
          outCtx.fillRect(0, 0, width, height);
          outCtx.drawImage(canvas, 0, 0);
        } else {
          drawAt(job, t, energy, "full");
        }
        await addFrame(i);
      }
      await feedAudio(Infinity);
      audioSource?.close();
      videoSource.close();
      await output.finalize();
    } catch (e) {
      if (output.state !== "finalized") await output.cancel().catch(() => undefined);
      throw e;
    }
    o.onProgress(1);
    if (o.saveTo) return { blob: null, extension: codecs.extension, width, height, frames };
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error("영상 데이터가 비어 있습니다.");
    return {
      blob: new Blob([buffer], { type: mp4 ? "video/mp4" : "video/webm" }),
      extension: codecs.extension,
      width,
      height,
      frames,
    };
  }
}
