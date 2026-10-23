import { describe, expect, it } from "vitest";
import { getLookPreset } from "@/lib/render/looks/presets";
import { BEGINNER_THEMES, featuresFor, MODE, parseMode, projectStorageKey } from "../mode";

describe("studio modes", () => {
  it("falls back to the full studio for anything unknown", () => {
    expect(parseMode("beginner")).toBe("beginner");
    expect(parseMode("basic")).toBe("basic");
    expect(parseMode(undefined)).toBe("pro");
    expect(parseMode("admin")).toBe("pro");
    // No DOM in tests
    expect(MODE).toBe("pro");
  });

  it("opens more with each step", () => {
    const order = (["beginner", "basic", "pro"] as const).map(featuresFor);
    for (const key of Object.keys(order[0]) as Array<keyof (typeof order)[0]>) {
      expect(order[0][key] <= order[1][key] && order[1][key] <= order[2][key]).toBe(true);
    }
    expect(Object.values(featuresFor("pro")).every(Boolean)).toBe(true);
    expect(Object.values(featuresFor("beginner")).some(Boolean)).toBe(false);
    expect(featuresFor("basic").subtitleFiles).toBe(true);
    expect(featuresFor("basic").characters).toBe(false);
  });

  it("keeps the full studio on its existing save and the others apart", () => {
    expect(projectStorageKey("pro")).toBe("kinetic-typo-project-v1");
    const keys = new Set((["beginner", "basic", "pro"] as const).map(projectStorageKey));
    expect(keys.size).toBe(3);
  });

  it("offers three real themes to beginners, the default first", () => {
    expect(BEGINNER_THEMES).toEqual(["album_jacket", "digital_crt", "flat_type"]);
    for (const id of BEGINNER_THEMES) expect(getLookPreset(id).id).toBe(id);
  });
});
