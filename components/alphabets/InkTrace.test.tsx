import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InkTrace } from "./InkTrace";

/**
 * InkTrace 渲染烟测（T6-08）：
 * - jsdom 无 Canvas 2D 上下文 → 组件须**优雅降级**（渲染控件、不抛错）；
 * - 描红为附加通道：无数据时给出提示而非崩溃（验收 ⑨ / 契约 G 降级要求）。
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InkTrace", () => {
  it("法语字母卡（Aa）渲染笔顺控件与字形切换", () => {
    render(<InkTrace letter="Aa" lang="fr" />);
    expect(screen.getByTestId("inktrace")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    // 成对形态（A/a）→ 提供字形切换
    expect(screen.getByLabelText("上一个字形")).toBeTruthy();
    expect(screen.getByLabelText("下一个字形")).toBeTruthy();
    // 大写无 cursive（法语小写才有）
    expect(screen.queryByText("手写体")).toBeNull();

    // 切到小写 a → 出现书写体切换（print / cursive）
    fireEvent.click(screen.getByLabelText("下一个字形"));
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("手写体")).toBeTruthy();
    expect(screen.getByText("印刷体")).toBeTruthy();
  });

  it("英语字母：仅印刷体，不显示写字体切换", () => {
    render(<InkTrace letter="Bb" lang="en" />);
    expect(screen.getByTestId("inktrace")).toBeTruthy();
    expect(screen.queryByText("手写体")).toBeNull();
  });

  it("无笔顺数据时降级为提示（不崩溃）", () => {
    render(<InkTrace letter="ž" lang="fr" />);
    expect(screen.getByTestId("inktrace-empty")).toBeTruthy();
  });

  it("onDone 存在时渲染完成按钮；缺省时不渲染", () => {
    const onDone = vi.fn();
    const { unmount } = render(<InkTrace letter="Cc" lang="fr" onDone={onDone} />);
    expect(screen.getByText(/完成/)).toBeTruthy();
    unmount();
    render(<InkTrace letter="Cc" lang="fr" />);
    expect(screen.queryByText(/完成/)).toBeNull();
  });

  it("无 Canvas 2D 上下文时不抛错（getContext 返回 null）", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => render(<InkTrace letter="Dd" lang="fr" />)).not.toThrow();
    expect(screen.getByTestId("inktrace")).toBeTruthy();
  });
});
