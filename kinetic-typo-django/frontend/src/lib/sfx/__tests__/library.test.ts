import { describe, expect, it } from "vitest";
import { makeSfxClip, sanitizeSfx, SFX, SFX_GROUPS } from "../library";

describe("sound effects", () => {
  it("has unique ids, each in a known group", () => {
    expect(new Set(SFX.map((s) => s.id)).size).toBe(SFX.length);
    for (const s of SFX) expect(SFX_GROUPS).toContain(s.group);
  });

  it("keeps a new clip inside the song", () => {
    const c = makeSfxClip(SFX[0].id, 59.95, 1, 60);
    expect(c.end).toBeLessThanOrEqual(60);
    expect(c.start).toBeLessThan(c.end);
  });

  it("keeps saved built-in sounds only", () => {
    const out = sanitizeSfx([
      { sound: SFX[0].id, start: 1, end: 2, gain: 3 },
      { sound: "user:abc", start: 1, end: 2 },
      { sound: SFX[0].id, start: 2, end: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].gain).toBe(1.5);
  });
});
