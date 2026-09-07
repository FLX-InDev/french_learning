/**
 * 拼词游戏内核（PRD §7.5.3–§7.5.4，Dev-Plan T3.2）
 *
 * - 题源 = 词卡池 + 字母表代表词（按 fr 去重、3–7 瓦片过滤）；
 * - 瓦片 = 单词的真实字符（含变音符，château 的 â 是一张瓦片）——
 *   满足验收「château 类含变音符词可拼出」；
 * - 撇号并入前一字母块（l'école → ["l'","e","c","o","l","e"]，PRD「撇号整块处理」）；
 * - accent 键盘（é è ê à ù î ô ç）作为提示盘：单词含该字符时高亮，
 *   点击可自动放置对应的变音符瓦片（P0 基础档；完整键位输入为 P1）。
 */

import type { AlphabetCard, Word } from "./contentTypes";
import { matchesLevel } from "./contentTypes";
import type { Level } from "./levels";

export type SpellingWord = {
  id: string;
  fr: string;
  zh: string;
  en: string;
  emoji: string;
  source: "word" | "alphabet";
};

/** accent 提示盘键位 */
export const ACCENT_KEYS = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"] as const;

/** 瓦片数范围：PRD §7.5.3 基础 3–6，为覆盖 château（7 瓦片）等变音符代表词放宽到 7 */
export const MIN_TILES = 3;
export const MAX_TILES = 7;

/** 把法语单词拆成瓦片：小写化，撇号（' / '）并入前一个字母块 */
export function splitTiles(fr: string): string[] {
  const s = fr.trim().toLowerCase();
  const out: string[] = [];
  for (const ch of s) {
    if (ch === "'" || ch === "’") {
      if (out.length > 0) out[out.length - 1] += "'";
      continue;
    }
    out.push(ch);
  }
  return out;
}

const TILE_RE = /^[a-zà-ÿ]'?$/; // 单个字母（含变音符）或字母+撇号块；排除空格/连字符/数字

export function isSpellingEligible(fr: string): boolean {
  const tiles = splitTiles(fr);
  if (tiles.length < MIN_TILES || tiles.length > MAX_TILES) return false;
  return tiles.every((t) => TILE_RE.test(t));
}

/**
 * 构建拼词池：词卡 + 字母表代表词，按 fr 去重，长度过滤，可按学段过滤。
 */
export function buildSpellingPool(
  words: Word[],
  alphabets: AlphabetCard[],
  level?: Level
): SpellingWord[] {
  const pool: SpellingWord[] = [];
  const seen = new Set<string>();
  const push = (w: SpellingWord) => {
    const key = w.fr.toLowerCase();
    if (!w.fr || seen.has(key)) return;
    seen.add(key);
    pool.push(w);
  };

  for (const w of words) {
    if (level && !matchesLevel(w.level, level)) continue;
    const fr = w.fr.trim();
    if (!isSpellingEligible(fr)) continue;
    push({
      id: w.id,
      fr,
      zh: w.zh,
      en: w.en,
      emoji: w.emoji,
      source: "word",
    });
  }
  for (const a of alphabets) {
    const fr = a.word.fr.trim();
    if (!isSpellingEligible(fr)) continue;
    push({
      id: `alpha_${a.id}`,
      fr,
      zh: a.word.zh,
      en: a.word.en,
      emoji: a.emoji,
      source: "alphabet",
    });
  }
  return pool;
}

/** 用可注入随机源乱序瓦片；保证结果 ≠ 原顺序（全同瓦片除外，如 "aaa"） */
export function scrambleTiles(tiles: string[], rng: () => number): string[] {
  const arr = tiles.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  const allSame = new Set(tiles).size === 1;
  if (!allSame && arr.every((t, i) => t === tiles[i])) {
    return scrambleTiles(tiles, rng);
  }
  return arr;
}

/** 拼装结果是否正确（与目标瓦片序列逐一比对，天然忽略大小写差异——瓦片即目标字符） */
export function isSpellingCorrect(assembled: string[], fr: string): boolean {
  const target = splitTiles(fr);
  return (
    assembled.length === target.length && assembled.every((t, i) => t === target[i])
  );
}
