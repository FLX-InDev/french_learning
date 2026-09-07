import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL,
  LEVELS,
  LEVEL_ORDER,
  expandDailyMix,
  getLevelConfig,
  getOptionCount,
  getPassScore,
  isLevel,
  isPronunciationPass,
  levelLabel,
  type Level,
} from "./levels";

const ALL: Level[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

describe("levels · 配置完整性", () => {
  it("六个学段均存在且字段齐全", () => {
    expect(LEVEL_ORDER).toEqual(ALL);
    for (const id of ALL) {
      const c = LEVELS[id];
      expect(c.id).toBe(id);
      expect(c.ageRange).toBeTruthy();
      expect(c.cnName).toBeTruthy();
      expect(c.frName).toBeTruthy();
      expect(c.dailyMix).toBeTruthy();
      expect(c.enabledQuizModes.length).toBeGreaterThan(0);
    }
  });

  it("选项数随学段递增：L1=2，L2=3，L3+ 为 4", () => {
    expect(getOptionCount("L1")).toBe(2);
    expect(getOptionCount("L2")).toBe(3);
    for (const id of ["L3", "L4", "L5", "L6"] as Level[]) {
      expect(getOptionCount(id)).toBe(4);
    }
  });

  it("跟读及格线：L1 不评分（null），L2–L6 递增", () => {
    expect(getPassScore("L1")).toBeNull();
    const scores = (["L2", "L3", "L4", "L5", "L6"] as Level[]).map(
      (l) => getPassScore(l) as number
    );
    expect(scores).toEqual([50, 60, 65, 70, 75]);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it("每日挑战学科配比之和等于总题数", () => {
    for (const id of ALL) {
      const c = LEVELS[id];
      const sum = Object.values(c.dailyMix).reduce((a, b) => a + b, 0);
      expect(sum).toBe(c.dailyQuizCount);
    }
  });

  it("重试次数：L1 无限，其余为有限次数", () => {
    expect(LEVELS.L1.retryAllowed).toBe(Infinity);
    for (const id of ["L2", "L3", "L4", "L5", "L6"] as Level[]) {
      expect(Number.isFinite(LEVELS[id].retryAllowed)).toBe(true);
      expect(LEVELS[id].retryAllowed).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("levels · 读取与兜底", () => {
  it("isLevel 只接受 L1–L6", () => {
    for (const id of ALL) expect(isLevel(id)).toBe(true);
    for (const bad of ["L0", "L7", "l1", "", 3, null, undefined]) {
      expect(isLevel(bad)).toBe(false);
    }
  });

  it("非法学段回落到 DEFAULT_LEVEL，不抛错", () => {
    expect(getLevelConfig("nope").id).toBe(DEFAULT_LEVEL);
    expect(getLevelConfig(undefined).id).toBe(DEFAULT_LEVEL);
    expect(getPassScore(null)).toBe(getPassScore(DEFAULT_LEVEL));
  });

  it("levelLabel 含中法学制名", () => {
    const s = levelLabel("L2");
    expect(s).toContain("L2");
    expect(s).toContain("中班");
    expect(s).toContain("Moyenne section");
  });

  it("expandDailyMix 展开为题数列表且受总题数限制", () => {
    expect(expandDailyMix("L2")).toHaveLength(6);
    expect(expandDailyMix("L2").filter((s) => s === "language")).toHaveLength(3);
    expect(expandDailyMix("L1")).toEqual([
      "language",
      "language",
      "language",
      "language",
    ]);
  });
});

describe("levels · 跟读通过判定（BUG-4 关闭）", () => {
  it("L1 不评分：任何分数都通过", () => {
    expect(isPronunciationPass(0, "L1")).toBe(true);
    expect(isPronunciationPass(100, "L1")).toBe(true);
  });

  it("L2 及格线 50：49 不通过，50 通过", () => {
    expect(isPronunciationPass(49, "L2")).toBe(false);
    expect(isPronunciationPass(50, "L2")).toBe(true);
  });

  it("L5 及格线 70：同分数在不同学段结论不同", () => {
    expect(isPronunciationPass(65, "L5")).toBe(false);
    expect(isPronunciationPass(65, "L4")).toBe(true);
  });
});
