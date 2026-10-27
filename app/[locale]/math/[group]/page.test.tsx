import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/components/MathQuiz", () => ({ MathQuiz: "math-quiz" }));
vi.mock("@/lib/parser", () => ({ getAllMathItems: () => [] }));

import MathStagePage, { dynamicParams, generateStaticParams } from "./page";

/**
 * 关卡路由守卫（验收方案 §9 K4）：
 * 已下线（如 L3 `l3-money`）或非法的 stage id 必须 404，
 * 不能落进 `MathQuiz` 的空壳（`findStage` 返回 undefined 时页面无题可答）。
 */
describe("数学关卡路由守卫", () => {
  it("课程表内的关卡正常渲染答题组件", () => {
    const root = MathStagePage({
      params: { group: "l3-shape-1", locale: "zh" },
    }) as ReactElement;
    expect(root.type).toBe("math-quiz");
    expect(root.props.stageId).toBe("l3-shape-1");
  });

  it("已下线的 money 关卡返回 404", () => {
    expect(() =>
      MathStagePage({ params: { group: "l3-money", locale: "zh" } })
    ).toThrow("NOT_FOUND");
  });

  it("未知关卡 id 一律 404，且静态参数只枚举课程表关卡", () => {
    expect(dynamicParams).toBe(false);
    const ids = generateStaticParams().map((p) => p.group);
    expect(ids).toContain("l3-shape-1");
    expect(ids).not.toContain("l3-money");
    expect(() =>
      MathStagePage({ params: { group: "l9-nonexistent", locale: "zh" } })
    ).toThrow("NOT_FOUND");
  });
});
