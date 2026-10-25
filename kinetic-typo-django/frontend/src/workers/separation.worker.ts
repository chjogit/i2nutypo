/// <reference lib="webworker" />
import { runSeparation } from "@/lib/separation/run-separation";
import type { SeparateRequest, SeparateResponse } from "@/lib/separation/protocol";

// Separates the vocals from the song before recognition, one worker per job
// (terminated afterwards to free memory). The audio never leaves the device.

const post = (msg: SeparateResponse) => self.postMessage(msg);

self.onmessage = async (event: MessageEvent<SeparateRequest>) => {
  if (event.data.type !== "separate") return;
  try {
    await runSeparation(event.data, post);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
