import { describe, it, expect } from "vitest";
import {
  INITIAL_RACE_PROGRESS,
  RACE_BASE_POINTS,
  RACE_COMBO_CAP,
  RACE_COMBO_STEP,
  RACE_DEFAULT_DURATION,
  RACE_DURATIONS,
  RACE_STORAGE_KEY,
  RACE_TOP_N,
  defaultRaceDuration,
  nextRaceProgress,
  parseRaceRecords,
  raceDateStr,
  raceDurationOrDefault,
  racePointsFor,
  rankRaceRecords,
  type RaceRecord,
} from "./race";
import { addRaceRecord, clearRaceRecords, loadRaceRecords } from "./raceStore";
import { mulberry32 } from "./mathGenerator";
import { stageKindsForLevel } from "./mathCurriculum";
import { generateMathQuestion } from "./mathGenerator";

// ── 计分（验收 ③⑤：combo 计数正确、倍率加分可复算）────────────

describe("racePointsFor（基础分 + combo 加分）", () => {
  it("连对第 1 题只有基础分", () => {
    expect(racePointsFor(1)).toBe(RACE_BASE_POINTS);
  });

  it("连对第 2、3 题逐级加分", () => {
    expect(racePointsFor(2)).toBe(RACE_BASE_POINTS + RACE_COMBO_STEP);
    expect(racePointsFor(3)).toBe(RACE_BASE_POINTS + 2 * RACE_COMBO_STEP);
  });

  it("连对第 CAP+1 题起加成封顶", () => {
    expect(racePointsFor(RACE_COMBO_CAP + 1)).toBe(
      RACE_BASE_POINTS + RACE_COMBO_CAP * RACE_COMBO_STEP
    );
    expect(racePointsFor(99)).toBe(racePointsFor(RACE_COMBO_CAP + 1));
  });

  it("非法输入（0 / 负数 / 小数）按第 1 题处理", () => {
    expect(racePointsFor(0)).toBe(RACE_BASE_POINTS);
    expect(racePointsFor(-3)).toBe(RACE_BASE_POINTS);
    expect(racePointsFor(2.7)).toBe(racePointsFor(2));
  });
});

describe("nextRaceProgress（单题结算）", () => {
  it("答对：correct/combo 递增、bestCombo 更新、加分", () => {
    const s1 = nextRaceProgress(INITIAL_RACE_PROGRESS, true);
    expect(s1).toEqual({ correct: 1, combo: 1, bestCombo: 1, score: 10 });

    const s2 = nextRaceProgress(s1, true);
    expect(s2).toEqual({ correct: 2, combo: 2, bestCombo: 2, score: 22 });
  });

  it("答错：combo 清零、分数不倒扣、bestCombo 保留", () => {
    const s2 = nextRaceProgress(INITIAL_RACE_PROGRESS, true);
    const s2b = nextRaceProgress(s2, true);
    const miss = nextRaceProgress(s2b, false);
    expect(miss).toEqual({ correct: 2, combo: 0, bestCombo: 2, score: 22 });
  });

  it("「对对错对」序列总分可复算：10 + 12 + 0 + 10", () => {
    let p = INITIAL_RACE_PROGRESS;
    p = nextRaceProgress(p, true);
    p = nextRaceProgress(p, true);
    p = nextRaceProgress(p, false);
    p = nextRaceProgress(p, true);
    expect(p.correct).toBe(3);
    expect(p.bestCombo).toBe(2);
    expect(p.combo).toBe(1);
    expect(p.score).toBe(10 + 12 + 0 + 10);
  });

  it("纯函数：不修改入参", () => {
    const prev = { ...INITIAL_RACE_PROGRESS };
    nextRaceProgress(prev, true);
    expect(prev).toEqual(INITIAL_RACE_PROGRESS);
  });
});

// ── 时长（DG-4：用户三选，初值取学段）─────────────────────────

describe("raceDurationOrDefault / defaultRaceDuration", () => {
  it("三选内的值原样返回", () => {
    for (const d of RACE_DURATIONS) expect(raceDurationOrDefault(d)).toBe(d);
  });

  it("null / 非三选值回退默认 60", () => {
    expect(raceDurationOrDefault(null)).toBe(RACE_DEFAULT_DURATION);
    expect(raceDurationOrDefault(undefined)).toBe(RACE_DEFAULT_DURATION);
    expect(raceDurationOrDefault(45)).toBe(RACE_DEFAULT_DURATION);
    expect(raceDurationOrDefault(1200)).toBe(RACE_DEFAULT_DURATION);
  });

  it("学段初值：L5/L6 = 60（timeLimitSec），L1–L4 = null → 60", () => {
    expect(defaultRaceDuration("L5")).toBe(60);
    expect(defaultRaceDuration("L6")).toBe(60);
    for (const lv of ["L1", "L2", "L3", "L4"] as const) {
      expect(defaultRaceDuration(lv)).toBe(RACE_DEFAULT_DURATION);
    }
  });
});

// ── 排行榜（验收 ⑥：按分数排序、Top N）────────────────────────

function rec(partial: Partial<RaceRecord>): RaceRecord {
  return {
    score: 0,
    correct: 0,
    bestCombo: 0,
    durationSec: 60,
    level: "L3",
    date: "2026-09-16",
    ...partial,
  };
}

describe("rankRaceRecords", () => {
  it("按分数降序", () => {
    const out = rankRaceRecords([
      rec({ score: 10, date: "2026-09-01" }),
      rec({ score: 30, date: "2026-09-02" }),
      rec({ score: 20, date: "2026-09-03" }),
    ]);
    expect(out.map((r) => r.score)).toEqual([30, 20, 10]);
  });

  it("同分时答对多者靠前，再同则先达成（日期早）者靠前", () => {
    const out = rankRaceRecords([
      rec({ score: 20, correct: 5, date: "2026-09-02" }),
      rec({ score: 20, correct: 8, date: "2026-09-03" }),
      rec({ score: 20, correct: 8, date: "2026-09-01" }),
    ]);
    expect(out.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-03", "2026-09-02"]);
  });

  it("截取 Top N", () => {
    const many = Array.from({ length: 15 }, (_, i) => rec({ score: i }));
    expect(rankRaceRecords(many)).toHaveLength(RACE_TOP_N);
    expect(rankRaceRecords(many)[0].score).toBe(14);
  });

  it("不修改入参（纯函数）", () => {
    const input = [rec({ score: 1 }), rec({ score: 3 }), rec({ score: 2 })];
    const snapshot = [...input];
    rankRaceRecords(input);
    expect(input).toEqual(snapshot);
  });
});

describe("parseRaceRecords（防御性解析）", () => {
  it("合法条目通过，非法条目被丢弃", () => {
    const out = parseRaceRecords([
      rec({ score: 42, correct: 5, bestCombo: 3, durationSec: 90, level: "L4", date: "2026-09-16" }),
      { score: "x" },
      null,
      3,
      { score: -1, correct: 0, bestCombo: 0, durationSec: 60, level: "L1", date: "2026-09-16" },
      { score: 5, correct: 1, bestCombo: 1, durationSec: 45, level: "L1", date: "2026-09-16" }, // 非三选时长
      { score: 5, correct: 1, bestCombo: 1, durationSec: 60, level: "LX", date: "2026-09-16" }, // 非法学段
      { score: 5, correct: 1, bestCombo: 1, durationSec: 60, level: "L1", date: "16/09/2026" }, // 非法日期
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(42);
  });

  it("非数组输入返回空榜（不抛错）", () => {
    expect(parseRaceRecords(null)).toEqual([]);
    expect(parseRaceRecords({})).toEqual([]);
    expect(parseRaceRecords("junk")).toEqual([]);
  });
});

describe("raceDateStr", () => {
  it("本地时区 YYYY-MM-DD 补零", () => {
    expect(raceDateStr(new Date(2026, 8, 16))).toBe("2026-09-16");
    expect(raceDateStr(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

// ── 存储（验收 ⑥⑦：独立 key、持久化、不污染 AppState）────────

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => m,
  };
}

describe("raceStore（localStorage 持久化）", () => {
  it("追加 → 读取 回环，且已排序", () => {
    const s = memStorage();
    addRaceRecord(rec({ score: 10, date: "2026-09-01" }), s);
    const out = addRaceRecord(rec({ score: 30, date: "2026-09-02" }), s);
    expect(out[0].score).toBe(30);
    expect(loadRaceRecords(s).map((r) => r.score)).toEqual([30, 10]);
  });

  it("只保留 Top N 条（防膨胀）", () => {
    const s = memStorage();
    let last: RaceRecord[] = [];
    for (let i = 0; i < RACE_TOP_N + 5; i++) {
      last = addRaceRecord(rec({ score: i }), s);
    }
    expect(last).toHaveLength(RACE_TOP_N);
    expect(loadRaceRecords(s)).toHaveLength(RACE_TOP_N);
    expect(last[0].score).toBe(RACE_TOP_N + 4);
  });

  it("JSON 损坏 → 空榜（不抛错）", () => {
    const s = memStorage();
    s.setItem(RACE_STORAGE_KEY, "{oops");
    expect(loadRaceRecords(s)).toEqual([]);
  });

  it("清空后为空榜", () => {
    const s = memStorage();
    addRaceRecord(rec({ score: 99 }), s);
    clearRaceRecords(s);
    expect(loadRaceRecords(s)).toEqual([]);
  });

  it("独立存储 key，不污染 AppState（验收 ⑦）", () => {
    expect(RACE_STORAGE_KEY).toBe("wb_frws_race_v1");
    expect(RACE_STORAGE_KEY).not.toBe("wb_frws_state");
  });

  it("无 window（SSR）时安全返回空榜", () => {
    expect(loadRaceRecords()).toEqual([]);
    expect(addRaceRecord(rec({ score: 1 }))).toHaveLength(1); // 不抛错
  });
});

// ── 出题（验收 ④：复用 §9.5 生成器，满足学段硬约束）────────────

describe("限时赛出题（复用学段 kinds）", () => {
  it("各学段均能出题且 level 正确", () => {
    const levels = ["L1", "L3", "L5", "L6"] as const;
    for (const level of levels) {
      const rng = mulberry32(42);
      const kinds = stageKindsForLevel(level);
      expect(kinds.length).toBeGreaterThan(0);
      for (let i = 0; i < 10; i++) {
        const q = generateMathQuestion({
          level,
          kind: kinds[Math.floor(rng() * kinds.length)],
          rng,
          seedTag: "race",
          index: i,
        });
        expect(q.level).toBe(level);
        expect(q.answer).toBeTruthy();
      }
    }
  });
});
