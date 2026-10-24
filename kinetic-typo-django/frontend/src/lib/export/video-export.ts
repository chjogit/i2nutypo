import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
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
import type { Project } from "@/types/project";
import { CANVAS_SIZE } from "@/lib/render/canvas-size";
import { stepParticles, createParticles } from "@/lib/render/particles";
import { bpmPulseEnergy, renderFrame, steppedTime } from "@/lib/render/render-frame";
import type { FrameLayer } from "@/lib/render/looks/render-look";
import { resolveIllustrationImages, resolvePropLayers } from "@/lib/render/looks/image-cache";
import type { IllustrationImages } from "@/lib/render/looks/illustration";
import { bassLevels, mixDown } from "./beat-envelope";
import { ZipWriter } from "./zip";
import { mixSoundEffects } from "@/lib/sfx/mix";
import { openVideoReader, type VideoFrameReader } from "@/lib/media/video-bg";
import { beatGridPulse } from "@/lib/beats/detect";

export type VideoQuality = 720 | 1080;
export type VideoFps = 24 | 30 | 60;
/** Encoder bitrate step: 표준, 높음, 최고. */
export type EncodeLevel = "standard" | "high" | "best";
/**
 * "video": the whole frame as MP4/WebM. "green" / "black": the lyrics,
 * the illustrations in front of them and the subtitles on a flat color, for
 * keying in another editor. "png": the same front layer as transparent PNG
 * frames in a ZIP. "layers": front and back layers as two PNG folders in a ZIP.
 */
export type ExportKind = "video" | "green" | "black" | "png" | "layers";

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
  signal: AbortSignal;
  /** 0..1 */
  onProgress: (done: number) => void;
}

export interface VideoExportResult {
  blob: Blob;
  extension: "mp4" | "webm" | "zip";
  width: number;
  height: number;
  frames: number;
}

const LEVEL_QUALITY = { standard: QUALITY_MEDIUM, high: QUALITY_HIGH, best: QUALITY_VERY_HIGH } as const;

/** Flat colors for keying. */
const KEY_COLOR = { green: "#00b140", black: "#000000" } as const;

export const isVideoKind = (k: ExportKind): boolean => k === "video" || k === "green" || k === "black";

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
  const images = job.bgFrame ? { ...job.images, background: job.bgFrame } : job.images;
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
export async function exportVideo(project: Project, o: VideoExportOptions): Promise<VideoExportResult> {
  const { width, height, scale, base } = outputSize(project.style.aspectRatio, o.quality);
  const song = await decodeSong(project);
  const songEnd = song?.duration ?? project.duration;
  const from = Math.max(0, Math.min(o.range?.start ?? 0, songEnd));
  const to = Math.max(from + 1 / o.fps, Math.min(o.range?.end ?? songEnd, songEnd));
  const video = isVideoKind(o.kind);
  // The sound effects on the timeline go into the soundtrack along with the song
  const audio =
    video && o.withAudio ? await mixSoundEffects(song, songEnd, project.sfx, project.sounds) : null;
  const codecs = video ? await pickCodecs(width, height, audio, LEVEL_QUALITY[o.level]) : null;
  if (video && !codecs)
    throw new Error(
      "이 브라우저는 영상 인코딩(WebCodecs)을 지원하지 않습니다. 최신 Chrome이나 Edge에서 시도해 주세요.",
    );

  await document.fonts.ready;
  const images = await loadImages(project, o.signal);
  const props = resolvePropLayers(project.props);

  // Keyed and PNG frames are drawn on a clear canvas first
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: o.kind !== "video" });
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
  const extraSteps = Math.max(0, Math.round(PREVIEW_FPS / o.fps) - 1);
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
  const nextBg = async () => {
    if (bgReader) job.bgFrame = (await bgReader.next()) ?? job.bgFrame;
  };
  const step = (energy: number) => {
    for (let s = 0; s < extraSteps; s++)
      stepParticles(job.particles, project.fx.particleBeatDrift ? energy * 1.4 : 0);
  };
  const tick = async (i: number) => {
    if (o.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
    if (i % 15 === 0) {
      o.onProgress(i / frames);
      // Let the page paint the progress bar and answer clicks
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  try {
    if (!video) {
      const zip = new ZipWriter();
      const pad = (n: number) => String(n).padStart(6, "0");
      for (let i = 0; i < frames; i++) {
        await tick(i);
        const f = firstFrame + i;
        const t = f / o.fps;
        const energy = energyAt(f, t);
        await nextBg();
        if (o.kind === "layers") {
          drawAt(job, t, energy, "back");
          zip.add(`back/${pad(i)}.png`, await canvasPng(canvas));
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, width, height);
        }
        drawAt(job, t, energy, "front");
        zip.add(`${o.kind === "layers" ? "front/" : ""}${pad(i)}.png`, await canvasPng(canvas));
        step(energy);
      }
      o.onProgress(1);
      return { blob: zip.finish(), extension: "zip", width, height, frames };
    }
    return await encode();
  } finally {
    bgReader?.dispose();
    canvas.width = 0;
    canvas.height = 0;
    out.width = 0;
    out.height = 0;
  }

  async function encode(): Promise<VideoExportResult> {
    if (!codecs || !outCtx) throw new Error("영상 인코더를 찾지 못했습니다.");
    const output = new Output({
      format:
        codecs.extension === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const videoSource = new CanvasSource(out, { codec: codecs.video, quality: LEVEL_QUALITY[o.level] });
    output.addVideoTrack(videoSource, { frameRate: o.fps });
    const audioSource =
      audio && codecs.audio ? new AudioBufferSource({ codec: codecs.audio, quality: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    try {
      await output.start();
      // The song goes in one-second pieces just ahead of the frames, so the two tracks interleave as they are written
      let audioSec = 0;
      const span = to - from;
      const feedAudio = async (untilSec: number) => {
        if (!audioSource || !audio) return;
        while (audioSec < Math.min(untilSec, span)) {
          await audioSource.add(
            sliceAudio(audio, from + audioSec, Math.min(AUDIO_CHUNK_SEC, span - audioSec)),
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
        step(energy);
        await videoSource.add(i / o.fps, 1 / o.fps);
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
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("영상 데이터가 비어 있습니다.");
    return {
      blob: new Blob([buffer], { type: codecs.extension === "mp4" ? "video/mp4" : "video/webm" }),
      extension: codecs.extension,
      width,
      height,
      frames,
    };
  }
}
