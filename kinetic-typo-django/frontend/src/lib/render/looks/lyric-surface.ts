import type { StyleSettings } from "@/types/project";
import type { Ctx2D } from "../motifs";
import type { Box } from "../text-bounds";
import { clamp01 } from "./noise";

// What the lyrics sit on and in: a pane of liquid glass behind the line that
// bends and frosts the picture under it, and a 2.5D depth where the line is a
// card tilted in space that comes forward from the distance while the picture
// behind goes soft. Both run on the GPU (WebGL) with a plain 2D fallback, and
// everything moves with the clock only, so preview and export match.

export type LyricGlass = "off" | "clear" | "frost";

export interface LyricSurface {
  glass: LyricGlass;
  /** 0..1, 0 = flat. */
  depth: number;
}

export const LYRIC_GLASS: ReadonlyArray<readonly [LyricGlass, string]> = [
  ["off", "끔"],
  ["clear", "맑은 유리"],
  ["frost", "젖빛 유리"],
];

export function surfaceOf(style: Pick<StyleSettings, "lyricGlass" | "lyricDepth">): LyricSurface | null {
  const glass = style.lyricGlass === "clear" || style.lyricGlass === "frost" ? style.lyricGlass : "off";
  const depth = clamp01(Number(style.lyricDepth) || 0);
  if (glass === "off" && depth < 0.01) return null;
  return { glass, depth };
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

/**
 * The glass pane around the line's text box (device pixels): a margin that
 * grows with the type size, rounded like a pill on a single short line.
 */
export function paneAround(box: Box, unit: number, grow = 1): Rect {
  const h = box.y1 - box.y0;
  const padY = Math.min(h * 0.3, unit * 3.4) + unit * 1.8;
  const padX = padY * 1.35;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const hw = ((box.x1 - box.x0) / 2 + padX) * grow;
  const hh = (h / 2 + padY) * grow;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh, r: Math.min(hh, unit * 4.5) };
}

/** How the line's card sits in space at this moment (radians, and distance as a share of the focal length). */
export interface Pose {
  tiltX: number;
  tiltY: number;
  z: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Comes from the distance, leaning back, over the first 0.9 s of the line,
 * then keeps a slight lean and a slow sway, and creeps a little closer while
 * the line is sung.
 */
export function poseAt(
  depth: number,
  elapsed: number,
  progress: number,
  timeSec: number,
  seed: number,
): Pose {
  const k = 1 - Math.pow(1 - clamp01(elapsed / 0.9), 3);
  return {
    tiltX: deg(depth * (12 + (1 - k) * 22)),
    tiltY: deg(depth * 8) * Math.sin(timeSec * 0.31 + seed * 1.7),
    z: depth * ((1 - k) * 0.55 - clamp01(progress) * 0.05),
  };
}

/**
 * Where a point of the card (device pixels) lands on screen and its depth
 * factor w (> 1 farther away), the card turning about (cx, cy).
 */
export function project(
  x: number,
  y: number,
  cx: number,
  cy: number,
  focal: number,
  pose: Pose,
): { x: number; y: number; w: number } {
  const px = x - cx;
  const py = y - cy;
  // Lean back: the top goes away from the viewer
  const y1 = py * Math.cos(pose.tiltX);
  const z1 = -py * Math.sin(pose.tiltX);
  const x2 = px * Math.cos(pose.tiltY) + z1 * Math.sin(pose.tiltY);
  const z2 = -px * Math.sin(pose.tiltY) + z1 * Math.cos(pose.tiltY) + pose.z * focal;
  const w = Math.max(0.2, (focal + z2) / focal);
  return { x: cx + x2 / w, y: cy + y1 / w, w };
}

/** The camera's focal length in device pixels for a canvas of w×h. */
export const focalFor = (w: number, h: number): number => Math.max(w, h) * 1.1;

/** The screen box of a card area after projection. */
export function projectedBox(b: Box, cx: number, cy: number, focal: number, pose: Pose): Box {
  const pts = [
    project(b.x0, b.y0, cx, cy, focal, pose),
    project(b.x1, b.y0, cx, cy, focal, pose),
    project(b.x0, b.y1, cx, cy, focal, pose),
    project(b.x1, b.y1, cx, cy, focal, pose),
  ];
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

// ---------------------------------------------------------------- WebGL

const QUAD_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// The pane: a rounded box whose rim bends the picture inward like a thick lens,
// the middle magnified a touch and gently rippling, frosted by a ring of taps,
// split into color at the rim, lit along the top edge, with a soft shadow under it.
const GLASS_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBg;
uniform vec2 uSize;
uniform vec4 uRect;
uniform float uRadius, uFrost, uTime, uUnit, uAlpha;

float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec4 tap(vec2 q) { return texture2D(uBg, vec2(q.x / uSize.x, 1.0 - q.y / uSize.y)); }

void main() {
  vec2 q = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  vec2 c = (uRect.xy + uRect.zw) * 0.5;
  vec2 b = (uRect.zw - uRect.xy) * 0.5;
  vec2 p = q - c;
  float d = box(p, b, uRadius);
  float inside = clamp(0.5 - d, 0.0, 1.0);

  // Shadow a little below the pane
  float sd = box(p - vec2(0.0, uUnit * 1.4), b, uRadius);
  float shadow = (1.0 - smoothstep(-uUnit * 1.5, uUnit * 6.0, sd)) * 0.32 * (1.0 - inside);

  vec2 e = vec2(0.75, 0.0);
  vec2 n = vec2(box(p + e.xy, b, uRadius) - box(p - e.xy, b, uRadius), box(p + e.yx, b, uRadius) - box(p - e.yx, b, uRadius));
  n = n / max(length(n), 1e-4);
  float bevel = min(min(b.x, b.y) * 0.7, uUnit * 3.5);
  float rim = 1.0 - smoothstep(0.0, bevel, -d);
  float bend = rim * rim;
  vec2 wobble = vec2(sin(q.y / uUnit * 0.55 + uTime * 1.1), cos(q.x / uUnit * 0.45 + uTime * 0.9)) * uUnit * 0.22;
  vec2 off = n * bend * bevel * 0.85 - p * 0.05 + wobble * (1.0 - bend);

  vec4 col = tap(q + off) * 0.2;
  float rad = uUnit * (0.35 + uFrost * 1.9);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996 + 0.5;
    float r = sqrt((float(i) + 0.5) / 12.0) * rad;
    col += tap(q + off + vec2(cos(a), sin(a)) * r) * (0.8 / 12.0);
  }
  // Color fringe where the glass bends most
  vec4 red = tap(q + off * 1.12);
  vec4 blue = tap(q + off * 0.88);
  col.r = mix(col.r, red.r, bend * 0.6);
  col.b = mix(col.b, blue.b, bend * 0.6);

  // A milky lift, stronger when frosted, so the pane reads even over flat color
  float milk = 0.06 + uFrost * 0.08;
  col = col * (1.0 - milk) + vec4(vec3(milk), milk);

  // Light along the top-left of the rim and a fainter bounce at the bottom-right
  float lit = max(dot(n, normalize(vec2(-0.55, -0.85))), 0.0);
  float back = max(dot(n, normalize(vec2(0.55, 0.85))), 0.0);
  float edge = 1.0 - smoothstep(0.0, uUnit * 0.9, -d);
  float spec = edge * (pow(lit, 1.6) * 0.55 + pow(back, 2.0) * 0.18) + (1.0 - smoothstep(0.0, 1.2, abs(d + 1.0))) * 0.12;
  col += vec4(vec3(spec), spec);

  gl_FragColor = (clamp(col, 0.0, 1.0) * inside + vec4(0.0, 0.0, 0.0, shadow)) * uAlpha;
}`;

// The card: textured quad given in clip space with its own w, so the
// texture follows the perspective
const CARD_VERT = `
attribute vec4 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = aPos;
}`;

const CARD_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

type GL = WebGLRenderingContext;

interface Pipe {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  gl: GL;
  quad: WebGLBuffer;
  card: WebGLBuffer;
  glass: WebGLProgram;
  warp: WebGLProgram;
  tex: WebGLTexture;
  locs: Map<string, WebGLUniformLocation | null>;
}

let pipe: Pipe | null | undefined;

function compile(gl: GL, vs: string, fs: string, attrs: string[]): WebGLProgram {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type);
    if (!sh) throw new Error("shader");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  attrs.forEach((a, i) => gl.bindAttribLocation(prog, i, a));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  return prog;
}

function getPipe(): Pipe | null {
  if (pipe && pipe.gl.isContextLost()) pipe = undefined;
  if (pipe !== undefined) return pipe;
  pipe = null;
  try {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : null;
    if (!canvas) return null;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      preserveDrawingBuffer: true,
    }) as GL | null;
    if (!gl) return null;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const card = gl.createBuffer();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    pipe = {
      canvas,
      gl,
      quad,
      card,
      glass: compile(gl, QUAD_VERT, GLASS_FRAG, ["aPos"]),
      warp: compile(gl, CARD_VERT, CARD_FRAG, ["aPos", "aUv"]),
      tex,
      locs: new Map(),
    };
  } catch (e) {
    console.warn("[lyric-surface] WebGL unavailable, using the plain look", e);
    pipe = null;
  }
  return pipe;
}

function loc(p: Pipe, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
  const key = (prog === p.glass ? "g:" : "w:") + name;
  if (!p.locs.has(key)) p.locs.set(key, p.gl.getUniformLocation(prog, name));
  return p.locs.get(key) ?? null;
}

let staging: HTMLCanvasElement | OffscreenCanvas | null = null;

/** Copies a device-pixel area of `src` into the GL texture. */
function upload(p: Pipe, src: CanvasImageSource, x: number, y: number, w: number, h: number): boolean {
  if (!staging) {
    if (typeof OffscreenCanvas !== "undefined") staging = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") staging = document.createElement("canvas");
    else return false;
  }
  if (staging.width !== w || staging.height !== h) {
    staging.width = w;
    staging.height = h;
  }
  const sc = staging.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!sc) return false;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "copy";
  sc.drawImage(src, x, y, w, h, 0, 0, w, h);
  sc.globalCompositeOperation = "source-over";
  const { gl } = p;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, p.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, staging);
  return true;
}

function sized(p: Pipe, w: number, h: number) {
  if (p.canvas.width !== w) p.canvas.width = w;
  if (p.canvas.height !== h) p.canvas.height = h;
  p.gl.viewport(0, 0, w, h);
  p.gl.clearColor(0, 0, 0, 0);
  p.gl.clear(p.gl.COLOR_BUFFER_BIT);
}

/** Device-pixel area clamped to the canvas, or null when nothing is left. */
function clampArea(b: Box, W: number, H: number) {
  const x = Math.max(0, Math.floor(b.x0));
  const y = Math.max(0, Math.floor(b.y0));
  const w = Math.min(W, Math.ceil(b.x1)) - x;
  const h = Math.min(H, Math.ceil(b.y1)) - y;
  return w >= 2 && h >= 2 ? { x, y, w, h } : null;
}

const canvasOf = (ctx: Ctx2D) => (ctx as CanvasRenderingContext2D).canvas as HTMLCanvasElement;

// ---------------------------------------------------------------- glass

export interface GlassOptions {
  frost: number;
  timeSec: number;
  /** Device pixels per 1% of the frame's shorter side. */
  unit: number;
  /** 0..1, for fading the pane in and out with the line. */
  alpha: number;
}

/**
 * Draws a glass pane at `pane` (device pixels) onto `target`, made from what
 * `bg` shows there. `bg` can be target's own canvas.
 */
export function drawGlass(
  target: Ctx2D,
  bg: CanvasImageSource & { width: number; height: number },
  pane: Rect,
  o: GlassOptions,
): void {
  if (o.alpha <= 0.002) return;
  const margin = o.unit * 7;
  const area = clampArea(
    { x0: pane.x0 - margin, y0: pane.y0 - margin, x1: pane.x1 + margin, y1: pane.y1 + margin * 1.4 },
    bg.width,
    bg.height,
  );
  if (!area) return;
  const p = getPipe();
  if (!p || !upload(p, bg, area.x, area.y, area.w, area.h)) {
    glassFallback(target, bg, pane, o);
    return;
  }
  const { gl } = p;
  sized(p, area.w, area.h);
  gl.useProgram(p.glass);
  gl.uniform1i(loc(p, p.glass, "uBg"), 0);
  gl.uniform2f(loc(p, p.glass, "uSize"), area.w, area.h);
  gl.uniform4f(
    loc(p, p.glass, "uRect"),
    pane.x0 - area.x,
    pane.y0 - area.y,
    pane.x1 - area.x,
    pane.y1 - area.y,
  );
  gl.uniform1f(loc(p, p.glass, "uRadius"), pane.r);
  gl.uniform1f(loc(p, p.glass, "uFrost"), o.frost);
  gl.uniform1f(loc(p, p.glass, "uTime"), o.timeSec);
  gl.uniform1f(loc(p, p.glass, "uUnit"), o.unit);
  gl.uniform1f(loc(p, p.glass, "uAlpha"), clamp01(o.alpha));
  gl.bindBuffer(gl.ARRAY_BUFFER, p.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = 1;
  target.globalCompositeOperation = "source-over";
  target.filter = "none";
  target.drawImage(p.canvas, area.x, area.y);
  target.restore();
}

function roundRect(c: Ctx2D, r: Rect) {
  c.beginPath();
  c.roundRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, r.r);
}

/** Without WebGL: a blurred copy of the picture in the pane, a milky tint and a lit rim. */
function glassFallback(target: Ctx2D, bg: CanvasImageSource, pane: Rect, o: GlassOptions): void {
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = clamp01(o.alpha);
  target.filter = "none";
  target.shadowColor = "rgba(0,0,0,0.3)";
  target.shadowBlur = o.unit * 4;
  target.shadowOffsetY = o.unit * 1.4;
  roundRect(target, pane);
  target.fillStyle = "rgba(255,255,255,0.08)";
  target.fill();
  target.shadowColor = "transparent";
  target.save();
  roundRect(target, pane);
  target.clip();
  target.filter = `blur(${(o.unit * (0.5 + o.frost * 1.4)).toFixed(1)}px)`;
  target.drawImage(bg, 0, 0);
  target.filter = "none";
  target.fillStyle = `rgba(255,255,255,${(0.06 + o.frost * 0.08).toFixed(3)})`;
  target.fillRect(pane.x0, pane.y0, pane.x1 - pane.x0, pane.y1 - pane.y0);
  target.restore();
  const g = target.createLinearGradient(pane.x0, pane.y0, pane.x1, pane.y1);
  g.addColorStop(0, "rgba(255,255,255,0.6)");
  g.addColorStop(0.5, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0.25)");
  target.strokeStyle = g;
  target.lineWidth = Math.max(1, o.unit * 0.18);
  roundRect(target, pane);
  target.stroke();
  target.restore();
}

// ---------------------------------------------------------------- depth

let soft: HTMLCanvasElement | OffscreenCanvas | null = null;

/**
 * Softens everything already drawn on ctx, like a lens focused on the lyrics
 * in front. Blurred at half size and scaled back up, which looks the same at
 * these small radii and costs a quarter.
 */
export function blurBehind(ctx: Ctx2D, px: number): void {
  if (px < 0.3) return;
  const canvas = canvasOf(ctx);
  if (!canvas || !(canvas.width > 1)) return;
  const w = Math.ceil(canvas.width / 2);
  const h = Math.ceil(canvas.height / 2);
  if (!soft) {
    if (typeof OffscreenCanvas !== "undefined") soft = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") soft = document.createElement("canvas");
    else return;
  }
  if (soft.width !== w || soft.height !== h) {
    soft.width = w;
    soft.height = h;
  }
  const sc = soft.getContext("2d") as Ctx2D | null;
  if (!sc) return;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = "copy";
  sc.filter = `blur(${(px / 2).toFixed(2)}px)`;
  sc.drawImage(canvas, 0, 0, w, h);
  sc.filter = "none";
  sc.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(soft, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Draws `area` of the flat card `layer` (device pixels) onto ctx in
 * perspective, turning about (cx, cy), with a soft shadow cast behind it.
 * Returns where it landed, or null when nothing was drawn.
 */
export function drawCard(
  ctx: Ctx2D,
  layer: CanvasImageSource & { width: number; height: number },
  area: Box,
  cx: number,
  cy: number,
  pose: Pose,
  unit: number,
  depth: number,
  /** The card carries a glass pane with its own shadow, so the card's is lighter. */
  paned = false,
): Box | null {
  const a = clampArea(area, layer.width, layer.height);
  if (!a) return null;
  const focal = focalFor(layer.width, layer.height);
  const corners = [
    project(a.x, a.y, cx, cy, focal, pose),
    project(a.x + a.w, a.y, cx, cy, focal, pose),
    project(a.x, a.y + a.h, cx, cy, focal, pose),
    project(a.x + a.w, a.y + a.h, cx, cy, focal, pose),
  ];
  const out = {
    x0: Math.min(...corners.map((c) => c.x)),
    y0: Math.min(...corners.map((c) => c.y)),
    x1: Math.max(...corners.map((c) => c.x)),
    y1: Math.max(...corners.map((c) => c.y)),
  };
  const o = clampArea(out, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  if (!o) return null;
  // Cap the drawing size so a card thrown up close never asks for a huge buffer
  if (o.w > layer.width * 2 || o.h > layer.height * 2) return null;
  const shadow = () => {
    ctx.shadowColor = `rgba(0,0,0,${((0.18 + depth * 0.22) * (paned ? 0.35 : 1)).toFixed(3)})`;
    ctx.shadowBlur = unit * (1.5 + depth * 3);
    ctx.shadowOffsetY = unit * depth * 1.6;
  };
  const p = getPipe();
  if (!p || !upload(p, layer, a.x, a.y, a.w, a.h)) {
    // Without WebGL the card only comes closer; the lean needs the GPU
    const s = 1 / ((corners[0].w + corners[3].w) / 2);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    shadow();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.drawImage(layer, a.x, a.y, a.w, a.h, a.x, a.y, a.w, a.h);
    ctx.restore();
    return out;
  }
  const { gl } = p;
  sized(p, o.w, o.h);
  // Clip-space corners with w carried along, top-left, top-right, bottom-left, bottom-right
  const data: number[] = [];
  const uv = [
    [0, 1],
    [1, 1],
    [0, 0],
    [1, 0],
  ];
  corners.forEach((c, i) => {
    const nx = ((c.x - o.x) / o.w) * 2 - 1;
    const ny = 1 - ((c.y - o.y) / o.h) * 2;
    data.push(nx * c.w, ny * c.w, 0, c.w, uv[i][0], uv[i][1]);
  });
  gl.useProgram(p.warp);
  gl.uniform1i(loc(p, p.warp, "uTex"), 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, p.card);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(1);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  shadow();
  ctx.drawImage(p.canvas, o.x, o.y);
  ctx.restore();
  return out;
}

let cardLayer: HTMLCanvasElement | OffscreenCanvas | null = null;

/** A clear canvas the size of ctx's, with ctx's transform, for drawing the card flat. */
export function cardContext(ctx: Ctx2D): { c: Ctx2D; canvas: HTMLCanvasElement | OffscreenCanvas } | null {
  const main = canvasOf(ctx);
  if (!main || !(main.width > 0 && main.height > 0)) return null;
  if (!cardLayer) {
    if (typeof OffscreenCanvas !== "undefined") cardLayer = new OffscreenCanvas(main.width, main.height);
    else if (typeof document !== "undefined") cardLayer = document.createElement("canvas");
    else return null;
  }
  if (cardLayer.width !== main.width || cardLayer.height !== main.height) {
    cardLayer.width = main.width;
    cardLayer.height = main.height;
  }
  const c = cardLayer.getContext("2d") as Ctx2D | null;
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
  c.filter = "none";
  c.clearRect(0, 0, main.width, main.height);
  c.setTransform(ctx.getTransform());
  return { c, canvas: cardLayer };
}
