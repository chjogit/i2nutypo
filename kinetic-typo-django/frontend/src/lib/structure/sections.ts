// Song structure from the lyrics alone: lines are cut into blocks where the
// song pauses, and a block whose lines come back elsewhere in the song is the
// chorus. Nothing is stored except the user's own corrections (style.sectionKinds).

export type SectionKind = "intro" | "verse" | "chorus" | "bridge" | "outro";

export const SECTION_KINDS: readonly SectionKind[] = ["intro", "verse", "chorus", "bridge", "outro"];

export const SECTION_NAME: Record<SectionKind, string> = {
  intro: "도입",
  verse: "절",
  chorus: "후렴",
  bridge: "브리지",
  outro: "마무리",
};

export interface SectionLine {
  startTime: number;
  endTime: number;
  overlap: boolean;
  /** The line's main text; accent marks and punctuation do not matter. */
  text: string;
}

export interface Section {
  /** Block number, the key of a user correction. */
  block: number;
  kind: SectionKind;
  /** "절 2", "후렴 1" … */
  label: string;
  /** First line index, and one past the last (overlapping lines belong to the line before them). */
  from: number;
  to: number;
  startTime: number;
  endTime: number;
  /** The user changed the kind. */
  manual: boolean;
}

const normalize = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Index ranges of the lines that sit together without a pause. */
function blocksOf(lines: readonly SectionLine[]): Array<[number, number]> {
  const main = lines.map((l, i) => ({ l, i })).filter((x) => !x.l.overlap);
  if (main.length === 0) return [];
  const steps = main.slice(1).map((x, k) => x.l.startTime - main[k].l.startTime);
  const typical = median(steps);
  const cut: number[] = [];
  for (let k = 1; k < main.length; k++) {
    const prev = main[k - 1].l;
    const gap = main[k].l.startTime - prev.endTime;
    const step = main[k].l.startTime - prev.startTime;
    // A pause after the line ended, or a step much longer than the song's usual one
    if (gap >= 2.5 || step > Math.max(typical * 2 + 1, 6)) cut.push(k);
  }
  // No pauses at all in a long song: fall back to groups of four lines
  if (cut.length === 0 && main.length >= 8) for (let k = 4; k < main.length; k += 4) cut.push(k);
  const bounds = [0, ...cut, main.length];
  const out: Array<[number, number]> = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const from = main[bounds[b]].i;
    const to = b === bounds.length - 2 ? lines.length : main[bounds[b + 1]].i;
    out.push([from, to]);
  }
  return out;
}

/** The song's sections, with the user's corrections applied. */
export function detectSections(
  lines: readonly SectionLine[],
  overrides: Readonly<Record<string, SectionKind>> = {},
): Section[] {
  const blocks = blocksOf(lines);
  if (blocks.length === 0) return [];
  const norm = lines.map((l) => normalize(l.text));
  const owner = new Map<string, Set<number>>();
  blocks.forEach(([from, to], b) => {
    for (let i = from; i < to; i++) {
      if (norm[i].length < 2) continue;
      const set = owner.get(norm[i]) ?? new Set<number>();
      set.add(b);
      owner.set(norm[i], set);
    }
  });
  const returns = blocks.map(([from, to], b) => {
    let mine = 0;
    let again = 0;
    for (let i = from; i < to; i++) {
      if (norm[i].length < 2) continue;
      mine++;
      if ([...(owner.get(norm[i]) ?? [])].some((o) => o !== b)) again++;
    }
    return mine > 0 && again / mine >= 0.5;
  });

  const kinds: SectionKind[] = blocks.map((_, b) => (returns[b] ? "chorus" : "verse"));
  const firstChorus = kinds.indexOf("chorus");
  const lastChorus = kinds.lastIndexOf("chorus");
  const size = (b: number) => blocks[b][1] - blocks[b][0];
  if (blocks.length > 2 && !returns[0] && size(0) <= 2 && (firstChorus === -1 || firstChorus > 0))
    kinds[0] = "intro";
  const last = blocks.length - 1;
  if (last > 0 && !returns[last] && size(last) <= 3 && (lastChorus === -1 || lastChorus < last)) {
    kinds[last] = lastChorus === -1 ? "verse" : "outro";
  }
  // Something new after the second chorus, with another chorus or the end ahead, is a bridge
  let seen = 0;
  for (let b = 0; b < blocks.length; b++) {
    if (kinds[b] === "chorus" && (b === 0 || kinds[b - 1] !== "chorus")) seen++;
    else if (kinds[b] === "verse" && seen >= 2 && b < last + 1) kinds[b] = "bridge";
  }
  for (const [key, kind] of Object.entries(overrides)) {
    const b = Number(key);
    if (Number.isInteger(b) && b >= 0 && b < kinds.length && SECTION_KINDS.includes(kind)) kinds[b] = kind;
  }

  const counts: Partial<Record<SectionKind, number>> = {};
  return blocks.map(([from, to], b) => {
    const kind = kinds[b];
    counts[kind] = (counts[kind] ?? 0) + 1;
    const total = kinds.filter((k) => k === kind).length;
    const label = total > 1 ? `${SECTION_NAME[kind]} ${counts[kind]}` : SECTION_NAME[kind];
    return {
      block: b,
      kind,
      label,
      from,
      to,
      startTime: lines[from].startTime,
      endTime: Math.max(...lines.slice(from, to).map((l) => l.endTime)),
      manual: overrides[String(b)] !== undefined,
    };
  });
}

/** Section index of each line. */
export function sectionOfLines(sections: readonly Section[], count: number): number[] {
  const out = Array<number>(count).fill(0);
  sections.forEach((s, k) => {
    for (let i = s.from; i < s.to; i++) out[i] = k;
  });
  return out;
}
