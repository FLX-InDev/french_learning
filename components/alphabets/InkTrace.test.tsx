import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InkTrace } from "./InkTrace";
import { getHanziGlyph, toTraceBoard } from "@/components/hanzi/hanziStrokes";

/**
 * InkTrace 渲染烟测（T6-08 + 中文 MVP v1.8）：
 * - jsdom 无 Canvas 2D 上下文 → 组件须**优雅降级**（渲染控件、不抛错）；
 * - 描红为附加通道：无数据时给出提示而非崩溃（验收 ⑨ / 契约 G 降级要求）；
 * - `board` 通道（米字格）：不出现法语专属的书写体切换，画布画外沿方框而非四线格。
 */

/** 记录调用序列的假 2D 上下文（jsdom 无 canvas 实现，用它在断言里复现绘制路径） */
function fakeCtx() {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((a) => (typeof a === "number" ? Math.round(a * 10) / 10 : JSON.stringify(a))).join(",")})`);
    };
  const ctx = {
    calls,
    setTransform: rec("setTransform"),
    clearRect: rec("clearRect"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    stroke: rec("stroke"),
    fill: rec("fill"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arc: rec("arc"),
    strokeRect: rec("strokeRect"),
    setLineDash: rec("setLineDash"),
    save: rec("save"),
    restore: rec("restore"),
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
  return ctx;
}

beforeEach(() => {
  // 明确模拟无 2D 上下文，避免 jsdom 的未实现日志；绘制用例自行覆盖。
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

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
    // frcursive 入库后手写体覆盖 A–Z：法语大写同样出现书写体切换
    expect(screen.getByText("手写体")).toBeTruthy();
    expect(screen.getByText("印刷体")).toBeTruthy();

    // 切到小写 a → 书写体切换保持可用
    fireEvent.click(screen.getByLabelText("下一个字形"));
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("手写体")).toBeTruthy();
    expect(screen.getByText("印刷体")).toBeTruthy();
    // keyed attempt 不添加 DOM 包裹，也不重建外壳上的选择控件。
    const shell = screen.getByTestId("inktrace");
    const styleGroup = screen.getByRole("group");
    const printButton = screen.getByRole("button", { name: "印刷体" });
    const beforeCanvas = screen.getByRole("img");
    fireEvent.click(printButton);
    expect(screen.getByRole("group")).toBe(styleGroup);
    expect(screen.getByRole("button", { name: "印刷体" })).toBe(printButton);
    expect(printButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img")).not.toBe(beforeCanvas);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("a（print）");
    expect(screen.getByRole("img").parentElement?.parentElement).toBe(shell);
    expect(screen.getByTestId("inktrace-feedback").parentElement).toBe(shell);
    expect(screen.getByTestId("inktrace-feedback").getAttribute("aria-live")).toBe("polite");
  });

  it("变音字形（é）：单字形可直接描红，法语提供印刷体/手写体切换", () => {
    // 单字形卡（变音卡形态）→ 组件须能独立渲染，并提供两种书写体（T6-08 验收 ①⑤）
    render(<InkTrace letter="é" lang="fr" />);
    expect(screen.getByTestId("inktrace")).toBeTruthy();
    expect(screen.getByText("é")).toBeTruthy();
    expect(screen.getByText("手写体")).toBeTruthy();
    expect(screen.getByText("印刷体")).toBeTruthy();
    // 单字形无需上一个/下一个切换
    expect(screen.queryByLabelText("上一个字形")).toBeNull();
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

  // ─── v1.8 board 通道（中文描红米字格）─────────────────────────

  it("board 模式：渲染汉字、无书写体切换、无字形翻页", () => {
    const board = toTraceBoard(getHanziGlyph("一")!);
    render(<InkTrace board={board} />);
    expect(screen.getByTestId("inktrace")).toBeTruthy();
    expect(screen.getByText("一")).toBeTruthy();
    expect(screen.queryByText("手写体")).toBeNull();
    expect(screen.queryByText("印刷体")).toBeNull();
    expect(screen.queryByLabelText("上一个字形")).toBeNull();
    // 只回放不判分：按钮口径与法语一致
    expect(screen.getByText(/回放笔顺/)).toBeTruthy();
    expect(screen.getByText("手指或触控笔即可描红")).toBeTruthy();
  });

  it("board 模式画米字格外沿方框；法语四线格不画方框", () => {
    const rice = fakeCtx();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(rice);
    const { unmount } = render(<InkTrace board={toTraceBoard(getHanziGlyph("二")!)} />);
    const rects = rice.calls.filter((c) => c.startsWith("strokeRect("));
    // 首帧可能因尺寸 state 落定重绘一次，故只要求「每次绘制都只画一个外沿方框」
    expect(rects.length).toBeGreaterThan(0);
    // 外沿留白 2 → 300px 画布上为 (6,6,288,288)
    for (const r of rects) expect(r).toBe("strokeRect(6,6,288,288)");
    // 对角引导线 + 横竖中线：虚线调用至少 3 次（外沿/中线/对角各一段起笔）
    expect(rice.calls.filter((c) => c.startsWith("setLineDash([5,4])")).length).toBeGreaterThanOrEqual(1);
    unmount();

    const four = fakeCtx();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(four);
    render(<InkTrace letter="Aa" lang="fr" />);
    expect(four.calls.some((c) => c.startsWith("strokeRect("))).toBe(false);
    // 四线格：五条水平参考线（baseline 为实线，其余虚线）
    expect(four.calls.filter((c) => c.startsWith("moveTo(0,")).length).toBeGreaterThanOrEqual(5);
  });

  it("board 缺笔画数据时降级为提示（不崩溃）", () => {
    render(<InkTrace board={{ glyph: "〇", strokes: [] }} />);
    expect(screen.getByTestId("inktrace-empty")).toBeTruthy();
  });
});
