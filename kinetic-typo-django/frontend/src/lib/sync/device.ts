export type Accelerator = "webgpu" | "cpu";

interface GpuLike {
  requestAdapter(): Promise<unknown | null>;
}

/** Whether Whisper can run on the GPU here. Without WebGPU it falls back to CPU (WASM), which is several times slower. */
export async function detectAccelerator(): Promise<Accelerator> {
  const gpu = (globalThis.navigator as (Navigator & { gpu?: GpuLike }) | undefined)?.gpu;
  if (!gpu) return "cpu";
  const adapter = await gpu.requestAdapter().catch(() => null);
  return adapter ? "webgpu" : "cpu";
}
