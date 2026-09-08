import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider, useAppState } from "./AppStateProvider";
import { SentenceList } from "./SentenceList";
import { STATE_KEY, type AppState } from "@/lib/workspace";
import type { Sentence } from "@/lib/parser";

/**
 * 状态中枢回归（B2/B3）：
 * - v1 localStorage 数据经 Provider 自动迁移为 v2 并持久化（P0-3 真机验证的自动化版）；
 * - 学段切换后历史数据零丢失（P0-2/B9 的自动化版）；
 * - 列表按学段即时过滤（SentenceList 软切换）。
 */

function Probe() {
  const { state } = useAppState();
  if (!state) return <div>加载中…</div>;
  return (
    <div>
      <span data-testid="v">{state.v}</span>
      <span data-testid="points">{state.points.total}</span>
      <span data-testid="sessions">{state.sessions.length}</span>
      <span data-testid="subject">{state.sessions[0]?.subject ?? "-"}</span>
      <span data-testid="level">{state.profile.level}</span>
      <button
        onClick={() =>
          (
            window as unknown as {
              __setLevel: (l: "L1") => void;
            }
          ).__setLevel?.("L1")
        }
      >
        switch
      </button>
    </div>
  );
}

const V1_STATE = {
  sessions: [
    {
      id: "s_2026-09-01",
      date: "2026-09-01",
      durationMin: 8,
      contentRef: { type: "mixed", title: "旧记录" },
      quiz: { title: "q", questions: [] },
      reviewed: true,
    },
  ],
  checkins: ["2026-09-01", "2026-09-02"],
  points: { total: 130, history: [{ date: "2026-09-01", delta: 10, reason: "每日打卡" }] },
  redeemed: [{ id: "sticker", date: "2026-09-01", cost: 30 }],
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AppStateProvider · v1 → v2 迁移（真机验证的自动化版）", () => {
  it("读到 v1 数据：自动升级为 v2 并写回 localStorage，四字段无损", () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(V1_STATE));

    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    );

    expect(screen.getByTestId("v").textContent).toBe("2");
    expect(screen.getByTestId("points").textContent).toBe("130");
    expect(screen.getByTestId("sessions").textContent).toBe("1");
    expect(screen.getByTestId("subject").textContent).toBe("language");

    const saved = JSON.parse(window.localStorage.getItem(STATE_KEY) as string) as AppState;
    expect(saved.v).toBe(2);
    expect(saved.checkins).toEqual(["2026-09-01", "2026-09-02"]);
    expect(saved.redeemed).toHaveLength(1);
    expect(saved.profile.level).toBe("L3"); // v1 学段未知 → 默认大班
    expect(saved.rewards.levelStars).toEqual({});
  });

  it("非法 JSON：回落初始状态且不崩溃", () => {
    window.localStorage.setItem(STATE_KEY, "{not json");
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>
    );
    expect(screen.getByTestId("v").textContent).toBe("2");
    expect(screen.getByTestId("points").textContent).toBe("0");
  });
});

describe("学段切换 · 历史数据不丢失（B9）", () => {
  it("切段后 sessions / 积分 / 打卡保持原值", () => {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        v: 2,
        ...V1_STATE,
        profile: { level: "L3", createdAt: "2026-09-01", onboarded: true },
      })
    );

    function Switcher() {
      const { state, update } = useAppState();
      if (!state) return null;
      return (
        <div>
          <span data-testid="level">{state.profile.level}</span>
          <span data-testid="points">{state.points.total}</span>
          <button onClick={() => update((s) => ({ ...s, profile: { ...s.profile, level: "L1" } }))}>
            切到 L1
          </button>
        </div>
      );
    }

    render(
      <AppStateProvider>
        <Switcher />
      </AppStateProvider>
    );

    expect(screen.getByTestId("level").textContent).toBe("L3");
    fireEvent.click(screen.getByText("切到 L1"));

    expect(screen.getByTestId("level").textContent).toBe("L1");
    expect(screen.getByTestId("points").textContent).toBe("130");

    const saved = JSON.parse(window.localStorage.getItem(STATE_KEY) as string) as AppState;
    expect(saved.sessions).toHaveLength(1);
    expect(saved.checkins).toHaveLength(2);
    expect(saved.points.total).toBe(130);
  });
});

describe("SentenceList · 学段软切换过滤", () => {
  const sentences: Sentence[] = [
    { zh: "通用句", en: "common", fr: "commun", level: null, category: "通用" },
    { zh: "L1 句", en: "l1", fr: "l1", level: "L1", category: "入园" },
    { zh: "L3 句", en: "l3", fr: "l3", level: "L3", category: "课堂" },
  ];

  it("当前学段 L1：显示通用池 + L1，隐藏 L3", () => {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        v: 2,
        sessions: [],
        checkins: [],
        points: { total: 0, history: [] },
        redeemed: [],
        profile: { level: "L1", createdAt: "2026-09-01", onboarded: true },
      })
    );
    render(
      <AppStateProvider>
        <SentenceList sentences={sentences} />
      </AppStateProvider>
    );
    expect(screen.getByText("通用句")).toBeTruthy();
    expect(screen.getByText("L1 句")).toBeTruthy();
    expect(screen.queryByText("L3 句")).toBeNull();
  });

  it("家长关闭该内容类型时显示关闭提示", () => {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        v: 2,
        sessions: [],
        checkins: [],
        points: { total: 0, history: [] },
        redeemed: [],
        profile: { level: "L3", createdAt: "2026-09-01", onboarded: true },
        settings: {
          speechRate: 0.9,
          sfxOn: true,
          bgmOn: false,
          dailyLimitMin: 20,
          hiddenContent: ["sentence"],
        },
      })
    );
    render(
      <AppStateProvider>
        <SentenceList sentences={sentences} />
      </AppStateProvider>
    );
    expect(screen.getByText(/该内容已被家长关闭/)).toBeTruthy();
  });
});
