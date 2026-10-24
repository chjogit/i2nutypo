import type { SfxClip } from "@/types/project";
import { newId, sortClips } from "@/lib/props/clips";
import { mulberry32 } from "@/lib/random";

// Sound effects made in the browser (Web Audio synthesis), so the library is
// free to use anywhere and nothing is downloaded. Each one renders once into
// an AudioBuffer, then plays from the timeline and goes into exported videos.

export type SfxGroup = "휙" | "임팩트" | "라이저" | "디지털" | "반짝" | "분위기";

export interface SfxDef {
  id: string;
  label: string;
  group: SfxGroup;
  /** Length in seconds. */
  len: number;
  /** Builds the sound into an offline context of `len` seconds. */
  build: (ctx: OfflineAudioContext) => void;
}

const SR = 44100;

function noise(ctx: BaseAudioContext, len: number, seed: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(len * ctx.sampleRate)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rand = mulberry32(seed);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return buf;
}

function noiseSource(ctx: OfflineAudioContext, len: number, seed = 7): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, len, seed);
  return src;
}

/** Gain with an attack-hold-release shape. */
function env(ctx: OfflineAudioContext, points: ReadonlyArray<readonly [number, number]>): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(points[0][1], points[0][0]);
  for (const [t, v] of points.slice(1)) g.gain.linearRampToValueAtTime(v, t);
  return g;
}

function osc(ctx: OfflineAudioContext, type: OscillatorType, f0: number, f1: number, t1: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, 0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), Math.max(0.01, t1));
  return o;
}

function filt(ctx: OfflineAudioContext, type: BiquadFilterType, f0: number, f1: number, t1: number, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, 0);
  f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), Math.max(0.01, t1));
  return f;
}

function chain(ctx: OfflineAudioContext, ...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(ctx.destination);
}

function whoosh(len: number, f0: number, fPeak: number, f1: number, seed: number) {
  return (ctx: OfflineAudioContext) => {
    const n = noiseSource(ctx, len, seed);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(f0, 0);
    bp.frequency.exponentialRampToValueAtTime(fPeak, len * 0.55);
    bp.frequency.exponentialRampToValueAtTime(f1, len);
    const g = env(ctx, [
      [0, 0],
      [len * 0.55, 0.9],
      [len, 0],
    ]);
    chain(ctx, n, bp, g);
    n.start(0);
  };
}

function boom(len: number, f0: number, f1: number, level: number) {
  return (ctx: OfflineAudioContext) => {
    const o = osc(ctx, "sine", f0, f1, len * 0.7);
    const g = env(ctx, [
      [0, 0],
      [0.008, level],
      [len, 0],
    ]);
    chain(ctx, o, g);
    o.start(0);
    const n = noiseSource(ctx, 0.3, 3);
    const lp = filt(ctx, "lowpass", 2400, 200, 0.25);
    const ng = env(ctx, [
      [0, level * 0.7],
      [0.25, 0],
    ]);
    chain(ctx, n, lp, ng);
    n.start(0);
  };
}

export const SFX: readonly SfxDef[] = [
  { id: "whoosh_soft", label: "부드러운 휙", group: "휙", len: 0.7, build: whoosh(0.7, 300, 2200, 500, 11) },
  { id: "whoosh_fast", label: "빠른 휙", group: "휙", len: 0.35, build: whoosh(0.35, 900, 5200, 1500, 12) },
  { id: "whoosh_low", label: "낮은 휙", group: "휙", len: 0.9, build: whoosh(0.9, 120, 900, 160, 13) },
  {
    id: "swish_reverse",
    label: "빨려 드는 소리",
    group: "휙",
    len: 1.2,
    build: (ctx) => {
      const n = noiseSource(ctx, 1.2, 14);
      const hp = filt(ctx, "highpass", 200, 6000, 1.15, 0.7);
      const g = env(ctx, [
        [0, 0],
        [1.12, 0.9],
        [1.2, 0],
      ]);
      chain(ctx, n, hp, g);
      n.start(0);
    },
  },
  { id: "impact_boom", label: "쿵 (저음)", group: "임팩트", len: 1.6, build: boom(1.6, 90, 32, 1) },
  { id: "hit_punch", label: "펀치", group: "임팩트", len: 0.35, build: boom(0.35, 180, 55, 0.9) },
  {
    id: "cinematic_hit",
    label: "시네마틱 히트",
    group: "임팩트",
    len: 2.4,
    build: (ctx) => {
      boom(2.4, 70, 28, 1)(ctx);
      for (const [f, d] of [
        [220, 0],
        [331, 7],
        [467, -9],
        [612, 4],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        o.detune.value = d;
        const bp = filt(ctx, "bandpass", 1800, 700, 2, 2);
        const g = env(ctx, [
          [0, 0],
          [0.01, 0.06],
          [2.3, 0],
        ]);
        chain(ctx, o, bp, g);
        o.start(0);
      }
    },
  },
  { id: "bass_drop", label: "베이스 드롭", group: "임팩트", len: 1.4, build: boom(1.4, 160, 30, 1) },
  {
    id: "riser",
    label: "올라가는 라이저",
    group: "라이저",
    len: 2,
    build: (ctx) => {
      const o = osc(ctx, "sawtooth", 180, 1400, 1.95);
      const lp = filt(ctx, "lowpass", 600, 7000, 1.95);
      const g = env(ctx, [
        [0, 0],
        [1.9, 0.35],
        [2, 0],
      ]);
      chain(ctx, o, lp, g);
      o.start(0);
      const n = noiseSource(ctx, 2, 21);
      const hp = filt(ctx, "highpass", 500, 8000, 1.95);
      const ng = env(ctx, [
        [0, 0],
        [1.9, 0.5],
        [2, 0],
      ]);
      chain(ctx, n, hp, ng);
      n.start(0);
    },
  },
  {
    id: "downer",
    label: "내려가는 소리",
    group: "라이저",
    len: 1,
    build: (ctx) => {
      const o = osc(ctx, "sine", 900, 70, 0.95);
      const g = env(ctx, [
        [0, 0],
        [0.02, 0.6],
        [1, 0],
      ]);
      chain(ctx, o, g);
      o.start(0);
    },
  },
  {
    id: "tape_stop",
    label: "테이프 멈춤",
    group: "라이저",
    len: 0.8,
    build: (ctx) => {
      for (const f of [220, 277, 330]) {
        const o = osc(ctx, "sawtooth", f, 8, 0.78);
        const lp = filt(ctx, "lowpass", 3000, 200, 0.78);
        const g = env(ctx, [
          [0, 0.18],
          [0.8, 0],
        ]);
        chain(ctx, o, lp, g);
        o.start(0);
      }
    },
  },
  {
    id: "glitch_buzz",
    label: "글리치 지직",
    group: "디지털",
    len: 0.45,
    build: (ctx) => {
      const rand = mulberry32(31);
      const o = ctx.createOscillator();
      o.type = "square";
      const g = ctx.createGain();
      for (let t = 0; t < 0.45; t += 0.03) {
        o.frequency.setValueAtTime(60 + rand() * 900, t);
        g.gain.setValueAtTime(rand() > 0.35 ? 0.25 : 0, t);
      }
      g.gain.setValueAtTime(0, 0.44);
      chain(ctx, o, g);
      o.start(0);
    },
  },
  {
    id: "digital_blip",
    label: "디지털 삑",
    group: "디지털",
    len: 0.3,
    build: (ctx) => {
      for (const [f, at] of [
        [1300, 0],
        [1950, 0.09],
      ] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = env(ctx, [
          [at, 0],
          [at + 0.005, 0.35],
          [at + 0.12, 0],
        ]);
        chain(ctx, o, g);
        o.start(at);
      }
    },
  },
  {
    id: "click_pop",
    label: "톡 (팝)",
    group: "디지털",
    len: 0.12,
    build: (ctx) => {
      const o = osc(ctx, "sine", 1100, 300, 0.1);
      const g = env(ctx, [
        [0, 0],
        [0.003, 0.7],
        [0.11, 0],
      ]);
      chain(ctx, o, g);
      o.start(0);
    },
  },
  {
    id: "shutter",
    label: "카메라 셔터",
    group: "디지털",
    len: 0.2,
    build: (ctx) => {
      for (const at of [0, 0.07]) {
        const n = noiseSource(ctx, 0.05, 41 + at * 100);
        const bp = filt(ctx, "bandpass", 3500, 2500, 0.05, 3);
        const g = env(ctx, [
          [at, 0],
          [at + 0.002, 0.8],
          [at + 0.045, 0],
        ]);
        chain(ctx, n, bp, g);
        n.start(at);
      }
    },
  },
  {
    id: "sparkle",
    label: "반짝반짝",
    group: "반짝",
    len: 1.2,
    build: (ctx) => {
      const rand = mulberry32(51);
      for (let i = 0; i < 9; i++) {
        const at = rand() * 0.7;
        const o = ctx.createOscillator();
        o.frequency.value = 2200 + rand() * 3200;
        const g = env(ctx, [
          [at, 0],
          [at + 0.004, 0.12],
          [at + 0.35, 0],
        ]);
        chain(ctx, o, g);
        o.start(at);
      }
    },
  },
  {
    id: "chime",
    label: "차임벨",
    group: "반짝",
    len: 2.2,
    build: (ctx) => {
      for (const [ratio, level] of [
        [1, 0.3],
        [2.76, 0.12],
        [5.4, 0.06],
      ] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = 880 * ratio;
        const g = env(ctx, [
          [0, 0],
          [0.005, level],
          [2.1, 0],
        ]);
        chain(ctx, o, g);
        o.start(0);
      }
    },
  },
  {
    id: "heartbeat",
    label: "심장 박동",
    group: "분위기",
    len: 0.9,
    build: (ctx) => {
      for (const at of [0, 0.28]) {
        const o = osc(ctx, "sine", 110, 40, at + 0.18);
        const g = env(ctx, [
          [at, 0],
          [at + 0.01, at === 0 ? 0.9 : 0.6],
          [at + 0.22, 0],
        ]);
        chain(ctx, o, g);
        o.start(at);
      }
    },
  },
  {
    id: "wind",
    label: "바람",
    group: "분위기",
    len: 3,
    build: (ctx) => {
      const n = noiseSource(ctx, 3, 61);
      const lp = ctx.createBiquadFilter();
      lp.type = "bandpass";
      lp.Q.value = 0.8;
      for (let t = 0; t <= 3; t += 0.5)
        lp.frequency.linearRampToValueAtTime(300 + Math.sin(t * 2.1) * 220 + 260, t);
      const g = env(ctx, [
        [0, 0],
        [0.8, 0.5],
        [2.2, 0.45],
        [3, 0],
      ]);
      chain(ctx, n, lp, g);
      n.start(0);
    },
  },
];

export const SFX_BY_ID = new Map(SFX.map((s) => [s.id, s]));

export const SFX_GROUPS: readonly SfxGroup[] = ["휙", "임팩트", "라이저", "디지털", "반짝", "분위기"];

const rendered = new Map<string, Promise<AudioBuffer>>();

/** The built-in sound as an AudioBuffer (rendered on first use, then cached). */
export function sfxBuffer(id: string): Promise<AudioBuffer> | null {
  const def = SFX_BY_ID.get(id);
  if (!def || typeof OfflineAudioContext === "undefined") return null;
  let p = rendered.get(id);
  if (!p) {
    const ctx = new OfflineAudioContext(1, Math.ceil(def.len * SR), SR);
    def.build(ctx);
    p = ctx.startRendering();
    rendered.set(id, p);
  }
  return p;
}

const userBuffers = new Map<string, Promise<AudioBuffer>>();

/** A user's sound file decoded (cached by its id). */
export function userSoundBuffer(id: string, objectUrl: string): Promise<AudioBuffer> {
  let p = userBuffers.get(id);
  if (!p) {
    p = (async () => {
      const data = await (await fetch(objectUrl)).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, SR);
      return ctx.decodeAudioData(data);
    })();
    userBuffers.set(id, p);
  }
  return p;
}

export const forgetUserSound = (id: string) => userBuffers.delete(id);

/** Length of a sound in seconds, or null when it is unknown. */
export function soundLength(
  sound: string,
  users: ReadonlyArray<{ id: string; duration: number }>,
): number | null {
  if (sound.startsWith("user:")) return users.find((u) => `user:${u.id}` === sound)?.duration ?? null;
  return SFX_BY_ID.get(sound)?.len ?? null;
}

export function soundLabel(sound: string, users: ReadonlyArray<{ id: string; fileName: string }>): string {
  if (sound.startsWith("user:")) return users.find((u) => `user:${u.id}` === sound)?.fileName ?? "내 소리";
  return SFX_BY_ID.get(sound)?.label ?? sound;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function makeSfxClip(sound: string, at: number, len: number, duration: number): SfxClip {
  const start = round2(Math.max(0, Math.min(at, Math.max(0, duration - 0.1))));
  return { id: newId("sfx"), start, end: round2(Math.min(duration, start + len)), sound, gain: 1 };
}

/** Saved clips of built-in sounds (a user's own sounds do not outlive the page). */
export function sanitizeSfx(raw: unknown): SfxClip[] {
  if (!Array.isArray(raw)) return [];
  const out: SfxClip[] = [];
  for (const r of raw as Array<Partial<SfxClip>>) {
    if (!r || typeof r !== "object" || typeof r.sound !== "string" || !SFX_BY_ID.has(r.sound)) continue;
    const start = typeof r.start === "number" && Number.isFinite(r.start) ? Math.max(0, r.start) : NaN;
    const end = typeof r.end === "number" && Number.isFinite(r.end) ? r.end : NaN;
    if (!(end > start)) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : newId("sfx"),
      start,
      end,
      sound: r.sound,
      gain: typeof r.gain === "number" && Number.isFinite(r.gain) ? Math.min(1.5, Math.max(0, r.gain)) : 1,
    });
  }
  return sortClips(out);
}
