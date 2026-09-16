/**
 * 自然拼读内核（Phase 6 T6-07，PRD §7.5.6）
 *
 * 教学法由 **DG-1 冻结（2026-09-14，CONTEXT §2.6）**：
 * - **3–5 岁（L1–L3）→ syllabique（音节拼读）**：按法语音节切分（cha-peau）；
 * - **6 岁+（L4–L6）→ mixte（混合体系）**：按字素/音素组切分（ch-a-p-eau）；
 * - **英语 CVC 三卡**（c-at 之形）不受 DG-1 影响，按 PRD §7.5.6 自 **L4** 起开放。
 *
 * 本文件为**纯函数**层：不依赖 React / 全局状态，全部可单测。
 * 切分结果为教学简化算法的产物，**须经法语母语者/教师复核留档**（T6-07 验收 ④）。
 */

import type { Word } from "./contentTypes";
import { matchesLevel } from "./contentTypes";
import type { Level } from "./levels";
import type { Rng } from "./mathGenerator";

export type PhonicsScript = "syllabique" | "mixte";

/** 契约 §2.3：拼读卡（`DailyItem` 的 `phonics` 成员载荷） */
export type PhonicsCard = {
  id: string;
  lang: "en" | "fr";
  /** 切分块（法语：音节或字素；英语：CVC 三卡） */
  parts: string[];
  whole: string;
  emoji?: string;
  level: Level;
};

/**
 * 法语切分体系（DG-1）：L1–L3 → syllabique；L4–L6 → mixte。
 * 体系一律由本函数派生，**不得在调用处硬编码**（CONTEXT §2.6）。
 */
export function phonicsScriptFor(level: Level): PhonicsScript {
  return level === "L4" || level === "L5" || level === "L6"
    ? "mixte"
    : "syllabique";
}

// ─── 法语切分：syllabique（音节）────────────────────────────────

/** 法语元音群（按长度降序，保证最长匹配） */
const FR_VOWEL_GROUPS = [
  "eau",
  "oeu",
  "ain",
  "ein",
  "oin",
  "ion",
  "ien",
  "ou",
  "oi",
  "ai",
  "ei",
  "au",
  "eu",
  "an",
  "am",
  "en",
  "em",
  "in",
  "im",
  "on",
  "om",
  "un",
  "um",
  "a",
  "e",
  "i",
  "o",
  "u",
  "y",
  "é",
  "è",
  "ê",
  "ë",
  "à",
  "â",
  "ù",
  "û",
  "î",
  "ï",
  "ô",
  "ö",
  "œ",
  "æ",
];

/**
 * 鼻化元音群：**后接元音或 n/m 时不鼻化**（如 banane 的 `an`、année 的 `ann`），
 * 否则会误切为 `ban-an-e` 之类。
 */
const FR_NASAL_GRAPHS = new Set([
  "ain",
  "ein",
  "oin",
  "ien",
  "ion",
  "an",
  "am",
  "en",
  "em",
  "in",
  "im",
  "on",
  "om",
  "un",
  "um",
]);

const FR_VOWEL_CHARS = new Set("aeiouyéèêëàâùûîïôöœæ".split(""));

/** 鼻化群是否应被阻断（后接元音 / n / m） */
function isNasalBlocked(w: string, i: number, g: string): boolean {
  if (!FR_NASAL_GRAPHS.has(g)) return false;
  const next = w[i + g.length];
  return !!next && (FR_VOWEL_CHARS.has(next) || next === "n" || next === "m");
}

/** 合法音节首辅音簇（作为整体归属后一音节） */
const FR_ONSET_CLUSTERS = [
  "bl",
  "br",
  "ch",
  "cl",
  "cr",
  "dr",
  "fl",
  "fr",
  "gl",
  "gr",
  "gn",
  "ph",
  "pl",
  "pr",
  "qu",
  "th",
  "tr",
  "vr",
];

/**
 * 音节切分例外表（**母语者复核后修正用**）：
 * 键 = 小写词形，值 = 音节数组；命中即直接返回，不进入算法。
 * 例：若复核认为 `fille` 应作 `fi-lle`，在此写 `fille: ["fi", "lle"]` 即可，无需改算法。
 */
export const FR_SYLLABLE_OVERRIDES: Record<string, string[]> = {};

/** 字素切分例外表（用法同 `FR_SYLLABLE_OVERRIDES`） */
export const FR_GRAPHEME_OVERRIDES: Record<string, string[]> = {};

function matchGroup(w: string, i: number, groups: string[]): string | null {
  for (const g of groups) {
    if (w.startsWith(g, i)) return g;
  }
  return null;
}

function isOnsetCluster(c: string): boolean {
  return FR_ONSET_CLUSTERS.includes(c.toLowerCase());
}

/**
 * 法语音节切分（syllabique，教学简化规则）：
 * - 单音节词整体返回；
 * - 两个元音群之间：0–1 个辅音 → 归后一音节（V-CV）；合法首簇（br/tr…）→ 整体归后；
 *   否则最后一个辅音归后、其余归前（VC-CV，ar-bre）。
 *
 * 例：chapeau → [cha, peau]；école → [é, co, le]；arbre → [arb, re]；table → [ta, ble]。
 */
export function splitSyllablesFr(
  word: string,
  overrides: Record<string, string[]> = FR_SYLLABLE_OVERRIDES
): string[] {
  const w = word.trim().toLowerCase();
  if (!w) return [];

  const hit = overrides[w];
  if (hit && hit.length > 0) return hit.slice();

  // 1. 定位全部元音群（鼻化群在后接元音/n/m 时退回单字符元音）
  const vowels: { start: number; end: number }[] = [];
  let i = 0;
  while (i < w.length) {
    const g = matchGroup(w, i, FR_VOWEL_GROUPS);
    if (g && !isNasalBlocked(w, i, g)) {
      vowels.push({ start: i, end: i + g.length });
      i += g.length;
    } else if (g) {
      vowels.push({ start: i, end: i + 1 });
      i += 1;
    } else {
      i++;
    }
  }
  if (vowels.length <= 1) return [w];

  // 2. 逐对元音决定切点
  const cuts: number[] = [];
  for (let k = 0; k < vowels.length - 1; k++) {
    const aEnd = vowels[k].end;
    const bStart = vowels[k + 1].start;
    const cluster = w.slice(aEnd, bStart);
    let cut: number;
    if (cluster.length <= 1) {
      cut = aEnd; // V-CV：辅音归后
    } else if (isOnsetCluster(cluster)) {
      cut = aEnd; // br/tr/bl… 整体归后
    } else {
      cut = bStart - 1; // 分开：最后一个辅音归后
    }
    cuts.push(cut);
  }

  // 3. 按切点切片
  const out: string[] = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev && c < w.length) {
      out.push(w.slice(prev, c));
      prev = c;
    }
  }
  out.push(w.slice(prev));
  return out.filter((s) => s.length > 0);
}

// ─── 法语切分：mixte（字素 / 音素组）────────────────────────────

/** 法语字素表（含二合/三合，按长度降序） */
const FR_GRAPHEMES = [
  "eau",
  "oeu",
  "ain",
  "ein",
  "oin",
  "ion",
  "ch",
  "ph",
  "gn",
  "qu",
  "gu",
  "th",
  "ou",
  "oi",
  "ai",
  "ei",
  "au",
  "eu",
  "an",
  "am",
  "en",
  "em",
  "in",
  "im",
  "on",
  "om",
  "un",
  "um",
];

/**
 * 法语字素切分（mixte 体系）：按音素组切，如 chapeau → [ch, a, p, eau]。
 * 未命中多字符字素时按单字符切分。
 */
export function splitGraphemesFr(
  word: string,
  overrides: Record<string, string[]> = FR_GRAPHEME_OVERRIDES
): string[] {
  const w = word.trim().toLowerCase();
  const hit = overrides[w];
  if (hit && hit.length > 0) return hit.slice();
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    const g = matchGroup(w, i, FR_GRAPHEMES);
    if (g && !isNasalBlocked(w, i, g)) {
      out.push(g);
      i += g.length;
    } else {
      out.push(w[i]);
      i++;
    }
  }
  return out.filter((s) => s.trim().length > 0);
}

// ─── 英语 CVC 三卡 ──────────────────────────────────────────────

const EN_VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * 英语 CVC 三卡拆分（辅音-元音-辅音，如 cat → [c, a, t]）。
 * 仅接受严格 3 字母且中间为单元音的形态；否则返回 null（不进拼读池）。
 */
export function splitCvc(en: string): [string, string, string] | null {
  const w = en.trim().toLowerCase();
  if (w.length !== 3 || !/^[a-z]{3}$/.test(w)) return null;
  const c1 = w.charAt(0);
  const v = w.charAt(1);
  const c2 = w.charAt(2);
  if (EN_VOWELS.has(c1) || !EN_VOWELS.has(v) || EN_VOWELS.has(c2)) return null;
  return [c1, v, c2];
}

// ─── 题池 ──────────────────────────────────────────────────────

/**
 * 组装拼读题池（按学段）：
 * - 法语卡：全学段；体系由 `phonicsScriptFor(level)` 决定（syllabique / mixte）；
 * - 英语 CVC 卡：仅 `mixte` 段（L4+，PRD §7.5.6）；
 * - 仅收录切分块 ≥ 2 的卡（单块无拼读意义）。
 */
export function phonicsPool(level: Level, words: Word[]): PhonicsCard[] {
  const script = phonicsScriptFor(level);
  const advanced = script === "mixte";
  const pool: PhonicsCard[] = [];
  const seen = new Set<string>();

  for (const w of words) {
    if (!matchesLevel(w.level, level)) continue;

    const fr = w.fr.trim().toLowerCase();
    if (fr) {
      const parts = advanced ? splitGraphemesFr(fr) : splitSyllablesFr(fr);
      if (parts.length >= 2) {
        const id = `phonics_fr_${script}_${w.id}`;
        if (!seen.has(id)) {
          seen.add(id);
          pool.push({
            id,
            lang: "fr",
            parts,
            whole: w.fr.trim(),
            emoji: w.emoji,
            level,
          });
        }
      }
    }

    if (advanced) {
      const cvc = splitCvc(w.en);
      if (cvc) {
        const id = `phonics_en_cvc_${w.id}`;
        if (!seen.has(id)) {
          seen.add(id);
          pool.push({
            id,
            lang: "en",
            parts: cvc,
            whole: w.en.trim().toLowerCase(),
            emoji: w.emoji,
            level,
          });
        }
      }
    }
  }

  return pool;
}

/** 从题池随机取一张拼读卡（空池返回 null；rng 注入便于测试） */
export function nextPhonicsCard(
  pool: PhonicsCard[],
  rng: Rng
): PhonicsCard | null {
  if (!pool || pool.length === 0) return null;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx];
}
