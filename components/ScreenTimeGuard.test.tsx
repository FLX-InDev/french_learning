import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AppStateProvider } from "./AppStateProvider";
import { ScreenTimeGuard } from "./ScreenTimeGuard";
import { STATE_KEY, createInitialState, todayStr, type AppState } from "@/lib/workspace";

/**
 * 时长控制与护眼（F46）回归：用尽 → 遮罩；家长解锁 → 延长。
 * 对应真机走查清单 B11–B13（触屏与倒计时观感由人工复核）。
 */

function seed(state: Partial<AppState>) {
  const base = createInitialState("L3");
  window.localStorage.setItem(
    STATE_KEY,
    JSON.stringify({ ...base, profile: { ...base.profile, onboarded: true }, ...state })
  );
}

function saved(): AppState {
  return JSON.parse(window.localStorage.getItem(STATE_KEY) as string) as AppState;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("ScreenTimeGuard", () => {
  it("时长未用尽时不遮罩", () => {
    seed({ settings: { ...createInitialState().settings, dailyLimitMin: 20 }, screenTime: { date: todayStr(), usedSec: 60 } });
    render(
      <AppStateProvider>
        <ScreenTimeGuard />
      </AppStateProvider>
    );
    expect(screen.queryByText(/今天学得很棒/)).toBeNull();
  });

  it("时长用尽：护眼页遮罩 + 明日恢复倒计时 + 家长解锁入口", () => {
    const today = todayStr();
    seed({
      settings: { ...createInitialState().settings, dailyLimitMin: 20 },
      screenTime: { date: today, usedSec: 20 * 60 },
    });
    render(
      <AppStateProvider>
        <ScreenTimeGuard />
      </AppStateProvider>
    );
    expect(screen.getByText(/今天学得很棒，该让眼睛休息啦/)).toBeTruthy();
    expect(screen.getByText(/后恢复/)).toBeTruthy();
    expect(screen.getByText(/家长解锁/)).toBeTruthy();
  });

  it("不限时（0）永不触发护眼", () => {
    const today = todayStr();
    seed({
      settings: { ...createInitialState().settings, dailyLimitMin: 0 },
      screenTime: { date: today, usedSec: 99999 },
    });
    render(
      <AppStateProvider>
        <ScreenTimeGuard />
      </AppStateProvider>
    );
    expect(screen.queryByText(/今天学得很棒/)).toBeNull();
  });

  it("点家长解锁先弹出家长门（未验证不放行）", () => {
    const today = todayStr();
    seed({
      settings: { ...createInitialState().settings, dailyLimitMin: 10 },
      screenTime: { date: today, usedSec: 10 * 60 },
    });
    render(
      <AppStateProvider>
        <ScreenTimeGuard />
      </AppStateProvider>
    );
    fireEvent.click(screen.getByText(/家长解锁/));
    // 家长门出现（长按入口）；护眼页让位于家长门，未通过验证前时长不变
    expect(screen.getByLabelText("长按 3 秒进行家长验证")).toBeTruthy();
    expect(screen.queryByText(/今天学得很棒/)).toBeNull();
    expect(saved().screenTime.usedSec).toBe(600);
  });

  it("连续 15 分钟触发休息遮罩，倒计时期间不因使用时长累加而回弹（BUG 回归）", async () => {
    vi.useFakeTimers();
    try {
      seed({
        settings: { ...createInitialState().settings, dailyLimitMin: 60 },
        screenTime: { date: todayStr(), usedSec: 15 * 60 },
      });
      render(
        <AppStateProvider>
          <ScreenTimeGuard />
        </AppStateProvider>
      );
      // 遮罩出现，初始 30s
      const read = () =>
        Number((screen.getByText(/^\d+s$/).textContent ?? "").replace("s", ""));
      expect(read()).toBe(30);

      // 连续推进 12 秒：倒计时必须严格递减（旧实现会因 usedSec 累加
      // 每隔几秒被重置回起点，出现 20 → 16 → 20 的回弹）。
      const seen: number[] = [];
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
        seen.push(read());
      }
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]).toBeLessThan(seen[i - 1]);
      }
      expect(seen[seen.length - 1]).toBe(18);

      // 休息期间不计入当日累计时长（暂停记账，也不补记）
      expect(saved().screenTime.usedSec).toBe(15 * 60);

      // 走完剩余 18 秒 → 遮罩消失（逐秒推进：下一轮定时器由 effect 续接）
      for (let i = 0; i < 18; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
      }
      expect(screen.queryByText(/^\d+s$/)).toBeNull();

      // 再过 60 秒不应立即重复弹出（基线已落在本次休息开始时）
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          vi.advanceTimersByTime(5000);
        });
      }
      expect(screen.queryByText(/^\d+s$/)).toBeNull();
      // 恢复记账后时长继续累加（说明暂停只在遮罩期间生效）
      expect(saved().screenTime.usedSec).toBeGreaterThan(15 * 60);
    } finally {
      vi.useRealTimers();
    }
  });
});
