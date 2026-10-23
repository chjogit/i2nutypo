import type {
  CollabPart,
  FxToggleKey,
  FxToggles,
  LyricLine,
  LyricWord,
  StyleSettings,
  SubtitleSettings,
  WordEffect,
} from "@/types/project";
import { COLLAB_PARTS } from "@/lib/presets/collab-parts";
import { easeOutBack, easeOutExpo } from "./easing";
import { drawCollabMotif, type Ctx2D } from "./motifs";
import { stepParticles, type Particle } from "./particles";
import { drawBottomSubtitles, hasSubtitleText, showsKineticLyrics } from "./subtitles";
import { recordTextBounds, type TextBounds } from "./text-bounds";
import { manualRows, MIN_FIT_SCALE, widthAround, wrapText } from "./wrap";
import { DEFAULT_DETAIL, frameShake, glitchGain, lyricOffset, shakeGain } from "./detail";
import { effectiveFx, effectiveStyle, lineForOffsets } from "./style-mode";
import type { IllustrationImages } from "./looks/illustration";
import { CELLS, characterRect, GRID, sanitizeCells } from "./looks/layout";
import { renderLookFrame } from "./looks/render-look";

export interface FrameInput {
  ctx: Ctx2D;
  W: number;
  H: number;
  timeSec: number;
  lines: readonly LyricLine[];
  style: StyleSettings;
  fx: FxToggles;
  subtitles: SubtitleSettings;
  introGateSec: number;
  particles: Particle[];
  /** Beat energy 0..1 driving pulses and particle drift. */
  energy: number;
  /** Advance particle positions this frame (off for still or exported frames). */
  animateParticles: boolean;
  /** Text-only layer: no background, motifs, flashes or subtitle box. */
  transparentBg?: boolean;
  /** Decoded illustration layers for the look presets; missing means none loaded. */
  images?: IllustrationImages;
  /** Filled with where this frame drew its lyrics (the preview's text box handles). */
  bounds?: TextBounds;
}

const CAMERA_MAX_SCALE = 1.2;
/** Lyrics taller than this share of the frame are drawn smaller. */
const MAX_LYRIC_HEIGHT = 0.62;

const NO_IMAGES: IllustrationImages = { background: null, character: null };
const NO_BLOCKS: readonly boolean[] = Array<boolean>(CELLS).fill(false);

interface WordPaint {
  ctx: Ctx2D;
  /** Widest a row of lyrics may be and still stay inside the frame where it is placed. */
  maxWidth: number;
  style: StyleSettings;
  fx: FxToggles;
  W: number;
  curText: string;
  curAccent: string;
  isFlashFrame: boolean;
  energy: number;
  /** Glitch multiplier from the detail tab, 1 = default. */
  glitch: number;
}

const PART_BY_ID = new Map<string, CollabPart>(COLLAB_PARTS.map((p) => [p.partId, p]));

const EFFECT_FX_KEY: Record<Exclude<WordEffect, "normal">, FxToggleKey> = {
  slice: "fxSlice",
  stretch: "fxStretch",
  drop: "fxDrop",
  blur: "fxBlur",
  mirror: "fxMirror",
  impact: "fxImpact",
};

const isOn = (l: LyricLine, t: number) => t >= l.startTime && t < l.endTime;

/** The ordinary line on screen at timeSec and the ordinary line after it. */
export function findActiveLine(
  lines: readonly LyricLine[],
  timeSec: number,
): { line: LyricLine; next: LyricLine | null } | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].overlap || !isOn(lines[i], timeSec)) continue;
    return { line: lines[i], next: lines.slice(i + 1).find((l) => !l.overlap) ?? null };
  }
  return null;
}

/**
 * Lines on screen at timeSec: the main one and the overlapping ("&") ones sung
 * over it. An overlapping line that outlasts its main line takes its place.
 */
export function findOnScreenLines(
  lines: readonly LyricLine[],
  timeSec: number,
): { line: LyricLine; next: LyricLine | null; overlaps: LyricLine[] } | null {
  const active = findActiveLine(lines, timeSec);
  const overlaps = lines.filter((l) => l.overlap && isOn(l, timeSec));
  if (active) return { ...active, overlaps };
  if (overlaps.length === 0) return null;
  return { line: overlaps[0], next: null, overlaps: overlaps.slice(1) };
}

/** Draws one frame of the kinetic typography video. Ported from renderFrame in the original studio. */
export function renderFrame(input: FrameInput): void {
  const { ctx, W, H, timeSec, lines, subtitles, introGateSec, particles, energy } = input;
  if (input.bounds) input.bounds.lyrics = null;
  const fx = effectiveFx(input.style, input.fx);
  const transparentBg = input.transparentBg ?? false;
  const isInIntroGate = timeSec < introGateSec;
  const active = isInIntroGate ? null : findOnScreenLines(lines, timeSec);
  const activeLine = active?.line ?? null;
  const overlaps = active?.overlaps ?? [];
  const style = effectiveStyle(input.style, activeLine);
  const detail = style.detail ?? DEFAULT_DETAIL;
  const shake = transparentBg ? { x: 0, y: 0 } : frameShake(detail, energy, timeSec, W, H);
  const lyricShift = lyricOffset(detail, lineForOffsets(style, activeLine), W, H);
  const subtitleShift = { x: detail.subtitleX * W, y: detail.subtitleY * H };

  if (style.lookPreset !== "classic") {
    const images = input.images ?? NO_IMAGES;
    const charRect = characterRect(style.illustration, images.character, W, H);
    const lineElapsed = activeLine ? timeSec - activeLine.startTime : 0;
    const lineDur = activeLine ? Math.max(0.01, activeLine.endTime - activeLine.startTime) : 1;
    const hasSubtitle =
      activeLine !== null && [activeLine, ...overlaps].some((l) => hasSubtitleText(subtitles, l));
    let blocked = style.illustration.avoidCharacter
      ? sanitizeCells(style.illustration.noTextCells)
      : NO_BLOCKS;
    // Subtitles sit at the bottom unless moved to the top, which keeps the lyrics out of the top row
    const subtitleTop = hasSubtitle && subtitles.position === "top";
    if (subtitleTop) blocked = blocked.map((b, c) => b || c < GRID);
    renderLookFrame(
      style.lookPreset,
      {
        preset: style.lookPreset,
        ctx,
        W,
        H,
        timeSec,
        line: activeLine,
        nextLine: active?.next ?? null,
        overlaps,
        lineElapsed,
        lineProgress: Math.min(1, Math.max(0, lineElapsed / lineDur)),
        songEnd: lines.reduce((end, l) => Math.max(end, l.endTime), 0),
        style,
        subtitles,
        energy,
        images,
        charRect,
        blocked,
        subtitleVisible: hasSubtitle && !subtitleTop,
        subtitleTop,
        glitch: glitchGain(detail),
        shake: shakeGain(detail),
        frameShake: shake,
        lyricShift,
        subtitleShift,
        textBounds: input.bounds,
      },
      transparentBg,
    );
    return;
  }

  const part = (activeLine && PART_BY_ID.get(activeLine.collabPartId)) || COLLAB_PARTS[0];
  const useRelayColors = style.collabRelay && activeLine !== null;
  const motif = style.collabRelay ? (isInIntroGate ? "bokeh_scope" : part.motif) : style.fixedMotif;

  let isFlashFrame = false;
  if (!transparentBg && style.flashInvert && activeLine) {
    const lineElapsed = timeSec - activeLine.startTime;
    isFlashFrame = activeLine.words.some((w) => {
      const wElapsed = lineElapsed - w.startOffset;
      return w.isAccent && wElapsed >= 0 && wElapsed < 0.05;
    });
  }

  const baseBg = useRelayColors ? part.bgColor : style.bgColor;
  const baseAccent = useRelayColors ? part.accentColor : style.accentColor;
  const curBg = isFlashFrame ? baseAccent : baseBg;
  const curText = isFlashFrame ? "#08090f" : style.textColor;
  const curAccent = isFlashFrame ? "#ffffff" : baseAccent;

  ctx.save();
  if (transparentBg) {
    ctx.clearRect(0, 0, W, H);
  } else {
    // Clear past the edges so the beat shake never shows the canvas behind
    ctx.fillStyle = curBg;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(shake.x, shake.y);
    ctx.fillStyle = curBg;
    ctx.fillRect(0, 0, W, H);

    const showParticles = isInIntroGate ? fx.introBokeh : style.particles;
    if (input.animateParticles) stepParticles(particles, fx.particleBeatDrift ? energy * 1.4 : 0);
    if (showParticles) {
      const hueEnabled = [fx.particleBlue, fx.particleYellow, fx.particleWhite];
      for (const pt of particles) {
        if (!hueEnabled[pt.hueType]) continue;
        const radius = isInIntroGate ? pt.r * 1.9 : pt.r * 0.65;
        const col =
          pt.hueType === 0
            ? `rgba(56, 189, 248, ${pt.alpha})`
            : pt.hueType === 1
              ? `rgba(250, 204, 21, ${pt.alpha})`
              : `rgba(255, 255, 255, ${pt.alpha * 0.8})`;
        ctx.fillStyle = isFlashFrame ? "rgba(0,0,0,0.2)" : col;
        ctx.beginPath();
        ctx.arc(pt.x * W, pt.y * H, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (activeLine && fx.motifGraphics) {
      drawCollabMotif({ ctx, motif, W, H, timeSec, curAccent, bgColor: curBg, energy, isFlashFrame });
    }
  }

  // Center stage: intro countdown, kinetic lyric, or interlude notice
  ctx.save();
  ctx.translate(W / 2 + lyricShift.x, H / 2 + lyricShift.y);
  const paint: WordPaint = {
    ctx,
    // The camera zooms in up to about this much at a line's end
    maxWidth: widthAround(W / 2 + lyricShift.x, W, W * 0.04) / CAMERA_MAX_SCALE,
    style,
    fx,
    W,
    curText,
    curAccent,
    isFlashFrame,
    energy,
    glitch: glitchGain(detail),
  };

  if (isInIntroGate) {
    if (!transparentBg && fx.introGuide) drawIntroGuide(ctx, W, H, timeSec, introGateSec, lines, style);
  } else if (activeLine) {
    const lineDur = activeLine.endTime - activeLine.startTime;
    const lineElapsed = timeSec - activeLine.startTime;
    const lineProgress = Math.min(1, Math.max(0, lineElapsed / lineDur));

    if (style.cameraMatchCut && !transparentBg) {
      const entryZoom = easeOutBack(Math.min(1, lineElapsed / 0.3));
      const exitTransition = lineProgress > 0.88 ? Math.pow((lineProgress - 0.88) / 0.12, 2) : 0;
      const sk = shakeGain(detail);
      const camScale = 0.92 + 0.08 * entryZoom + energy * 0.035 * sk + exitTransition * 0.18;
      const camRotDeg =
        (activeLine.cameraAngle * (1 - entryZoom * 0.8) +
          exitTransition * (activeLine.cameraAngle > 0 ? 6 : -6)) *
        sk;
      ctx.scale(camScale, camScale);
      ctx.rotate((camRotDeg * Math.PI) / 180);
    }

    // The NEXT preview is drawn after the line, so it stays out of the line's text box
    const next: { draw: (() => void) | null } = { draw: null };
    const drawLine = () => {
      if (style.displayMode === "word") {
        drawWordFocusMode(paint, activeLine, lineElapsed, H);
      } else {
        next.draw = drawSentenceMode(paint, activeLine, active?.next ?? null, lineElapsed, H, transparentBg);
      }
    };
    // In the bottom-only display the line is shown in the subtitles alone
    if (!showsKineticLyrics(subtitles)) next.draw = null;
    else if (input.bounds) input.bounds.lyrics = recordTextBounds(ctx, drawLine);
    else drawLine();
    next.draw?.();
  } else if (!transparentBg && fx.interludeGuide) {
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.038)}px ${style.mainFont}`;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♪ 간주 구간 — 다음 보컬 첫 단어 대기 중 ♪", 0, 0);
  }
  ctx.restore();

  if (style.letterbox && !transparentBg) {
    const barH = Math.round(H * 0.08);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, barH);
    ctx.fillRect(0, H - barH, W, barH);
  }

  if (activeLine) {
    const hasSubtitle = hasSubtitleText(subtitles, activeLine);
    ctx.save();
    ctx.translate(subtitleShift.x, subtitleShift.y);
    drawBottomSubtitles({
      ctx,
      line: activeLine,
      lineElapsed: timeSec - activeLine.startTime,
      W,
      H,
      settings: subtitles,
      shiftX: subtitleShift.x,
      letterbox: style.letterbox,
      isFlashFrame,
      transparentBg,
      placement: subtitles.position,
      mainFont: style.mainFont,
      bounds: input.bounds,
    });
    ctx.restore();

    if (style.collabRelay && fx.creditTag && !transparentBg) {
      ctx.font = `700 ${Math.round(Math.min(W, H) * 0.019)}px 'JetBrains Mono', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      // Keeps clear of the edge the subtitles occupy
      const tagTop = hasSubtitle && subtitles.position !== "top";
      ctx.fillText(`STYLE // ${part.creator} — ${part.title}`, W * 0.04, tagTop ? H * 0.07 : H * 0.94);
    }
  }

  ctx.restore();
}

function drawIntroGuide(
  ctx: Ctx2D,
  W: number,
  H: number,
  timeSec: number,
  introGateSec: number,
  lines: readonly LyricLine[],
  style: StyleSettings,
): void {
  const remain = Math.max(0, introGateSec - timeSec);
  const progress = Math.min(1, timeSec / Math.max(0.1, introGateSec));

  ctx.font = `700 ${Math.round(Math.min(W, H) * 0.032)}px ${style.accentFont}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪ INSTRUMENTAL INTRO — 보컬 진입 대기 중 ♪", 0, -24);

  ctx.font = `600 ${Math.round(Math.min(W, H) * 0.022)}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = "#fbbf24";
  const firstWord = lines[0]?.firstWord ?? "";
  ctx.fillText(`첫 보컬 시작까지 -${remain.toFixed(1)}s  |  대기 중인 첫 단어: [${firstWord}]`, 0, 16);

  const barW = W * 0.34;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(-barW / 2, 46, barW, 5);
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-barW / 2, 46, barW * progress, 5);
}

function drawSentenceMode(
  paint: WordPaint,
  line: LyricLine,
  nextLine: LyricLine | null,
  lineElapsed: number,
  H: number,
  transparentBg: boolean,
): (() => void) | null {
  const { ctx, style, fx, W, isFlashFrame } = paint;
  const box = line.lineStyle;
  const maxLineWidth = Math.min(W * 0.82 * (box.width ?? 1), paint.maxWidth);

  type RowItem = { word: LyricWord; width: number; fontSize: number };
  // Rows break between words (between phrases for Japanese written with
  // spaces) and at the user's manual breaks; text that would still run off
  // the frame (too many rows, or one word wider than the frame) is drawn smaller
  const widestWord = (baseSize: number) =>
    Math.max(
      0,
      ...line.words.map((word) => {
        ctx.font = `900 ${word.isAccent ? Math.round(baseSize * 1.15) : baseSize}px ${style.mainFont}`;
        return ctx.measureText(word.text).width;
      }),
    );
  const layout = (baseSize: number) => {
    const gap = baseSize * 0.32;
    const rows: RowItem[][] = [[]];
    let rowWidth = 0;
    for (const word of line.words) {
      let fontSize = word.isAccent ? Math.round(baseSize * 1.15) : baseSize;
      ctx.font = `900 ${fontSize}px ${style.mainFont}`;
      let width = ctx.measureText(word.text).width;
      if (width > maxLineWidth) {
        fontSize = Math.max(8, Math.floor((fontSize * maxLineWidth) / width));
        width = maxLineWidth;
      }
      if ((word.breakBefore || rowWidth + width > maxLineWidth) && rows[rows.length - 1].length > 0) {
        rows.push([]);
        rowWidth = 0;
      }
      rows[rows.length - 1].push({ word, width, fontSize });
      rowWidth += width + gap;
    }
    return { rows, gap };
  };

  let baseSize = Math.round(Math.min(W, H) * 0.076 * style.fontScale);
  // Shrink the whole line rather than cut a word (or phrase) in two
  const widest = widestWord(baseSize);
  if (widest > maxLineWidth)
    baseSize = Math.max(10, Math.floor(baseSize * Math.max(MIN_FIT_SCALE, maxLineWidth / widest)));
  let { rows, gap } = layout(baseSize);
  for (
    let tries = 0;
    tries < 4 && rows.length * baseSize * 1.45 * (box.height ?? 1) > H * MAX_LYRIC_HEIGHT;
    tries++
  ) {
    baseSize = Math.max(10, Math.floor(baseSize * 0.85));
    ({ rows, gap } = layout(baseSize));
  }

  const rowHeight = baseSize * 1.45 * (box.height ?? 1);
  const totalHeight = rows.length * rowHeight;
  const showNext = nextLine !== null && !transparentBg && style.nextPreview;

  rows.forEach((items, rIdx) => {
    const rowTotalW = items.reduce((acc, it) => acc + it.width, 0) + Math.max(0, items.length - 1) * gap;
    let cursorX = -rowTotalW / 2;
    const rowY = (rIdx - (rows.length - 1) / 2) * rowHeight - (showNext ? baseSize * 0.22 : 0);

    for (const item of items) {
      const wElapsed = transparentBg ? 0.5 : lineElapsed - item.word.startOffset;
      const centerX = cursorX + item.width / 2;
      cursorX += item.width + gap;

      if (wElapsed < 0) {
        if (!fx.ghostWords) continue;
        ctx.save();
        ctx.translate(centerX, rowY);
        ctx.font = `900 ${item.fontSize}px ${style.mainFont}`;
        ctx.fillStyle = isFlashFrame ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.14)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.word.text, 0, 0);
        ctx.restore();
        continue;
      }
      drawAnimatedWord(paint, item.word, wElapsed, centerX, rowY, item.fontSize);
    }
  });

  if (!showNext || !nextLine || isFlashFrame) return null;
  return () => {
    ctx.save();
    ctx.font = `600 ${Math.round(baseSize * 0.34)}px ${style.accentFont}`;
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `NEXT [${nextLine.firstWord}] : ${manualRows(nextLine.cleanText).join(" ")}`,
      0,
      totalHeight / 2 + baseSize * 0.78,
      paint.maxWidth,
    );
    ctx.restore();
  };
}

function drawWordFocusMode(paint: WordPaint, line: LyricLine, lineElapsed: number, H: number): void {
  const { ctx, style, W, isFlashFrame } = paint;
  let current = line.words[0];
  for (const w of line.words) {
    if (lineElapsed >= w.startOffset) current = w;
  }
  if (!current) return;

  let bigSize = Math.round(Math.min(W, H) * 0.14 * style.fontScale);
  ctx.font = `900 ${bigSize}px ${style.mainFont}`;
  const wordW = ctx.measureText(current.text).width;
  if (wordW > paint.maxWidth) bigSize = Math.max(10, Math.floor((bigSize * paint.maxWidth) / wordW));
  drawAnimatedWord(
    paint,
    current,
    Math.max(0, lineElapsed - current.startOffset),
    0,
    -bigSize * 0.15,
    bigSize,
  );

  ctx.save();
  const captionPx = Math.round(Math.min(W, H) * 0.036);
  ctx.font = `700 ${captionPx}px ${style.accentFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isFlashFrame ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.55)";
  wrapText(line.cleanText, paint.maxWidth, (t) => ctx.measureText(t).width).forEach((row, i) =>
    ctx.fillText(row, 0, bigSize * 0.95 + i * captionPx * 1.3),
  );
  ctx.restore();
}

function drawAnimatedWord(
  paint: WordPaint,
  word: LyricWord,
  wElapsed: number,
  x: number,
  y: number,
  fontSize: number,
): void {
  const { ctx, style, fx, W, curText, curAccent, isFlashFrame, energy, glitch } = paint;
  const enterT = Math.min(1, wElapsed / 0.24);
  const elastic = easeOutBack(enterT);
  const expo = easeOutExpo(enterT);
  const isSpeaking = wElapsed >= 0 && wElapsed < 0.42;

  ctx.save();
  ctx.translate(x, y);
  ctx.font = `900 ${fontSize}px ${style.mainFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fillCol = word.isAccent ? curAccent : curText;
  // A disabled semantic effect falls back to the default slide-in
  const effect = word.effect !== "normal" && !fx[EFFECT_FX_KEY[word.effect]] ? "normal" : word.effect;
  const useImpact = fx.fxImpact && (effect === "impact" || word.isAccent);

  if (word.isFirstWord && wElapsed < 0.45 && !isFlashFrame && fx.firstWordUnderline) {
    const wWidth = ctx.measureText(word.text).width;
    ctx.fillStyle = curAccent;
    ctx.fillRect(-wWidth * 0.5 * expo, fontSize * 0.52, wWidth * expo, 4);
  }

  if (effect === "slice") {
    const offset = ((1 - expo) * 45 + (wElapsed < 0.3 ? Math.sin(wElapsed * 35) * 6 : 0)) * glitch;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-W, -fontSize, W * 2, fontSize);
    ctx.clip();
    ctx.translate(-offset, 0);
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(-W, 0, W * 2, fontSize);
    ctx.clip();
    ctx.translate(offset, 0);
    ctx.fillStyle = isFlashFrame ? "#000" : style.secondaryColor;
    ctx.fillText(word.text, 0, 0);
    ctx.restore();
  } else if (effect === "stretch") {
    ctx.scale(0.75 + expo * 0.55, 1);
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
  } else if (effect === "drop") {
    const dropY = -80 * (1 - elastic) + (wElapsed > 0.2 ? (wElapsed - 0.2) * 30 : 0);
    ctx.translate(0, dropY);
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
  } else if (effect === "blur") {
    ctx.filter = `blur(${Math.max(0, (1 - expo) * 14).toFixed(1)}px)`;
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
    ctx.filter = "none";
  } else if (effect === "mirror") {
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
    ctx.save();
    ctx.scale(1, -0.6);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = curAccent;
    ctx.fillText(word.text, 0, -fontSize * 1.05);
    ctx.restore();
  } else if (useImpact) {
    const popScale = 1.65 - 0.65 * elastic + (isSpeaking ? energy * 0.08 : 0);
    ctx.scale(popScale, popScale);
    if (!isFlashFrame) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(word.text, -4, 4);
    }
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
  } else {
    const pop = isSpeaking ? 1.06 : 1.0;
    ctx.translate(0, (1 - elastic) * (fontSize * 0.65));
    ctx.scale(pop, pop);
    ctx.fillStyle = fillCol;
    ctx.fillText(word.text, 0, 0);
  }

  ctx.restore();
}

/** Beat pulse from the BPM, used until audio analysis is wired in. */
export function bpmPulseEnergy(timeSec: number, bpm: number, beatReact: number, isPlaying: boolean): number {
  const beatDur = 60 / bpm;
  const beatPhase = (timeSec % beatDur) / beatDur;
  const pulse = Math.pow(Math.max(0, 1 - beatPhase * 3.0), 2);
  return isPlaying ? pulse * (beatReact / 100) : pulse * 0.25;
}
