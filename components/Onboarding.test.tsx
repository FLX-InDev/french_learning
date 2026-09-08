import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppStateProvider } from "./AppStateProvider";
import { Onboarding } from "./Onboarding";
import { STATE_KEY, type AppState } from "@/lib/workspace";

/**
 * 首次启动引导（F45）回归：选学段 → 设时长 → 发放狐狸蛋。
 * 对应真机走查清单 B10（触屏体验由人工复核）。
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function saved(): AppState {
  return JSON.parse(window.localStorage.getItem(STATE_KEY) as string) as AppState;
}

describe("Onboarding", () => {
  it("三步完成后写入学段/时长/狐狸蛋，并标记 onboarded", () => {
    render(
      <AppStateProvider>
        <Onboarding />
      </AppStateProvider>
    );

    // 第 1 步：选学段 L1
    fireEvent.click(screen.getByLabelText(/选择学段 L1/));
    fireEvent.click(screen.getByText("下一步"));

    // 第 2 步：设时长 10 分钟
    fireEvent.click(screen.getByText("10 分钟"));
    fireEvent.click(screen.getByText("下一步"));

    // 第 3 步：发放狐狸蛋
    expect(screen.getByText(/这是你的狐狸蛋/)).toBeTruthy();
    fireEvent.click(screen.getByText("开始学习"));

    const s = saved();
    expect(s.v).toBe(2);
    expect(s.profile.level).toBe("L1");
    expect(s.profile.onboarded).toBe(true);
    expect(s.settings.dailyLimitMin).toBe(10);
    expect(s.mascot).toEqual({ stage: "egg", fedCount: 0 });
  });

  it("完成后引导不再出现（幂等，刷新不重复弹）", () => {
    const first = render(
      <AppStateProvider>
        <Onboarding />
      </AppStateProvider>
    );
    fireEvent.click(screen.getByText("跳过，稍后在家长中心设置"));
    expect(saved().profile.onboarded).toBe(true);
    first.unmount();

    render(
      <AppStateProvider>
        <Onboarding />
      </AppStateProvider>
    );
    expect(screen.queryByText(/欢迎来到法语宝宝学/)).toBeNull();
  });
});
