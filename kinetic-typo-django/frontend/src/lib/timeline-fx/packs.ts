import type { ElementMotion, TransitionKind } from "@/types/project";
import type { FinishSettings } from "@/types/finish";

/**
 * One-click "motion packs": a matched set of transitions (with a sound on
 * each), how the theme elements move, how lyrics leave and roam, and a
 * finishing look, like the template packs of motion plugins.
 */
export interface MotionPack {
  id: string;
  label: string;
  hint: string;
  transitions: readonly TransitionKind[];
  color: "accent" | "bg" | "white" | "black";
  /** Where the transitions go: every lyric line change, or every bar of the found beats. */
  on: "lines" | "bars";
  element: ElementMotion;
  lyricRoam: number;
  finish: Partial<FinishSettings> & { filterAmounts?: Partial<Record<string, number>> };
}

export const MOTION_PACKS: readonly MotionPack[] = [
  {
    id: "mv_cut",
    label: "뮤비 컷",
    hint: "줄이 바뀔 때마다 휩 팬·줌 펀치·플래시를 번갈아 넣습니다. 요소는 자리를 옮기고, 35mm 영화 질감을 입힙니다.",
    transitions: ["whip", "zoom", "flash", "spin"],
    color: "white",
    on: "lines",
    element: { mode: "organic", amount: 0.55, marks: 0.5 },
    lyricRoam: 0.35,
    finish: {
      film: "cinemaPrint",
      filmAmount: 0.6,
      grainSize: 1.3,
      weave: 0.15,
      breath: 0.2,
      filterAmounts: { grain: 0.35, halation: 0.4 },
    },
  },
  {
    id: "dreamy",
    label: "몽환",
    hint: "흐림 전환과 빛샘으로 부드럽게 넘어가고, 요소는 둥실 떠다닙니다. 미스트와 블룸을 더합니다.",
    transitions: ["blur", "leak", "dip"],
    color: "white",
    on: "lines",
    element: { mode: "drift", amount: 0.6, marks: 0.45 },
    lyricRoam: 0.2,
    finish: { film: "warmNegative", filmAmount: 0.5, filterAmounts: { mist: 0.5, bloom: 0.45 } },
  },
  {
    id: "glitch",
    label: "글리치",
    hint: "마디마다 글리치·RGB 분리·모자이크로 끊습니다. 비트 분석이 없으면 줄마다 넣습니다.",
    transitions: ["glitch", "rgb", "pixel"],
    color: "black",
    on: "bars",
    element: { mode: "hop", amount: 0.65, marks: 0.3 },
    lyricRoam: 0.3,
    finish: { filterAmounts: { chromatic: 0.4, scanlines: 0.35 } },
  },
  {
    id: "pop_comic",
    label: "팝 · 만화",
    hint: "원·줄무늬·잉크·사선 도형 전환, 손그림 장식선을 많이 그리고 망점 질감을 살짝 입힙니다.",
    transitions: ["circle", "bars", "ink", "diagonal"],
    color: "accent",
    on: "lines",
    element: { mode: "organic", amount: 0.7, marks: 0.9 },
    lyricRoam: 0.4,
    finish: { vibrance: 0.35, filterAmounts: { halftone: 0.25 } },
  },
  {
    id: "film_mood",
    label: "필름 감성",
    hint: "검정으로 디졸브와 빛샘, 16mm 필름 입자·흔들림·테두리, 따뜻한 네거티브 색.",
    transitions: ["dip", "leak"],
    color: "black",
    on: "lines",
    element: { mode: "drift", amount: 0.4, marks: 0.3 },
    lyricRoam: 0.15,
    finish: {
      film: "warmNegative",
      filmAmount: 0.8,
      grainSize: 2,
      weave: 0.4,
      breath: 0.4,
      filterAmounts: { grain: 0.55, halation: 0.5, dust: 0.35, vignette: 0.45 },
    },
  },
  {
    id: "minimal",
    label: "미니멀",
    hint: "배경색으로 조용히 디졸브하고 밀어내기만 씁니다. 요소와 가사는 제자리에 둡니다.",
    transitions: ["dip", "slide"],
    color: "bg",
    on: "lines",
    element: { mode: "still", amount: 0.5, marks: 0 },
    lyricRoam: 0,
    finish: {},
  },
];
