import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppStateProvider } from "./AppStateProvider";
import { ScreenTimeGuard } from "./ScreenTimeGuard";
import { STATE_KEY, createInitialState, type AppState } from "@/lib/workspace";

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
    seed({ settings: { ...createInitialState().settings, dailyLimitMin: 20 }, screenTime: { date: new Date().toISOString().slice(0, 10), usedSec: 60 } });
    render(
      <AppStateProvider>
        <ScreenTimeGuard />
      </AppStateProvider>
    );
    expect(screen.queryByText(/今天学得很棒/)).toBeNull();
  });

  it("时长用尽：护眼页遮罩 + 明日恢复倒计时 + 家长解锁入口", () => {
    const today = new Date().toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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
});
