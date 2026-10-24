import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "../project-store";
import { usePropUiStore } from "../prop-ui-store";

describe("picking several effect clips", () => {
  beforeEach(() => {
    const s = useProjectStore.getState();
    s.setTransitions([]);
    usePropUiStore.getState().selectFx(null);
  });

  it("moves the picked clips together and keeps them inside the song", () => {
    const s = useProjectStore.getState();
    const a = s.addTransition("whip", 5);
    const b = s.addTransition("flash", 10);
    const c = s.addAdjust("zoom", 8, 9);
    expect(a && b && c).toBeTruthy();
    s.moveFxClips([a as string, b as string], [c as string], 2);
    const st = useProjectStore.getState().style;
    const mid = (id: string | null) => {
      const t = st.transitions.find((x) => x.id === id);
      return t ? (t.start + t.end) / 2 : NaN;
    };
    expect(mid(a)).toBeCloseTo(7, 1);
    expect(mid(b)).toBeCloseTo(12, 1);
    expect(st.adjustClips.find((x) => x.id === c)?.start).toBeCloseTo(10, 1);
    // Far past the start: the group stops at 0 with its spacing kept
    s.moveFxClips([a as string, b as string], [], -100);
    const t2 = useProjectStore.getState().style.transitions;
    expect(Math.min(...t2.map((x) => x.start))).toBe(0);
  });

  it("adds and drops clips from the group with toggle", () => {
    const ui = usePropUiStore.getState();
    ui.selectFx({ lane: "transition", id: "a" });
    ui.toggleFx({ lane: "adjust", id: "b" });
    expect(usePropUiStore.getState().fxGroup).toHaveLength(2);
    usePropUiStore.getState().toggleFx({ lane: "transition", id: "a" });
    expect(usePropUiStore.getState().fxGroup).toEqual([{ lane: "adjust", id: "b" }]);
    expect(usePropUiStore.getState().fx).toEqual({ lane: "adjust", id: "b" });
  });

  it("removes every picked clip at once", () => {
    const s = useProjectStore.getState();
    const a = s.addTransition("whip", 3) as string;
    const c = s.addAdjust("zoom", 6, 7) as string;
    s.removeFxClips([a], [c]);
    const st = useProjectStore.getState().style;
    expect(st.transitions.some((x) => x.id === a)).toBe(false);
    expect(st.adjustClips.some((x) => x.id === c)).toBe(false);
  });
});
