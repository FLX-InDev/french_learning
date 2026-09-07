import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import WorkspaceView from "@/app/workspace/WorkspaceView";
import { AppStateProvider } from "@/components/AppStateProvider";
import type { Sentence } from "@/lib/parser";

/**
 * BUG-1 回归用例（长期保留）
 * 覆盖出口标准 1：录音 → 识别 → 评分 → 提交积分 全链路。
 * 用假的 SpeechRecognition 替代浏览器实现，在 jsdom 中驱动真实组件。
 */

// 四句 fr 与 en 相同，保证无论抽到哪种跟读语言，目标文本都是 "Bonjour"
const POOL: Sentence[] = [
  { fr: "Bonjour", en: "Bonjour", zh: "句子一" },
  { fr: "Bonjour", en: "Bonjour", zh: "句子二" },
  { fr: "Bonjour", en: "Bonjour", zh: "句子三" },
  { fr: "Bonjour", en: "Bonjour", zh: "句子四" },
];

class FakeSpeechRecognition {
  static transcript = "Bonjour";
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  onstart: ((e: unknown) => void) | null = null;

  start() {
    const alt = {
      transcript: FakeSpeechRecognition.transcript,
      confidence: 0.95,
    };
    this.onresult?.({ results: [{ isFinal: true, length: 1, 0: alt }] });
    this.onend?.({});
  }
  stop() {}
  abort() {}
}

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
    FakeSpeechRecognition;
  // 断网环境下 /api/tts/config 必然失败，这里直接给出「回退浏览器语音」的响应
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ provider: "webspeech", available: false }),
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  cleanup();
});

describe("跟读打分全链路（BUG-1 回归）", () => {
  it("录音 → 识别 → 评分 → 提交积分", () => {
    render(
      <AppStateProvider>
        <WorkspaceView stories={[]} sentences={POOL} />
      </AppStateProvider>
    );

    // 1. 切到跟读模式并开卷
    fireEvent.click(screen.getByText(/跟读打分（听→说→评分）/));
    fireEvent.click(screen.getByText("开始跟读打分"));

    // 2. 逐题录音（共 4 题）
    for (let i = 0; i < 4; i++) {
      const btns = screen.getAllByRole("button", { name: /开始录音/ });
      expect(btns).toHaveLength(4 - i);
      fireEvent.click(btns[0]);
    }

    // 3. 识别文本与分数上屏（0.7*F1 + 0.3*0.95 → 99 分）
    expect(screen.getAllByText("4/4 已识别")).toHaveLength(4);
    expect(screen.getAllByText(/识别：/)).toHaveLength(4);
    // 0.7*F1(1) + 0.3*置信度(0.95) → 98 分（分数节点为 span 的直接文本）
    expect(screen.getAllByText("98")).toHaveLength(4);

    // 4. 提交并结算积分：初始 0（v2 不再造演示数据）+ 完成 10 + 优秀 5
    fireEvent.click(screen.getByText("提交并结算积分"));
    expect(screen.getByText("平均发音得分")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();

    // 5. 跟读 session 已持久化
    const saved = JSON.parse(
      window.localStorage.getItem("wb_frws_state") as string
    );
    expect(
      saved.sessions.some((s: { id: string }) => s.id.endsWith("_speak"))
    ).toBe(true);
  });

  it("不支持语音识别的浏览器：跟读入口禁用（Firefox 行为）", () => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    render(
      <AppStateProvider>
        <WorkspaceView stories={[]} sentences={POOL} />
      </AppStateProvider>
    );

    const tab = screen.getByText(/跟读打分（听→说→评分）/);
    expect(tab.getAttribute("disabled")).not.toBeNull();
    expect(tab.getAttribute("title")).toContain("Chrome");
    expect(screen.getByText("开始选择测验").getAttribute("disabled")).toBeNull();
  });
});
