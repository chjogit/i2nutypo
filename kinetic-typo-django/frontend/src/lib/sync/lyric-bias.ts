// Lyric-aware decoding. The lyrics are known before Whisper listens, so while
// it writes each token, tokens from the lyrics get a small push, and the token
// that continues the lyric phrase it is in the middle of gets a larger one.
// What Whisper clearly hears still wins; the push only settles close calls
// (homophones, kanji vs kana, a vowel lost under the music) toward the words
// that are actually sung.

/** Added to the score of every token that appears in the lyrics. */
export const LYRIC_TOKEN_BIAS = 1;
/** Added to the token that continues the lyrics after the last 1, 2 or 3 written tokens. */
export const CONTINUATION_BIAS = [0, 2, 3, 4];
const MAX_ORDER = 3;

export class LyricBias {
  private readonly vocab = new Set<number>();
  /** next[order] maps the last `order` tokens (joined) to the tokens that follow them in the lyrics. */
  private readonly next: Map<string, Set<number>>[] = [];

  /**
   * @param sequences token ids of each lyric line
   * @param textTokenLimit ids at or above this are special tokens (end, language, timestamps) and are left alone
   */
  constructor(
    sequences: readonly (readonly number[])[],
    private readonly textTokenLimit: number,
  ) {
    for (let o = 0; o <= MAX_ORDER; o++) this.next.push(new Map());
    for (const seq of sequences) {
      const ids = seq.filter((id) => id < textTokenLimit);
      ids.forEach((id, i) => {
        this.vocab.add(id);
        for (let o = 1; o <= MAX_ORDER && i - o >= 0; o++) {
          const key = ids.slice(i - o, i).join(",");
          const set = this.next[o].get(key) ?? new Set<number>();
          set.add(id);
          this.next[o].set(key, set);
        }
      });
    }
  }

  get size(): number {
    return this.vocab.size;
  }

  /** Adjusts one row of next-token scores, given the tokens written so far. */
  apply(written: readonly (number | bigint)[], scores: Float32Array): void {
    if (this.vocab.size === 0) return;
    const text: number[] = [];
    for (let i = written.length - 1; i >= 0 && text.length < MAX_ORDER; i--) {
      const id = Number(written[i]);
      if (id < this.textTokenLimit) text.unshift(id);
    }
    for (const id of this.vocab) if (scores[id] > -Infinity) scores[id] += LYRIC_TOKEN_BIAS;
    // Only the longest context that the lyrics know is used
    for (let o = Math.min(MAX_ORDER, text.length); o >= 1; o--) {
      const follow = this.next[o].get(text.slice(text.length - o).join(","));
      if (!follow) continue;
      for (const id of follow) if (scores[id] > -Infinity) scores[id] += CONTINUATION_BIAS[o];
      break;
    }
  }
}
