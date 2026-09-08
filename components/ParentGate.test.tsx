import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ParentGate } from "./ParentGate";

/**
 * 家长门（F45）回归：长按 3 秒 → 算术题 → 通过/重试。
 * 对应真机走查清单 B1–B5（触屏长按由人工复核，本用例锁定逻辑链路）。
 */

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/** 用受控的 performance.now 驱动长按进度，避免真实等待 3 秒 */
async function holdFor(ms: number) {
  let t = 0;
  vi.spyOn(performance, "now").mockImplementation(() => t);
  const btn = screen.getByLabelText("长按 3 秒进行家长验证");
  fireEvent.pointerDown(btn);
  t = ms;
  await act(async () => {
    await new Promise<void>((res) => requestAnimationFrame(() => res()));
  });
}

describe("ParentGate", () => {
  beforeEach(() => {
    vi.spyOn(globalThis.Math, "random").mockReturnValue(0.5);
  });

  it("长按满 3 秒进入算术题", async () => {
    render(<ParentGate onPass={() => {}} />);
    await holdFor(3100);
    expect(screen.getByText(/请回答：验证通过后即可继续/)).toBeTruthy();
  });

  it("长按不足 3 秒松手：进度归零，不进入算术题", async () => {
    render(<ParentGate onPass={() => {}} />);
    const btn = screen.getByLabelText("长按 3 秒进行家长验证");
    fireEvent.pointerDown(btn);
    fireEvent.pointerUp(btn);
    expect(screen.queryByText(/请回答：验证通过后即可继续/)).toBeNull();
    expect(screen.getByLabelText("长按 3 秒进行家长验证")).toBeTruthy();
  });

  it("答对：触发 onPass", async () => {
    const onPass = vi.fn();
    render(<ParentGate onPass={onPass} />);
    await holdFor(3100);

    const eq = screen.getByText(/\d+\s*\+\s*\d+\s*=\s*\?/).textContent ?? "";
    const m = eq.match(/(\d+)\s*\+\s*(\d+)/);
    const sum = Number(m?.[1]) + Number(m?.[2]);
    fireEvent.change(screen.getByLabelText("请输入算式答案"), {
      target: { value: String(sum) },
    });
    fireEvent.click(screen.getByText("确定"));
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it("答错：提示错误、清空输入、换题可重试", async () => {
    const onPass = vi.fn();
    render(<ParentGate onPass={onPass} />);
    await holdFor(3100);

    const input = screen.getByLabelText("请输入算式答案") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByText("确定"));

    expect(screen.getByText("答案不对，再试一次吧")).toBeTruthy();
    expect(screen.getByLabelText("请输入算式答案").getAttribute("value")).toBe("");
    expect(onPass).not.toHaveBeenCalled();
  });

  it("未通过前不渲染任何回调副作用（默认拦截语义）", () => {
    const onPass = vi.fn();
    render(<ParentGate onPass={onPass} title="家长中心" />);
    expect(screen.getByText(/家长中心/)).toBeTruthy();
    expect(onPass).not.toHaveBeenCalled();
  });
});
