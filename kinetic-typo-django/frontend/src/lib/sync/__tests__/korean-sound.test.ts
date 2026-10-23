import { describe, expect, it } from "vitest";
import { toPronunciationKey } from "../pronunciation";

const same = (a: string, b: string) => expect(toPronunciationKey(a)).toBe(toPronunciationKey(b));

describe("Korean sound changes", () => {
  it("gives the spelling and the sound the same key", () => {
    same("있어", "이써"); // liaison
    same("웃고 있어", "웃꼬 이써"); // tensing
    same("없는", "엄는"); // nasalization
    same("같이", "가치"); // palatalization
    same("굳이", "구지");
    same("좋다", "조타"); // ㅎ aspiration
    same("축하해", "추카해");
    same("신라", "실라");
    same("종로", "종노");
    same("않아", "아나");
    same("읽어", "일거");
    same("값이", "갑시");
  });

  it("still tells different words apart", () => {
    expect(toPronunciationKey("밤")).not.toBe(toPronunciationKey("방"));
    expect(toPronunciationKey("있어")).not.toBe(toPronunciationKey("이어"));
  });
});
