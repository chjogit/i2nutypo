/**
 * Web Audio analyser attached to the song's <audio> element, used for beat
 * energy. createMediaElementSource can be called once per element, so the
 * graph is cached per element and must be created from a user gesture.
 */
interface AudioGraph {
  context: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
}

const graphs = new WeakMap<HTMLAudioElement, AudioGraph>();

export async function ensureAudioGraph(el: HTMLAudioElement): Promise<void> {
  let graph = graphs.get(el);
  if (!graph) {
    const context = new AudioContext();
    const source = context.createMediaElementSource(el);
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    analyser.connect(context.destination);
    graph = { context, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    graphs.set(el, graph);
  }
  if (graph.context.state === "suspended") await graph.context.resume();
}

export async function closeAudioGraph(el: HTMLAudioElement): Promise<void> {
  const graph = graphs.get(el);
  graphs.delete(el);
  await graph?.context.close();
}

/** Bass energy 0..1 from the analyser, or null when there is no graph or no signal. */
export function readBassEnergy(el: HTMLAudioElement | null, beatReact: number): number | null {
  const graph = el ? graphs.get(el) : undefined;
  if (!graph) return null;
  graph.analyser.getByteFrequencyData(graph.data);
  let bassSum = 0;
  for (let i = 0; i < 10; i++) bassSum += graph.data[i];
  const normBass = bassSum / (10 * 255);
  return normBass > 0.05 ? Math.min(1, normBass * (beatReact / 80)) : null;
}
