/**
 * SRS 间隔重复调度（Phase 6 T6-06，Dev-Plan T6-06）
 *
 * 规格由 DG-SRS 冻结（2026-09-10），全文见 `docs/phase-6/CONTEXT.md §2.1`。
 * 本文件为**纯函数**层：不依赖 React / 全局状态 / 存储，全部可单测。
 *
 * 评分映射（当前 UI 只有对/错二元，1 / 3 预留未来）：
 *   答对 → grade 2（good）；答错 → grade 0（again）
 *
 * 调度规则：
 *   reps     答错 → 0；答对 → reps + 1
 *   lapses   答错 → lapses + 1；答对 → 不变
 *   ease     答错 → max(1.3, ease - 0.2)；答对 → 不变
 *   interval 答错 → 1；答对且旧 reps===0 → 1；答对且旧 reps===1 → 3；
 *            其后 → clamp(round(interval × ease), 1, 365)
 *   due      today + interval（天）
 *   lastGrade 最近一次 grade
 *
 * 题键约定（见 CONTEXT §2.1）：
 *   lang  → srs:lang:<contentId 或 hash(fr|zh|en)>
 *   spell → srs:spell:<wordId>
 *   math  → srs:math:<kind>:<kindKey>
 *   logic → srs:logic:<kind>:<kindKey>
 */

import type { SrsCard, SrsGrade, SrsState } from "./workspace";
import type { DailyItem } from "./dailyChallenge";

// ─── 常量（跨流共享常量见 CONTEXT §2.5）──────────────────────────

/** 首次/答错后的固定间隔（天） */
export const SRS_INITIAL_INTERVAL = 1;
/** 易记因子默认值 */
export const SRS_EASE_DEFAULT = 2.5;
/** 易记因子的下限 */
export const SRS_EASE_MIN = 1.3;
/** 间隔上限（天） */
export const SRS_MAX_INTERVAL = 365;
/** 每日挑战至多安排的到期题数（契约 §2.1：每天至多 2 道，跨学科） */
export const SRS_DAILY_LIMIT = 2;

/** 答错时 ease 的衰减步长 */
const EASE_PENALTY = 0.2;
/** 第二次答对的固定间隔（天） */
const SECOND_INTERVAL = 3;
/** 题键前缀 */
const KEY_PREFIX = "srs:";

// ─── 日期工具 ────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "YYYY-MM-DD" + n 天 → "YYYY-MM-DD"。
 * 用 UTC 计算，避免本地时区导致跨日偏差；非法输入原样返回。
 */
export function addDaysStr(date: string, n: number): string {
  const parts = String(date).split("-").map((x) => parseInt(x, 10));
  const [y, m, d] = parts;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return date;
  }
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** 稳定短哈希（FNV-1a → base36）：Sentence 无 id 时作为内容指纹 */
export function hashKey(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── 题键 ────────────────────────────────────────────────────────

export type SrsKeyInfo =
  | { kind: "lang"; id: string }
  | { kind: "spell"; id: string }
  | { kind: "math"; kindName: string; kindKey: string }
  | { kind: "logic"; kindName: string; kindKey: string };

/** 语言/内容题的内容指纹（Sentence 无 id，用三语三元组哈希） */
export function langItemKey(fr: string, zh: string, en: string): string {
  return `${KEY_PREFIX}lang:${hashKey(`${fr}|${zh}|${en}`)}`;
}

export function spellItemKey(wordId: string): string {
  return `${KEY_PREFIX}spell:${wordId}`;
}

export function mathItemKey(kind: string, kindKey: string): string {
  return `${KEY_PREFIX}math:${kind}:${kindKey}`;
}

export function logicItemKey(kind: string, kindKey: string): string {
  return `${KEY_PREFIX}logic:${kind}:${kindKey}`;
}

/** kindKey 净化：去掉分隔符与空白，避免破坏 ":"" 切分 */
function keyToken(s: string): string {
  return String(s).trim().replace(/\s+/g, "").replace(/:/g, "-");
}

/**
 * 为一道每日挑战题计算稳定的 SRS 题键。
 * listenPick 暂无稳定内容键（重建有歧义），不入 SRS → 返回 null。
 */
export function srsKeyFor(item: DailyItem): string | null {
  switch (item.mode) {
    case "lang":
      return langItemKey(item.q.fr, item.q.zh, item.q.en);
    case "spell":
      return spellItemKey(item.word.id);
    case "math":
      return mathItemKey(item.q.kind, keyToken(item.q.answer));
    case "logic":
      return logicItemKey(item.q.kind, keyToken(item.q.answer));
    case "listenPick":
      return null;
    default:
      return null;
  }
}

/** 反解题键（`generateDailyChallenge` 用于重建到期题） */
export function parseSrsKey(key: string): SrsKeyInfo | null {
  if (typeof key !== "string" || !key.startsWith(KEY_PREFIX)) return null;
  const body = key.slice(KEY_PREFIX.length);
  const first = body.indexOf(":");
  if (first < 0) return null;
  const kind = body.slice(0, first);
  const rest = body.slice(first + 1);
  if (!rest) return null;

  if (kind === "lang" || kind === "spell") {
    return { kind, id: rest };
  }
  if (kind === "math" || kind === "logic") {
    const second = rest.indexOf(":");
    if (second < 0) return null;
    const kindName = rest.slice(0, second);
    const kindKey = rest.slice(second + 1);
    if (!kindName || !kindKey) return null;
    return { kind, kindName, kindKey };
  }
  return null;
}

// ─── 调度 ────────────────────────────────────────────────────────

/** 新卡：首次出现时创建（due = 次日） */
export function newCard(today: string): SrsCard {
  return {
    reps: 0,
    interval: SRS_INITIAL_INTERVAL,
    ease: SRS_EASE_DEFAULT,
    due: addDaysStr(today, SRS_INITIAL_INTERVAL),
    lapses: 0,
  };
}

/**
 * 结算一次复习（纯函数，返回新卡，不修改入参）。
 * `grade`：0=again(错) / 1=hard / 2=good / 3=easy；当前 UI 只会传 0 或 2。
 */
export function review(
  prev: SrsCard | undefined | null,
  grade: SrsGrade,
  today: string
): SrsCard {
  const card = prev ?? newCard(today);

  if (grade <= 0) {
    // 答错：重置复习进度，ease 衰减（下限 1.3），lapses 累加
    return {
      reps: 0,
      interval: SRS_INITIAL_INTERVAL,
      ease: Math.max(SRS_EASE_MIN, round2(card.ease - EASE_PENALTY)),
      due: addDaysStr(today, SRS_INITIAL_INTERVAL),
      lapses: card.lapses + 1,
      lastGrade: grade,
    };
  }

  // 答对：reps+1；间隔按「旧 reps」分段推进，ease 不变
  const reps = card.reps + 1;
  let interval: number;
  if (card.reps <= 0) {
    interval = SRS_INITIAL_INTERVAL;
  } else if (card.reps === 1) {
    interval = SECOND_INTERVAL;
  } else {
    interval = clamp(
      Math.round(card.interval * card.ease),
      SRS_INITIAL_INTERVAL,
      SRS_MAX_INTERVAL
    );
  }

  return {
    reps,
    interval,
    ease: card.ease,
    due: addDaysStr(today, interval),
    lapses: card.lapses,
    lastGrade: grade,
  };
}

/** 到期判定：due <= today */
export function isDue(card: SrsCard | undefined | null, today: string): boolean {
  return !!card && typeof card.due === "string" && card.due <= today;
}

/**
 * 取到期卡片题键：按 due 升序（最该复习的在前），至多 `limit` 个。
 * 老数据缺字段 / 非法结构时安全跳过（不抛错）。
 */
export function dueItems(
  state: SrsState,
  today: string,
  limit: number = SRS_DAILY_LIMIT
): string[] {
  if (!state || typeof state !== "object") return [];
  const due: [string, SrsCard][] = [];
  for (const entry of Object.entries(state)) {
    const [key, card] = entry;
    if (isDue(card, today)) due.push([key, card]);
  }
  due.sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : 0));
  const n = Math.max(0, Math.floor(limit));
  return due.slice(0, n).map(([key]) => key);
}
