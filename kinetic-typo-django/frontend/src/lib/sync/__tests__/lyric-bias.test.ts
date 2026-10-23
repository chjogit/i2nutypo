import { describe, expect, it } from "vitest";
import { CONTINUATION_BIAS, LYRIC_TOKEN_BIAS, LyricBias } from "../lyric-bias";

const LIMIT = 100;
const argmax = (s: Float32Array) => s.indexOf(Math.max(...s));

describe("LyricBias", () => {
  // Two lyric lines as token ids
  const bias = new LyricBias(
    [
      [10, 11, 12, 13],
      [20, 11, 30],
    ],
    LIMIT,
  );

  it("settles a close call toward the token that continues the lyric", () => {
    const scores = new Float32Array(120);
    scores[12] = 5; // the sung word
    scores[40] = 6; // a similar-sounding word that is not in the lyrics
    bias.apply([150, 151, 10, 11], scores); // special tokens are skipped when reading the context
    expect(argmax(scores)).toBe(12);
    expect(scores[12]).toBe(5 + LYRIC_TOKEN_BIAS + CONTINUATION_BIAS[2]);
  });

  it("does not overrule what is clearly heard", () => {
    const scores = new Float32Array(120);
    scores[12] = 2;
    scores[40] = 12;
    bias.apply([10, 11], scores);
    expect(argmax(scores)).toBe(40);
  });

  it("uses the longest known context only", () => {
    const scores = new Float32Array(120);
    bias.apply([20, 11], scores);
    // After "20 11" the lyrics go on with 30, not 12
    expect(scores[30]).toBe(LYRIC_TOKEN_BIAS + CONTINUATION_BIAS[2]);
    expect(scores[12]).toBe(LYRIC_TOKEN_BIAS);
  });

  it("leaves special and blocked tokens alone", () => {
    const scores = new Float32Array(120);
    scores[13] = -Infinity;
    bias.apply([10, 11, 12], scores);
    expect(scores[13]).toBe(-Infinity);
    expect(scores[110]).toBe(0);
  });
});
