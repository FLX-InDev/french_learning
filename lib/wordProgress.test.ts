import { describe, expect, it } from "vitest";
import {
  collectionStats,
  upgradeWordProgress,
  upgradeWordStatus,
  type WordProgress,
} from "./workspace";

// ── Phase 5A T5A.5：wordProgress 四态（heard/flipped/correct/spoken）──

describe("upgradeWordStatus（四态只升不降）", () => {
  it("未学 → 任意状态", () => {
    expect(upgradeWordStatus(undefined, "heard")).toBe("heard");
    expect(upgradeWordStatus(undefined, "spoken")).toBe("spoken");
  });

  it("升级方向 heard < flipped < correct < spoken", () => {
    expect(upgradeWordStatus("heard", "flipped")).toBe("flipped");
    expect(upgradeWordStatus("flipped", "correct")).toBe("correct");
    expect(upgradeWordStatus("correct", "spoken")).toBe("spoken");
  });

  it("低状态不覆盖高状态", () => {
    expect(upgradeWordStatus("spoken", "heard")).toBe("spoken");
    expect(upgradeWordStatus("correct", "flipped")).toBe("correct");
    expect(upgradeWordStatus("flipped", "heard")).toBe("flipped");
  });

  it("同状态幂等", () => {
    expect(upgradeWordStatus("heard", "heard")).toBe("heard");
  });
});

describe("upgradeWordProgress（不可变更新）", () => {
  it("升级时返回新对象并写入", () => {
    const wp: WordProgress = { "w-1": "heard" };
    const next = upgradeWordProgress(wp, "w-1", "correct");
    expect(next["w-1"]).toBe("correct");
    expect(wp["w-1"]).toBe("heard"); // 原对象不被改写
  });

  it("不升级时返回原对象引用", () => {
    const wp: WordProgress = { "w-1": "spoken" };
    expect(upgradeWordProgress(wp, "w-1", "heard")).toBe(wp);
  });

  it("新词直接写入", () => {
    const next = upgradeWordProgress({}, "w-9", "flipped");
    expect(next["w-9"]).toBe("flipped");
  });
});

describe("collectionStats（图鉴收集度）", () => {
  it("统计有进度的词数 / 总数", () => {
    const words = [{ id: "w-1" }, { id: "w-2" }, { id: "w-3" }, { id: "w-4" }];
    const wp: WordProgress = { "w-1": "heard", "w-3": "spoken" };
    expect(collectionStats(words, wp)).toEqual({ collected: 2, total: 4 });
  });

  it("空进度 → 0/total；空词集 → 0/0", () => {
    expect(collectionStats([{ id: "a" }], {})).toEqual({ collected: 0, total: 1 });
    expect(collectionStats([], { a: "heard" })).toEqual({ collected: 0, total: 0 });
  });
});
