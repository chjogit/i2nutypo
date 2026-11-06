import { describe, expect, it } from "vitest";
import { scaleFilterLengths, transformScale } from "../logical-blur";

const ctxWith = (a: number, b: number, c: number, d: number) => ({
  getTransform: () => ({ a, b, c, d }) as DOMMatrix,
});

describe("logical blur", () => {
  it("reads the scale of the transform", () => {
    expect(transformScale(ctxWith(1, 0, 0, 1))).toBe(1);
    expect(transformScale(ctxWith(3, 0, 0, 3))).toBe(3);
    // Rotated by 90° at scale 2
    expect(transformScale(ctxWith(0, 2, -2, 0))).toBe(2);
  });

  it("scales blur and drop-shadow lengths and nothing else", () => {
    expect(scaleFilterLengths("blur(4px) brightness(0.8)", 3)).toBe("blur(12.00px) brightness(0.8)");
    expect(scaleFilterLengths("drop-shadow(2px 4px 6px #000)", 0.5)).toBe(
      "drop-shadow(1.00px 2.00px 3.00px #000)",
    );
    expect(scaleFilterLengths("saturate(0.6)", 2)).toBe("saturate(0.6)");
    expect(scaleFilterLengths("blur(4px)", 1)).toBe("blur(4px)");
    expect(scaleFilterLengths("none", 2)).toBe("none");
  });
});
