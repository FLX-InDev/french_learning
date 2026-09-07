/**
 * 六类内容类型定义（PRD §9.2，Dev-Plan T1.2）
 *
 * 所有内容均为三语（zh 中文 / en 英文 / fr 法文）等权对照。
 * level 为 null 表示「通用池」：全学段可见（v1 的 sentences/stories 未标注 level 时
 * 归入通用池，保证向后兼容——PRD §9.3 的「缺省归入 L3/L4 通用池」在 C2 标注后生效）。
 */

import type { Level } from "./levels";

/** 三语文本组 */
export type Tri = { zh: string; en: string; fr: string };

/** manifest 中每个内容文件的类型 */
export type ContentType =
  | "sentence"
  | "story"
  | "word"
  | "song"
  | "dialogue"
  | "alphabet"
  | "math"
  | "logic";

export const CONTENT_TYPES: ContentType[] = [
  "sentence",
  "story",
  "word",
  "song",
  "dialogue",
  "alphabet",
  "math",
  "logic",
];

/** 内容类型 → 中文名 / emoji / 路由（首页入口与家长中心开关共用） */
export const CONTENT_META: Record<
  ContentType,
  { name: string; emoji: string; href: string }
> = {
  sentence: { name: "句子", emoji: "📝", href: "/sentences" },
  story: { name: "故事", emoji: "📖", href: "/stories" },
  word: { name: "词汇", emoji: "🃏", href: "/words" },
  song: { name: "儿歌", emoji: "🎵", href: "/songs" },
  dialogue: { name: "对话", emoji: "💬", href: "/dialogues" },
  alphabet: { name: "字母", emoji: "🔤", href: "/alphabets" },
  math: { name: "数学", emoji: "🔢", href: "/math" },
  logic: { name: "逻辑", emoji: "🧩", href: "/logic" },
};

// ─── 六类内容 ────────────────────────────────────────────────────

export type Word = {
  id: string;
  level: Level | null;
  category: string;
  emoji: string;
  image?: string;
} & Tri;

export type SongLine = Tri & { time?: number };

export type Song = {
  id: string;
  level: Level | null;
  title: Tri;
  emoji: string;
  audio?: string; // 预留真人音频路径
  lines: SongLine[];
};

export type AlphabetCard = {
  id: string;
  letter: string;
  lang: "fr" | "en";
  emoji: string;
  word: Tri;
  example?: Tri;
};

export type DialogueTurn = Tri & { role: "A" | "B" };

export type Dialogue = {
  id: string;
  level: Level | null;
  scene: string;
  title: Tri;
  turns: DialogueTurn[];
};

/** math-bank.md 固定题（生成器题不走 Markdown） */
export type MathItem = {
  id: string;
  level: Level | null;
  kind: string; // clock / money / shape / wordProblem ...
  prompt: Tri;
  /** 判等用的标准答案（取中文表述） */
  answer: string;
  answerTri?: Tri;
  explanation?: Tri;
};

/** logic-bank.md 固定题 */
export type LogicItem = {
  id: string;
  level: Level | null;
  domain: string; // observe / classify / pattern / spatial / number / deduce
  kind: string; // pattern / matrix / sort / classify / oddOne / sudoku / maze / deduce
  stem: Tri;
  clue?: Tri;
  answer: string;
  answerTri?: Tri;
  explanation?: Tri;
};

// ─── 学段过滤 ────────────────────────────────────────────────────

/**
 * 内容是否属于当前学段：
 * - 内容未标注 level（null）→ 通用池，全学段可见；
 * - 已标注 → 仅在本学段可见（软切换即时过滤，PRD §7.1）。
 */
export function matchesLevel(
  itemLevel: Level | null | undefined,
  current: Level
): boolean {
  if (itemLevel === null || itemLevel === undefined) return true;
  return itemLevel === current;
}
