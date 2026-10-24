import type { Ctx2D } from "../motifs";
import type { FinishSettings } from "@/types/finish";
import { filmMotion, finishUniforms, isNeutralFinish, needsBlur } from "./settings";

/**
 * Final-look pass. The finished 2D frame is copied into a WebGL texture,
 * graded and filtered on the GPU, and drawn back over itself. Nothing leaves
 * the machine. Without WebGL the frame is left as it was.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 16-pixel box down to quarter size: four bilinear taps, each averaging four pixels
const DOWN_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec4 c = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0));
  c += texture2D(uTex, vUv + uTexel * vec2(1.0, -1.0));
  c += texture2D(uTex, vUv + uTexel * vec2(-1.0, 1.0));
  c += texture2D(uTex, vUv + uTexel * vec2(1.0, 1.0));
  gl_FragColor = c * 0.25;
}`;

// 9-tap gaussian in five linear fetches along uDir
const BLUR_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec4 c = texture2D(uTex, vUv) * 0.2270270270;
  c += texture2D(uTex, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(uTex, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(uTex, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(uTex, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;

const FINAL_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBlur;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure, uContrast, uSaturation, uTemp, uTint;
uniform int uGrade;
uniform float uGradeAmt;
uniform vec3 uShadowTint, uHighTint;
uniform float uVignette, uGrain, uBloom, uHalation, uChroma, uLeak, uMist, uSharpen, uScan, uDust;
uniform float uPoster, uPixel, uEdges, uHalftone, uTwoTone, uKaleido, uGate;
uniform vec3 uLift, uGamma, uGain;
uniform float uShadows, uHighlights, uVibrance;
uniform int uMask;
uniform float uMaskFeather, uMaskInvert;
uniform int uFilm;
uniform float uFilmAmt, uPush;
uniform vec3 uCmy, uToning;
uniform float uCompress, uGrainSize, uBreath;
uniform vec2 uWeave;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float luma(vec3 c) { return dot(c, LUMA); }

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 softLight(vec3 a, vec3 b) {
  vec3 lo = 2.0 * a * b + a * a * (1.0 - 2.0 * b);
  vec3 hi = 2.0 * a * (1.0 - b) + sqrt(a) * (2.0 * b - 1.0);
  return mix(lo, hi, step(0.5, b));
}

vec3 keepLuma(vec3 c, float l) { return clamp(c + (l - luma(c)), 0.0, 1.0); }

vec3 saturate3(vec3 c, float s) { return mix(vec3(luma(c)), c, s); }

vec3 sCurve(vec3 c, float k) { return mix(c, c * c * (3.0 - 2.0 * c), k); }

// Film stocks: tone curve, crossover and color balance of each, mixed in by uFilmAmt
vec3 film(vec3 c) {
  float l = luma(c);
  vec3 f = c;
  if (uFilm == 1) {
    f = sCurve(c, 0.22);
    f = mix(vec3(0.03, 0.045, 0.035), vec3(0.98, 0.95, 0.88), f);
    f.r += 0.03 * smoothstep(0.5, 1.0, l);
    f.b -= 0.04 * smoothstep(0.5, 1.0, l);
    f = saturate3(f, 0.92);
  } else if (uFilm == 2) {
    f = sCurve(sCurve(c, 0.5), 0.2) - 0.02;
    f.b += 0.04 * (1.0 - smoothstep(0.0, 0.4, l));
    f = saturate3(f, 1.28);
  } else if (uFilm == 3) {
    vec3 tone = mix(vec3(0.0, 0.38, 0.42), vec3(1.0, 0.66, 0.4), smoothstep(0.1, 0.9, l));
    f = keepLuma(softLight(c, tone), l);
    f = sCurve(f, 0.35);
    f = f / (1.0 + max(f - 0.8, 0.0) * 1.6);
    f = saturate3(f, 1.05);
  } else if (uFilm == 4) {
    f = sCurve(c, 0.25);
    f.g = mix(f.g, f.g * 1.06, smoothstep(0.2, 0.7, l));
    f.r *= 0.96;
    f = mix(vec3(0.02, 0.04, 0.05), vec3(0.95, 0.97, 0.94), f);
    f = saturate3(f, 0.9);
  } else if (uFilm == 5) {
    f = mix(vec3(0.1, 0.12, 0.14), vec3(0.97, 0.93, 0.84), c);
    f.r += 0.03 * (1.0 - abs(l - 0.5) * 2.0);
    f.b += 0.02 * (1.0 - abs(l - 0.5) * 2.0);
    f = saturate3(sCurve(f, -0.1), 0.82);
  } else if (uFilm == 6) {
    f.r = sCurve(vec3(c.r), 0.6).r;
    f.g = c.g * 0.95 + 0.04;
    f.b = mix(0.12, 0.85, c.b);
    f = mix(vec3(0.08, 0.02, 0.1), vec3(1.0, 0.97, 0.75), f);
    f = saturate3(f, 1.1);
  } else if (uFilm == 7) {
    float m = dot(c, vec3(0.3, 0.59, 0.11));
    f = mix(vec3(0.06), vec3(0.95), sCurve(vec3(m), 0.35));
  } else if (uFilm == 8) {
    float m = dot(c, vec3(0.45, 0.45, 0.1));
    f = sCurve(sCurve(vec3(m), 0.7), 0.3);
  }
  return mix(c, clamp(f, 0.0, 1.0), uFilmAmt);
}

// Where the color correction applies (1 inside the mask)
float gradeMask(vec2 uv) {
  if (uMask == 0) return 1.0;
  float aspect = uRes.x / uRes.y;
  float soft = 0.05 + uMaskFeather * 0.6;
  float m = 1.0;
  if (uMask == 1) {
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
    m = 1.0 - smoothstep(0.35 - soft * 0.5, 0.35 + soft * 0.5, length(d) / max(aspect, 1.0) * 1.2);
  } else if (uMask == 2) {
    m = smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, uv.y);
  } else {
    m = 1.0 - smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, uv.y);
  }
  return mix(m, 1.0 - m, uMaskInvert);
}

// Three-way wheels, tone, vibrance, printer lights and print toning
vec3 primary(vec3 c) {
  c = clamp(c * uGain + uLift * (1.0 - c), 0.0, 1.0);
  c = pow(max(c, 0.0), 1.0 / uGamma);
  float l = luma(c);
  c += uShadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, l));
  c += uHighlights * 0.25 * smoothstep(0.5, 1.0, l);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = saturate3(c, 1.0 + uVibrance * (1.0 - sat));
  c *= pow(vec3(2.0), -vec3(uCmy.x, uCmy.y, uCmy.z) * 0.35);
  l = luma(c);
  float ws = 1.0 - smoothstep(0.0, 0.45, l);
  float wh = smoothstep(0.55, 1.0, l);
  float wm = 1.0 - ws - wh;
  float warm = uToning.x * ws + uToning.y * wm + uToning.z * wh;
  c += vec3(0.06, 0.01, -0.06) * warm;
  if (uCompress > 0.0) {
    float k = 1.0 - uCompress * 0.4;
    c = mix(c, k + (1.0 - k) * (1.0 - exp(-(c - k) / max(1.0 - k, 0.01))), step(k, c));
  }
  return clamp(c, 0.0, 1.0);
}

vec3 grade(vec3 c) {
  float l = luma(c);
  vec3 g = c;
  if (uGrade == 1) {
    // Teal shadows, orange highlights, brightness kept
    vec3 tone = mix(vec3(0.0, 0.42, 0.5), vec3(1.0, 0.6, 0.32), smoothstep(0.15, 0.85, l));
    g = keepLuma(softLight(c, tone), l);
    g = saturate3(sCurve(g, 0.25), 1.12);
  } else if (uGrade == 2) {
    // Bleach bypass: the picture overlaid with its own luminance
    vec3 b = vec3(l);
    float k = clamp(10.0 * (l - 0.45), 0.0, 1.0);
    g = mix(2.0 * c * b, 1.0 - 2.0 * (1.0 - b) * (1.0 - c), k);
    g = saturate3(g, 0.55);
  } else if (uGrade == 3) {
    // Faded film: soft S-curve, lifted blacks, rolled-off whites, warm top and cool bottom
    g = sCurve(c, 0.35);
    g = mix(vec3(0.09, 0.08, 0.11), vec3(0.95, 0.92, 0.85), g);
    g = saturate3(g, 0.82);
  } else if (uGrade == 4) {
    vec3 tone = mix(uShadowTint, uHighTint, smoothstep(0.2, 0.8, l));
    g = keepLuma(softLight(c, tone), l);
  } else if (uGrade == 5) {
    // Black and white through a light red filter, hard contrast
    float m = dot(c, vec3(0.42, 0.46, 0.12));
    g = sCurve(sCurve(vec3(m), 0.8), 0.4);
  }
  return mix(c, g, uGradeAmt);
}

vec2 geom(vec2 uv) {
  // Kaleidoscope: the right half mirrors the left, and from halfway up the bottom mirrors the top
  if (uKaleido > 0.0) {
    vec2 m = vec2(0.5) - abs(uv - 0.5);
    uv.x = m.x;
    if (uKaleido >= 0.5) uv.y = m.y;
  }
  uv = (uv - 0.5) / (1.0 + length(uWeave) * 4.0) + 0.5 + uWeave;
  if (uPixel > 0.0) {
    vec2 cells = uRes / (2.0 + uPixel * 22.0);
    uv = (floor(uv * cells) + 0.5) / cells;
  }
  return clamp(uv, 0.0, 1.0);
}

void main() {
  vec2 uv = geom(vUv);
  vec2 px = 1.0 / uRes;
  float aspect = uRes.x / uRes.y;

  vec3 c;
  if (uChroma > 0.0) {
    vec2 d = (uv - 0.5) * uChroma * 0.014;
    c = vec3(texture2D(uSrc, uv + d).r, texture2D(uSrc, uv).g, texture2D(uSrc, uv - d).b);
  } else {
    c = texture2D(uSrc, uv).rgb;
  }

  if (uSharpen > 0.0) {
    vec3 n = texture2D(uSrc, uv + vec2(0.0, px.y)).rgb + texture2D(uSrc, uv - vec2(0.0, px.y)).rgb
      + texture2D(uSrc, uv + vec2(px.x, 0.0)).rgb + texture2D(uSrc, uv - vec2(px.x, 0.0)).rgb;
    c = clamp(c + (4.0 * c - n) * uSharpen * 0.5, 0.0, 1.0);
  }

  vec3 blur = texture2D(uBlur, uv).rgb;
  if (uMist > 0.0) {
    vec3 screen = 1.0 - (1.0 - c) * (1.0 - blur * 0.7);
    c = mix(c, screen, uMist * 0.6);
    c = mix(c, vec3(luma(c)), uMist * 0.08) * (1.0 - uMist * 0.06) + uMist * 0.03;
  }
  if (uBloom > 0.0) c += max(blur - 0.6, 0.0) / 0.4 * uBloom * 0.75;
  if (uHalation > 0.0) c += vec3(1.0, 0.28, 0.1) * smoothstep(0.55, 1.0, luma(blur)) * uHalation * 0.7;

  if (uEdges > 0.0) {
    float gx = luma(texture2D(uSrc, uv + vec2(px.x, 0.0)).rgb) - luma(texture2D(uSrc, uv - vec2(px.x, 0.0)).rgb);
    float gy = luma(texture2D(uSrc, uv + vec2(0.0, px.y)).rgb) - luma(texture2D(uSrc, uv - vec2(0.0, px.y)).rgb);
    float e = clamp(length(vec2(gx, gy)) * 4.0, 0.0, 1.0);
    c = mix(c, c * (1.0 - uEdges * 0.6) + e * (0.4 + c) * uEdges * 1.5, uEdges);
  }

  // Basic correction (with the film's frame-to-frame flicker)
  c *= pow(2.0, uExposure * 1.5 + uBreath + uPush * 0.6);
  c.r += uTemp * 0.08;
  c.b -= uTemp * 0.08;
  c.g -= uTint * 0.06;
  c = clamp(c, 0.0, 1.0);
  c = clamp((c - 0.45) * (1.0 + uContrast * 0.6) + 0.45, 0.0, 1.0);
  c = clamp(saturate3(c, 1.0 + uSaturation), 0.0, 1.0);
  if (uPush != 0.0) c = clamp(saturate3(sCurve(c, uPush * 0.25), 1.0 + uPush * 0.1), 0.0, 1.0);

  c = film(c);
  vec3 before = c;
  c = grade(primary(c));
  c = mix(before, c, gradeMask(vUv));

  if (uLeak > 0.0) {
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec2 a = vec2((0.08 + 0.12 * sin(uTime * 0.31)) * aspect, 0.8 + 0.12 * sin(uTime * 0.23));
    vec2 b = vec2((0.95 + 0.06 * cos(uTime * 0.19)) * aspect, 0.15 + 0.2 * sin(uTime * 0.27 + 1.3));
    vec3 leak = vec3(1.0, 0.45, 0.15) * exp(-dot(p - a, p - a) * 3.5)
      + vec3(1.0, 0.3, 0.45) * exp(-dot(p - b, p - b) * 5.0) * (0.6 + 0.4 * sin(uTime * 0.5));
    c = 1.0 - (1.0 - c) * (1.0 - clamp(leak * uLeak * 0.85, 0.0, 1.0));
  }

  if (uVignette > 0.0) {
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0) / sqrt(aspect * aspect + 1.0) * 2.0;
    float v = smoothstep(1.05, 0.3, length(d));
    c *= mix(1.0, v, uVignette * 0.9);
  }

  if (uScan > 0.0) {
    float s = 0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159 / 1.5);
    float roll = smoothstep(0.0, 0.08, abs(fract(uv.y - uTime * 0.12) - 0.5) - 0.42);
    c *= 1.0 - uScan * (0.32 * (1.0 - s) + 0.06 * (1.0 - roll));
  }

  if (uPoster > 0.0) {
    float levels = mix(12.0, 3.0, uPoster);
    c = floor(c * levels + 0.5) / levels;
  }
  if (uTwoTone > 0.0) {
    float t2 = smoothstep(0.42, 0.58, luma(c));
    c = mix(c, mix(uShadowTint * 0.6, uHighTint, t2), uTwoTone);
  }
  if (uHalftone > 0.0) {
    float cell = 4.0 + uHalftone * 6.0;
    vec2 p = vUv * uRes;
    vec2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
    vec2 g = fract(rot / cell) - 0.5;
    float r = sqrt(1.0 - luma(c)) * 0.7;
    float dotMask = smoothstep(r + 0.06, r - 0.06, length(g));
    c = mix(c, mix(c * 1.1 + 0.08, c * 0.15, dotMask), uHalftone);
  }

  if (uGrain > 0.0) {
    float frame = floor(uTime * 24.0);
    float n = hash(floor(vUv * uRes / uGrainSize) + vec2(frame * 17.0, frame * 31.0)) - 0.5;
    c += n * uGrain * 0.2 * (1.0 - 0.5 * luma(c));
  }

  if (uDust > 0.0) {
    float frame = floor(uTime * 12.0);
    vec2 grid = vec2(28.0 * aspect, 28.0);
    vec2 cell = floor(uv * grid);
    float h = hash(cell + frame * 7.31);
    if (h > 1.0 - 0.012 * uDust) {
      vec2 spot = (cell + 0.2 + 0.6 * vec2(hash(cell + 3.1 + frame), hash(cell + 5.7 + frame))) / grid;
      float r = (0.6 + 1.6 * hash(cell + 9.2)) / uRes.y * 2.5;
      float dd = length((uv - spot) * vec2(aspect, 1.0));
      float dot1 = 1.0 - smoothstep(r * 0.4, r, dd);
      c = mix(c, h > 1.0 - 0.004 * uDust ? vec3(0.95) : vec3(0.05), dot1 * 0.8);
    }
    // One thin scratch now and then
    float sx = hash(vec2(frame, 1.7));
    if (hash(vec2(frame, 4.2)) < 0.35 * uDust) {
      float w = abs(uv.x - sx) * uRes.x;
      c = mix(c, vec3(0.9), (1.0 - smoothstep(0.4, 1.4, w)) * 0.35 * uDust);
    }
  }

  if (uGate > 0.0) {
    // A film frame: rounded black edge and sprocket holes running past on both sides
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    vec2 hb = vec2(aspect * 0.5 - 0.06 * aspect, 0.47);
    vec2 q = abs(p) - hb + 0.04;
    float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;
    float edge = smoothstep(-0.004, 0.004, box);
    float side = smoothstep(hb.x + 0.005, hb.x + 0.01, abs(p.x));
    float y = fract(vUv.y * 6.0);
    vec2 hole = vec2(abs(abs(p.x) - (hb.x + 0.035 * aspect)), abs(y - 0.5) / 6.0);
    float holes = side * (1.0 - smoothstep(0.012, 0.016, max(hole.x - 0.01, hole.y - 0.025)));
    c = mix(c, vec3(0.02), edge * uGate);
    c = mix(c, vec3(0.85, 0.82, 0.75), holes * uGate);
  }

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

type GL = WebGLRenderingContext;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

interface Pipeline {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  gl: GL;
  quad: WebGLBuffer;
  down: WebGLProgram;
  blur: WebGLProgram;
  final: WebGLProgram;
  src: WebGLTexture;
  black: WebGLTexture;
  a: Target | null;
  b: Target | null;
  uniforms: Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>;
}

/** undefined = not tried yet, null = WebGL unavailable here. */
let pipeline: Pipeline | null | undefined;
let warned = false;

function compile(gl: GL, vs: string, fs: string): WebGLProgram {
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
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  return prog;
}

function texture(gl: GL): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createPipeline(): Pipeline | null {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
  if (!canvas) return null;
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  }) as GL | null;
  if (!gl) return null;
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const black = texture(gl);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );
  return {
    canvas,
    gl,
    quad,
    down: compile(gl, VERT, DOWN_FRAG),
    blur: compile(gl, VERT, BLUR_FRAG),
    final: compile(gl, VERT, FINAL_FRAG),
    src: texture(gl),
    black,
    a: null,
    b: null,
    uniforms: new Map(),
  };
}

function getPipeline(): Pipeline | null {
  if (pipeline && pipeline.gl.isContextLost()) pipeline = undefined;
  if (pipeline === undefined) {
    try {
      pipeline = createPipeline();
    } catch (e) {
      pipeline = null;
      if (!warned) console.warn("[finish] WebGL filter pass unavailable", e);
      warned = true;
    }
  }
  return pipeline;
}

function target(p: Pipeline, old: Target | null, w: number, h: number): Target {
  if (old && old.w === w && old.h === h) return old;
  const { gl } = p;
  if (old) {
    gl.deleteTexture(old.tex);
    gl.deleteFramebuffer(old.fbo);
  }
  const tex = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

function loc(p: Pipeline, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
  let m = p.uniforms.get(prog);
  if (!m) p.uniforms.set(prog, (m = new Map()));
  if (!m.has(name)) m.set(name, p.gl.getUniformLocation(prog, name));
  return m.get(name) ?? null;
}

function draw(p: Pipeline, prog: WebGLProgram, out: Target | null, w: number, h: number) {
  const { gl } = p;
  gl.useProgram(prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
  gl.viewport(0, 0, w, h);
  gl.bindBuffer(gl.ARRAY_BUFFER, p.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function bind(gl: GL, unit: number, tex: WebGLTexture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}

/** Grades and filters what is already drawn on ctx's canvas, in device pixels. */
export function applyFinish(ctx: Ctx2D, finish: FinishSettings, timeSec: number): void {
  if (isNeutralFinish(finish)) return;
  const source = ctx.canvas;
  const W = source.width;
  const H = source.height;
  if (W < 2 || H < 2) return;
  const p = getPipeline();
  if (!p) return;
  const { gl } = p;
  if (p.canvas.width !== W) p.canvas.width = W;
  if (p.canvas.height !== H) p.canvas.height = H;

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  bind(gl, 0, p.src);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  let blurTex = p.black;
  if (needsBlur(finish)) {
    const w = Math.max(1, Math.ceil(W / 4));
    const h = Math.max(1, Math.ceil(H / 4));
    p.a = target(p, p.a, w, h);
    p.b = target(p, p.b, w, h);
    bind(gl, 0, p.src);
    gl.useProgram(p.down);
    gl.uniform1i(loc(p, p.down, "uTex"), 0);
    gl.uniform2f(loc(p, p.down, "uTexel"), 1 / W, 1 / H);
    draw(p, p.down, p.a, w, h);
    gl.useProgram(p.blur);
    gl.uniform1i(loc(p, p.blur, "uTex"), 0);
    for (let i = 0; i < 2; i++) {
      bind(gl, 0, p.a.tex);
      gl.useProgram(p.blur);
      gl.uniform2f(loc(p, p.blur, "uDir"), (1.5 + i) / w, 0);
      draw(p, p.blur, p.b, w, h);
      bind(gl, 0, p.b.tex);
      gl.useProgram(p.blur);
      gl.uniform2f(loc(p, p.blur, "uDir"), 0, (1.5 + i) / h);
      draw(p, p.blur, p.a, w, h);
    }
    blurTex = p.a.tex;
  }

  const u = finishUniforms(finish);
  const prog = p.final;
  gl.useProgram(prog);
  bind(gl, 0, p.src);
  bind(gl, 1, blurTex);
  gl.uniform1i(loc(p, prog, "uSrc"), 0);
  gl.uniform1i(loc(p, prog, "uBlur"), 1);
  gl.uniform2f(loc(p, prog, "uRes"), W, H);
  gl.uniform1f(loc(p, prog, "uTime"), timeSec);
  gl.uniform1f(loc(p, prog, "uExposure"), u.basic.exposure);
  gl.uniform1f(loc(p, prog, "uContrast"), u.basic.contrast);
  gl.uniform1f(loc(p, prog, "uSaturation"), u.basic.saturation);
  gl.uniform1f(loc(p, prog, "uTemp"), u.basic.temperature);
  gl.uniform1f(loc(p, prog, "uTint"), u.basic.tint);
  gl.uniform1i(loc(p, prog, "uGrade"), u.grade);
  gl.uniform1f(loc(p, prog, "uGradeAmt"), u.gradeAmount);
  gl.uniform3fv(loc(p, prog, "uShadowTint"), u.shadowTint);
  gl.uniform3fv(loc(p, prog, "uHighTint"), u.highlightTint);
  gl.uniform1f(loc(p, prog, "uVignette"), u.filters.vignette);
  gl.uniform1f(loc(p, prog, "uGrain"), u.filters.grain);
  gl.uniform1f(loc(p, prog, "uBloom"), u.filters.bloom);
  gl.uniform1f(loc(p, prog, "uHalation"), u.filters.halation);
  gl.uniform1f(loc(p, prog, "uChroma"), u.filters.chromatic);
  gl.uniform1f(loc(p, prog, "uLeak"), u.filters.lightLeak);
  gl.uniform1f(loc(p, prog, "uMist"), u.filters.mist);
  gl.uniform1f(loc(p, prog, "uSharpen"), u.filters.sharpen);
  gl.uniform1f(loc(p, prog, "uScan"), u.filters.scanlines);
  gl.uniform1f(loc(p, prog, "uDust"), u.filters.dust);
  gl.uniform1f(loc(p, prog, "uPoster"), u.filters.posterize);
  gl.uniform1f(loc(p, prog, "uPixel"), u.filters.pixelate);
  gl.uniform1f(loc(p, prog, "uEdges"), u.filters.edges);
  gl.uniform1f(loc(p, prog, "uHalftone"), u.filters.halftone);
  gl.uniform1f(loc(p, prog, "uTwoTone"), u.filters.twoTone);
  gl.uniform1f(loc(p, prog, "uKaleido"), u.filters.kaleido);
  gl.uniform1f(loc(p, prog, "uGate"), u.filters.gate);
  gl.uniform3fv(loc(p, prog, "uLift"), u.lift);
  gl.uniform3fv(loc(p, prog, "uGamma"), u.gamma);
  gl.uniform3fv(loc(p, prog, "uGain"), u.gain);
  gl.uniform1f(loc(p, prog, "uShadows"), u.shadows);
  gl.uniform1f(loc(p, prog, "uHighlights"), u.highlights);
  gl.uniform1f(loc(p, prog, "uVibrance"), u.vibrance);
  gl.uniform1i(loc(p, prog, "uMask"), u.mask);
  gl.uniform1f(loc(p, prog, "uMaskFeather"), u.maskFeather);
  gl.uniform1f(loc(p, prog, "uMaskInvert"), u.maskInvert);
  gl.uniform1i(loc(p, prog, "uFilm"), u.film);
  gl.uniform1f(loc(p, prog, "uFilmAmt"), u.filmAmount);
  gl.uniform1f(loc(p, prog, "uPush"), u.push);
  gl.uniform3fv(loc(p, prog, "uCmy"), u.cmy);
  gl.uniform3fv(loc(p, prog, "uToning"), u.toning);
  gl.uniform1f(loc(p, prog, "uCompress"), u.compression);
  gl.uniform1f(loc(p, prog, "uGrainSize"), u.grainSize);
  const motion = filmMotion(finish, timeSec);
  gl.uniform2f(loc(p, prog, "uWeave"), motion.weave[0], motion.weave[1]);
  gl.uniform1f(loc(p, prog, "uBreath"), motion.breath);
  draw(p, prog, null, W, H);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "copy";
  ctx.filter = "none";
  ctx.drawImage(p.canvas, 0, 0);
  ctx.restore();
}
