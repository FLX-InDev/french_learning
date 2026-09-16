/**
 * 限时赛排行榜本机持久化 — Phase 6 T6-04 / S3（验收 ⑥⑦）
 *
 * - 独立存储键 `RACE_STORAGE_KEY`（契约 E，不进 AppState，验收 ⑦）；
 * - 读 / 写失败（隐私模式 / 配额 / JSON 损坏）一律静默降级为空榜，不抛错；
 * - Storage 可注入（`getItem/setItem/removeItem` 子集），便于单测（node 环境无 window）。
 */

import {
  RACE_STORAGE_KEY,
  RACE_TOP_N,
  parseRaceRecords,
  rankRaceRecords,
  type RaceRecord,
} from "./race";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

/** 读取榜单（无存储 / 损坏 → 空榜，已排序） */
export function loadRaceRecords(storage?: StorageLike): RaceRecord[] {
  const s = storage ?? defaultStorage();
  if (!s) return [];
  try {
    return rankRaceRecords(
      parseRaceRecords(JSON.parse(s.getItem(RACE_STORAGE_KEY) ?? "[]"))
    );
  } catch {
    return [];
  }
}

function persist(records: RaceRecord[], storage?: StorageLike): void {
  const s = storage ?? defaultStorage();
  if (!s) return;
  try {
    s.setItem(RACE_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 存储不可用（隐私模式 / 配额）时静默失败，不影响游戏
  }
}

/**
 * 追加一条战绩并持久化：榜单合并排序后只保留 Top N（防无限膨胀），
 * 返回追加后的最新榜单（已排序）。
 */
export function addRaceRecord(
  record: RaceRecord,
  storage?: StorageLike
): RaceRecord[] {
  const next = rankRaceRecords(
    [...parseRecordsFrom(storage), record],
    RACE_TOP_N
  );
  persist(next, storage);
  return next;
}

/** 清空榜单（设置页 / 调试用） */
export function clearRaceRecords(storage?: StorageLike): void {
  const s = storage ?? defaultStorage();
  if (!s) return;
  try {
    s.removeItem(RACE_STORAGE_KEY);
  } catch {
    // 同上：静默失败
  }
}

function parseRecordsFrom(storage?: StorageLike): RaceRecord[] {
  const s = storage ?? defaultStorage();
  if (!s) return [];
  try {
    return parseRaceRecords(JSON.parse(s.getItem(RACE_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}
