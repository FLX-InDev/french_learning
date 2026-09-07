import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "@/components/workspace/StatCard";

// 组件测试冒烟：验证 vitest 的 jsdom + JSX 链路可用（Phase 0 测试设施验收项之一）
describe("StatCard", () => {
  it("渲染标签与数值", () => {
    render(<StatCard label="累计学习时长" value="128 分钟" />);
    expect(screen.getByText("累计学习时长")).toBeTruthy();
    expect(screen.getByText("128 分钟")).toBeTruthy();
  });
});
