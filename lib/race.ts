/**
 * 口算限时赛（Math Race）纯函数内核 — Phase 6 T6-04 / S3（PRD §7.7.9）
 *
 * 依 DG-4（✅ 已裁决 2026-09-16）：
 * - 时长「用户三选」（60/90/120 秒），初值取学段 `timeLimitSec`
 *   （L5/L6 = 60；L1–L4 = null 时回退默认 60），与关卡限时（§7.7.6）语义区分；
 * - 计分：分数 = 基础分 + combo 加分（验收 ⑤，可复算）；
 * - 排行榜仅本机历史，独立存储键（契约 E：RACE_STORAGE_KEY，不进 AppState，验收 ⑦）。
 *
 * 本文件只含纯函数（单测见 lib/race.test.ts）；localStorage 读写见 lib/raceStore.ts。
 */

import { getLevelConfig, isLevel, type Level } from "./levels";
import type { Rng } from "./mathGenerator";

// ─── 契约 E 常量（CONTEXT.md §2.5，S3 独占）────────────────────

export const RACE_STORAGE_KEY = "wb_frws_race_v1";
export const RACE_DURATIONS = [60, 90, 120] as const;
export type RaceDuration = (typeof RACE_DURATIONS)[number];

/** 学段 timeLimitSec 为 null（L1–L4）或非三选值时的回退时长 */
export const RACE_DEFAULT_DURATION: RaceDuration = 60;

// ─── 计分参数 ───────────────────────────────────────────────────

/** 每答对一题的基础分 */
export const RACE_BASE_POINTS = 10;
/** 连对每级额外加的分 */
export const RACE_COMBO_STEP = 2;
/** 连对加成上限（级数）：连对第 11 题起加成封顶 */
export const RACE_COMBO_CAP = 10;
/** 排行榜显示条数（存储也只保留 Top N） */
export const RACE_TOP_N = 10;

// ─── 计分（验收 ③⑤：combo 计数正确、倍率加分可复算）────────────

export type RaceProgress = {
  /** 答对题数 */
  correct: number;
  /** 当前连对数（答错清零） */
  combo: number;
  /** 本局最高连对 */
  bestCombo: number;
  /** 总分 = Σ 基础分 + combo 加分 */
  score: number;
};

export const INITIAL_RACE_PROGRESS: RaceProgress = {
  correct: 0,
  combo: 0,
  bestCombo: 0,
  score: 0,
};

/**
 * 连击数为 combo（≥1，即本题答对后的连对数）时本题得分：
 * 基础分 + min(combo - 1, CAP) × STEP。
 * 例：连对第 1 题 10 分，第 2 题 12 分，…，第 11 题起 30 分封顶。
 */
export function racePointsFor(combo: number): number {
  const c = Math.max(1, Math.floor(combo));
  return RACE_BASE_POINTS + Math.min(c - 1, RACE_COMBO_CAP) * RACE_COMBO_STEP;
}

/** 单题结算纯函数：答对累进 combo 并加分；答错只清 combo（分数不倒扣） */
export function nextRaceProgress(
  prev: RaceProgress,
  answeredCorrectly: boolean
): RaceProgress {
  if (!answeredCorrectly) {
    return { ...prev, combo: 0 };
  }
  const combo = prev.combo + 1;
  return {
    correct: prev.correct + 1,
    combo,
    bestCombo: Math.max(prev.bestCombo, combo),
    score: prev.score + racePointsFor(combo),
  };
}

// ─── 时长（DG-4：用户三选，初值取学段）─────────────────────────

/** 任意时长值 → 三选之一；非 60/90/120（含 null）一律回退默认 60 */
export function raceDurationOrDefault(
  timeLimitSec: number | null | undefined
): RaceDuration {
  if (
    typeof timeLimitSec === "number" &&
    (RACE_DURATIONS as readonly number[]).includes(timeLimitSec)
  ) {
    return timeLimitSec as RaceDuration;
  }
  return RACE_DEFAULT_DURATION;
}

/** 学段 → 限时赛初值（L5/L6 = 60；L1–L4 null → 60） */
export function defaultRaceDuration(level: Level): RaceDuration {
  return raceDurationOrDefault(getLevelConfig(level).timeLimitSec);
}

// ─── 排行榜（本机历史，独立存储键）─────────────────────────────

export type RaceRecord = {
  score: number;
  correct: number;
  bestCombo: number;
  durationSec: RaceDuration;
  level: Level;
  /** 本地时区日期 YYYY-MM-DD */
  date: string;
};

function isRaceRecord(v: unknown): v is RaceRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.score === "number" &&
    Number.isInteger(r.score) &&
    r.score >= 0 &&
    typeof r.correct === "number" &&
    Number.isInteger(r.correct) &&
    r.correct >= 0 &&
    typeof r.bestCombo === "number" &&
    Number.isInteger(r.bestCombo) &&
    r.bestCombo >= 0 &&
    typeof r.durationSec === "number" &&
    (RACE_DURATIONS as readonly number[]).includes(r.durationSec) &&
    typeof r.level === "string" &&
    isLevel(r.level) &&
    typeof r.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date)
  );
}

/** 防御性解析：非数组 / 字段非法的条目一律丢弃，永不抛错 */
export function parseRaceRecords(raw: unknown): RaceRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRaceRecord);
}

/**
 * 榜单排序：分数 desc → 答对数 desc → 日期 asc（同分先达成者靠前）；
 * 截取 Top N；不修改入参。
 */
export function rankRaceRecords(
  records: RaceRecord[],
  topN: number = RACE_TOP_N
): RaceRecord[] {
  return records
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correct - a.correct ||
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    )
    .slice(0, topN);
}

/** 本地时区日期 YYYY-MM-DD（榜单展示与记录用） */
export function raceDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── 出题（复用 §9.5 生成器，验收 ④：满足学段硬约束）────────────

/** 按学段可用 kinds 随机抽一种（kinds 为空时回退 add） */
export function pickRaceKind(kinds: readonly string[], rng: Rng): string {
  if (kinds.length === 0) return "add";
  return kinds[Math.floor(rng() * kinds.length)];
}
