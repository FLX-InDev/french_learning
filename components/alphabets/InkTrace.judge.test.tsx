import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InkTrace, type TraceBoard } from "./InkTrace";
import { getHanziGlyph, toTraceBoard } from "@/components/hanzi/hanziStrokes";
import { HANZI_JUDGE } from "@/components/hanzi/strokeJudge";
import { playSfx } from "@/lib/audioManager";
import type { TracePoint } from "./letterStrokes";

vi.mock("@/lib/audioManager", () => ({ playSfx: vi.fn() }));

/**
 * 笔顺判定状态机（契约 H）：只在 `board.judge` 存在时启用。
 *
 * jsdom 没有 canvas 实现，也没有可信指针事件：
 * - 用假 2D 上下文记录绘制调用；
 * - 必须伪造 `getBoundingClientRect`（否则 `toNorm` 除以 0 宽）；
 * - 必须伪造 `setPointerCapture`（非可信 PointerEvent 会让它抛 NotFoundError，
 *   从而中断 onPointerDown，笔迹永远记不上）。
 */

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
    stroke: () => {
      calls.push("stroke()");
      calls.push(`strokeStyle(${JSON.stringify(ctx.strokeStyle)})`);
    },
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

/** 300×300 画布：归一化坐标 ×3 即像素坐标；切 key 后要绑定新的 canvas。 */
function prepareCanvas(container: HTMLElement) {
  const canvas = container.querySelector("canvas");
  if (!canvas) throw new Error("canvas 未渲染");
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  return canvas;
}

function mount(board: Parameters<typeof InkTrace>[0]["board"]) {
  const ctx = fakeCtx();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  const view = render(<InkTrace board={board} />);
  return { ...view, canvas: prepareCanvas(view.container), ctx };
}

const judgeBoard = (ch: string) => ({ ...toTraceBoard(getHanziGlyph(ch)!), judge: HANZI_JUDGE });

/**
 * jsdom 没有 `PointerEvent`（实测 `typeof window.PointerEvent === "undefined"`），
 * `fireEvent.pointerDown` 会退化成裸 `Event` 并把 clientX/clientY 丢掉 → 归一化坐标全是 NaN。
 * 这里用同名的 MouseEvent 派发，React 的 onPointer* 照样触发，坐标也带得上。
 */
function pointer(type: "pointerdown" | "pointermove" | "pointerup", el: Element, pt?: TracePoint) {
  fireEvent(
    el,
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: pt ? Math.max(0, Math.min(300, pt[0] * 3)) : 0,
      clientY: pt ? Math.max(0, Math.min(300, pt[1] * 3)) : 0,
    })
  );
}

function drawStroke(canvas: HTMLCanvasElement, pts: TracePoint[]) {
  pointer("pointerdown", canvas, pts[0]);
  for (const p of pts.slice(1)) pointer("pointermove", canvas, p);
  // 点全部留在 0–300px 内，避免 onPointerLeave 提前提交
  pointer("pointerup", canvas);
}

const strokePts = (ch: string, i: number): TracePoint[] => getHanziGlyph(ch)!.strokes[i].points;
const latestFrame = (ctx: ReturnType<typeof fakeCtx>) =>
  ctx.calls.slice(ctx.calls.lastIndexOf("clearRect(0,0,300,300)"));
const replayMine = () => screen.getByRole<HTMLButtonElement>("button", { name: /回放我的描红/ });
const isPlaying = () => screen.queryByRole("button", { name: /停止/ }) !== null;
const idleFeedback = "沿着虚线慢慢描，笔顺会提示但不打分";

/** 手动推进真实动画回调，既检查时间/画面，也检查取消后不会再排帧。 */
function mockRaf() {
  let id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending.set(++id, callback);
    return id;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((key) => {
    pending.delete(key);
  });
  const frame = (now: number) => {
    const callbacks = Array.from(pending.values());
    pending.clear();
    act(() => callbacks.forEach((callback) => callback(now)));
  };
  return { pending, request, cancel, frame };
}

function mockResizeObserver() {
  const observers: Observer[] = [];
  class Observer {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(private callback: ResizeObserverCallback) {
      observers.push(this);
    }
    resize(width: number) {
      act(() => this.callback(
        [{ contentRect: { width } }] as ResizeObserverEntry[],
        this as unknown as ResizeObserver
      ));
    }
  }
  vi.stubGlobal("ResizeObserver", Observer);
  return observers;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("InkTrace 笔顺判定（board.judge）", () => {
  it("描对一笔 → 收笔、鼓励音、进度进到下一笔", () => {
    const { canvas } = mount(judgeBoard("二"));
    drawStroke(canvas, strokePts("二", 0));

    expect(playSfx).toHaveBeenCalledWith("correct");
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 2 / 2 笔");
    // 判定模式不显示「已描 N 笔」
    expect(screen.queryByText(/已描/)).toBeNull();
  });

  it("描完全字 → 收尾用庆祝音并给出完成文案", () => {
    const { canvas } = mount(judgeBoard("二"));
    drawStroke(canvas, strokePts("二", 0));
    drawStroke(canvas, strokePts("二", 1));

    expect(playSfx).toHaveBeenLastCalledWith("star");
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("全部写完啦，写得很好！");
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 2 / 2 笔");
  });

  it("该写第 1 笔却描了第 2 笔 → 期望 index 不动，提示指出具体笔序", () => {
    const { canvas } = mount(judgeBoard("二"));
    drawStroke(canvas, strokePts("二", 1));

    expect(playSfx).toHaveBeenCalledWith("encourage");
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 1 / 2 笔");
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("这是第 2 笔，先写第 1 笔");
  });

  it("失败只轻抖，不出现叉号与分数", () => {
    const { container } = mount(judgeBoard("二"));
    const canvas = container.querySelector("canvas")!;
    drawStroke(canvas, strokePts("二", 1));

    const wrap = canvas.parentElement;
    expect(wrap?.className).toContain("animate-[shake_0.4s_ease]");
    expect(container.textContent).not.toContain("✗");
    expect(container.textContent).not.toMatch(/\d+\s*分/);
  });

  it("完全偏离参考笔 → 按原因给提示（起笔脱靶）", () => {
    const { canvas } = mount(judgeBoard("一"));
    drawStroke(canvas, strokePts("一", 0).map(([x, y]) => [x, y + 30] as TracePoint));
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("从绿色小圆点起笔，再试一次");
  });

  it("轻描一下（轨迹过短）不出结论、不记失败", () => {
    const { canvas } = mount(judgeBoard("二"));
    drawStroke(canvas, [
      [28.6, 42.7],
      [30, 43],
      [31, 43.2],
    ]);
    expect(playSfx).not.toHaveBeenCalled();
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe(
      "沿着虚线慢慢描，笔顺会提示但不打分"
    );
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 1 / 2 笔");
  });

  it("同一笔连错 3 次 → 自动只回放这一笔（笔顺动画按钮转为停止态）", () => {
    const raf = mockRaf();
    const { canvas, ctx } = mount(judgeBoard("二"));
    for (let i = 0; i < 3; i++) {
      drawStroke(canvas, strokePts("二", 1));
      expect(isPlaying()).toBe(i === 2);
    }
    expect(screen.getByText(/⏹/)).toBeTruthy();
    // 自动引导不能覆盖更具体的「写了其它笔」提示。
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("这是第 2 笔，先写第 1 笔");
    raf.frame(100);
    raf.frame(2100); // 足够写完当前一笔，但还没有下一帧来结束动画。
    expect(latestFrame(ctx).filter((call) => call.includes(",3.5,0,"))).toHaveLength(1);
    raf.frame(2116);
    expect(isPlaying()).toBe(false); // 不能继续播放第二笔。
    expect(raf.pending.size).toBe(0);

    // 自动引导后重试计数重新开始，同一笔仍可以无限重试。
    drawStroke(canvas, strokePts("二", 1));
    drawStroke(canvas, strokePts("二", 1));
    expect(isPlaying()).toBe(false);
    drawStroke(canvas, strokePts("二", 1));
    expect(isPlaying()).toBe(true);
  });

  it("清空 → 笔迹、提示与进度一起归零", () => {
    const { canvas } = mount(judgeBoard("二"));
    drawStroke(canvas, strokePts("二", 0));
    drawStroke(canvas, strokePts("二", 1));
    fireEvent.click(screen.getByText(/清空/));

    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 1 / 2 笔");
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("沿着虚线慢慢描，笔顺会提示但不打分");
    expect(replayMine().disabled).toBe(true);
    drawStroke(canvas, strokePts("二", 0));
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 2 / 2 笔");
    expect(playSfx).toHaveBeenLastCalledWith("correct");
    drawStroke(canvas, strokePts("二", 1));
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("全部写完啦，写得很好！");
    expect(playSfx).toHaveBeenLastCalledWith("star");
  });

  it("起笔圈只出现在判定模式：米字格 + 半径 24 的目标圈", () => {
    const { ctx } = mount(judgeBoard("一"));
    const rects = ctx.calls.filter((c) => c.startsWith("strokeRect("));
    expect(rects.length).toBeGreaterThan(0);
    expect(ctx.calls.some((c) => /^arc\([^)]*,24,0,6\.3/.test(c))).toBe(true);
  });

  it("轻触与 ignored 轨迹不累计失败，第三次真正失败才引导", () => {
    mockRaf();
    const { canvas } = mount(judgeBoard("二"));
    drawStroke(canvas, strokePts("二", 1));
    for (let i = 0; i < 4; i++) {
      drawStroke(canvas, [[28.6, 42.7]]);
      drawStroke(canvas, [[28.6, 42.7], [30, 43], [31, 43.2]]);
    }
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("这是第 2 笔，先写第 1 笔");
    drawStroke(canvas, strokePts("二", 1));
    expect(isPlaying()).toBe(false);
    drawStroke(canvas, strokePts("二", 1));
    expect(isPlaying()).toBe(true);
  });

  it("同字形的新 board 对象保留已确认/失败/未收笔轨迹、提示与失败计数", () => {
    mockRaf();
    const { canvas, ctx, container, rerender } = mount(judgeBoard("十"));
    drawStroke(canvas, strokePts("十", 0));
    drawStroke(canvas, strokePts("十", 0));
    drawStroke(canvas, strokePts("十", 0));
    const wrong = strokePts("十", 0);
    pointer("pointerdown", canvas, wrong[0]);
    for (const point of wrong.slice(1)) pointer("pointermove", canvas, point);
    const before = latestFrame(ctx);
    const feedback = screen.getByTestId("inktrace-feedback").textContent;
    expect(before).toContain('strokeStyle("#e91e8c")');
    expect(before).toContain('strokeStyle("rgba(244,114,182,0.25)")');
    expect(before).toContain('strokeStyle("#f472b6")');

    rerender(<InkTrace board={judgeBoard("十")} />);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(latestFrame(ctx)).toEqual(before);
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe(feedback);
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 2 / 2 笔");
    expect(canvas.parentElement?.className).toContain("animate-[shake_0.4s_ease]");
    pointer("pointerup", canvas);
    expect(isPlaying()).toBe(true); // 未收笔轨迹与前两次失败均保留。
  });

  it("同 key 重渲染保留单笔引导及 RAF 进度，不重新开始或扩成整字回放", () => {
    const raf = mockRaf();
    const { canvas, rerender } = mount(judgeBoard("十"));
    drawStroke(canvas, strokePts("十", 0));
    for (let i = 0; i < 3; i++) drawStroke(canvas, strokePts("十", 0));
    raf.frame(100);
    raf.frame(300);
    const pending = Array.from(raf.pending.entries());
    rerender(<InkTrace board={judgeBoard("十")} />);
    expect(isPlaying()).toBe(true);
    expect(Array.from(raf.pending.entries())).toEqual(pending);
    expect(raf.cancel).not.toHaveBeenCalled();
    raf.frame(2300);
    raf.frame(2316);
    expect(isPlaying()).toBe(false);
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 2 / 2 笔");
    drawStroke(canvas, strokePts("十", 1));
    expect(playSfx).toHaveBeenLastCalledWith("star");
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("全部写完啦，写得很好！");
  });

  it("切 board 字形清空已确认/失败/未收笔轨迹、反馈、失败计数及抖动计时器", () => {
    vi.useFakeTimers();
    mockRaf();
    const { canvas, ctx, container, rerender } = mount(judgeBoard("十"));
    drawStroke(canvas, strokePts("十", 0));
    drawStroke(canvas, strokePts("十", 0));
    drawStroke(canvas, strokePts("十", 0));
    pointer("pointerdown", canvas, [10, 10]);
    pointer("pointermove", canvas, [90, 90]);
    expect(vi.getTimerCount()).toBe(1);

    rerender(<InkTrace board={judgeBoard("二")} />);
    const next = prepareCanvas(container);
    expect(next).not.toBe(canvas);
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe(idleFeedback);
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 1 / 2 笔");
    expect(replayMine().disabled).toBe(true);
    expect(next.parentElement?.className).toBe("w-full");
    expect(vi.getTimerCount()).toBe(0);
    for (const color of ["#e91e8c", "#f472b6", "rgba(244,114,182,0.25)"]) {
      expect(latestFrame(ctx)).not.toContain(`strokeStyle(${JSON.stringify(color)})`);
    }
    pointer("pointerup", next); // 旧的 active 不得在新字形里收笔。
    expect(playSfx).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 2; i++) drawStroke(next, strokePts("二", 1));
    expect(isPlaying()).toBe(false);
    drawStroke(next, strokePts("二", 0));
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 2 / 2 笔");
  });

  it.each(["guide", "user", "single"] as const)("%s 回放中切字形取消旧 RAF 并清理观察器/计时器", (mode) => {
    vi.useFakeTimers();
    const raf = mockRaf();
    const observers = mockResizeObserver();
    const { canvas, ctx, container, rerender, unmount } = mount(judgeBoard("十"));
    observers[0].resize(340);
    expect(canvas.style.height).toBe("340px");
    rerender(<InkTrace board={judgeBoard("十")} />);
    expect(observers).toHaveLength(1);
    expect(canvas.style.height).toBe("340px");
    drawStroke(canvas, strokePts("十", 0));
    if (mode === "single") {
      for (let i = 0; i < 3; i++) drawStroke(canvas, strokePts("十", 0));
      expect(vi.getTimerCount()).toBe(1);
    } else {
      fireEvent.click(mode === "user" ? replayMine() : screen.getByRole("button", { name: /回放笔顺/ }));
    }
    raf.frame(100);
    const [oldId, staleStep] = Array.from(raf.pending.entries())[0];
    rerender(<InkTrace board={judgeBoard("二")} />);
    expect(isPlaying()).toBe(false);
    expect(replayMine().disabled).toBe(true);
    expect(container.querySelector("canvas")?.style.height).toBe("300px");
    expect(raf.cancel).toHaveBeenCalledWith(oldId);
    expect(raf.pending.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(observers[1].observe).toHaveBeenCalledWith(container.querySelector("canvas")?.parentElement);
    expect(vi.getTimerCount()).toBe(0);
    const callCount = ctx.calls.length;
    act(() => staleStep(5000));
    expect(ctx.calls).toHaveLength(callCount);
    expect(raf.pending.size).toBe(0);

    // 新字形的手动回放必须从第一笔开始，而不是沿用旧的 singleGuide。
    fireEvent.click(screen.getByRole("button", { name: /回放笔顺/ }));
    raf.frame(100);
    raf.frame(2100);
    raf.frame(2116);
    expect(isPlaying()).toBe(true);
    const nextId = Array.from(raf.pending.keys())[0];
    unmount();
    expect(raf.cancel).toHaveBeenCalledWith(nextId);
    expect(raf.pending.size).toBe(0);
    expect(observers[1].disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("清空正在播放的单笔引导会重置失败/抖动/计时器，之后可从第一笔重做", () => {
    vi.useFakeTimers();
    const raf = mockRaf();
    const { canvas, ctx } = mount(judgeBoard("十"));
    const blank = latestFrame(ctx);
    drawStroke(canvas, strokePts("十", 0));
    for (let i = 0; i < 3; i++) drawStroke(canvas, strokePts("十", 0));
    expect(isPlaying()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /清空/ }));
    expect(isPlaying()).toBe(false);
    expect(raf.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(latestFrame(ctx)).toEqual(blank);
    expect(canvas.parentElement?.className).toBe("w-full");
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe(idleFeedback);
    expect(screen.getByTestId("inktrace-progress").textContent).toBe("第 1 / 2 笔");
    for (let i = 0; i < 2; i++) drawStroke(canvas, strokePts("十", 1));
    expect(isPlaying()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /清空/ }));
    for (let i = 0; i < 2; i++) drawStroke(canvas, strokePts("十", i));
    expect(playSfx).toHaveBeenLastCalledWith("star");
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("全部写完啦，写得很好！");
  });
});

/** 法语字母（无 board）也要能喂指针事件，用来证明记录行为未被判定改造影响 */
function mountLetter(letter: string, lang: "fr" | "en") {
  const ctx = fakeCtx();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  const view = render(<InkTrace letter={letter} lang={lang} />);
  return { ...view, canvas: prepareCanvas(view.container), ctx };
}

describe("字母通道不受判定影响（契约 D）", () => {
  it("法语 Aa：无进度行、提示仍是「只记录轨迹，不判分」，描多少笔都照收", () => {
    const { canvas } = mountLetter("Aa", "fr");

    expect(screen.queryByTestId("inktrace-progress")).toBeNull();
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("沿着虚线描一描（只记录轨迹，不判分）");

    drawStroke(canvas, strokePts("一", 0));
    drawStroke(canvas, strokePts("一", 0).map(([x, y]) => [x, y + 30] as TracePoint));
    // 一律记录：两笔都算（第二笔明显偏离参考），且没有任何音效／判定提示
    expect(screen.getByText(/已描 2 笔/)).toBeTruthy();
    expect(playSfx).not.toHaveBeenCalled();
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("沿着虚线描一描（只记录轨迹，不判分）");
  });

  it("法语四线格不画米字格外框，也不画起笔圈", () => {
    const { ctx } = mountLetter("Aa", "fr");
    expect(ctx.calls.some((c) => c.startsWith("strokeRect("))).toBe(false);
    expect(ctx.calls.some((c) => /^arc\([^)]*,24,/.test(c))).toBe(false);
  });

  it("同 resolved key 的 letter 重渲染保留轨迹，更新 onDone 而不重建画布", () => {
    const { canvas, container, rerender } = mountLetter("Aa", "fr");
    const onDone = vi.fn();
    drawStroke(canvas, strokePts("一", 0));
    rerender(<InkTrace letter="A" lang="fr" onDone={onDone} className="updated" />);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(screen.getByText(/已描 1 笔/)).toBeTruthy();
    expect(screen.getByTestId("inktrace").className).toBe("updated");
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it.each(["字形按钮", "书写体按钮", "letter", "lang"])("%s 改变 resolved key 后清空轨迹并取消回放，保留外壳", (change) => {
    const raf = mockRaf();
    const { canvas, container, rerender } = mountLetter("Aa", "fr");
    const shell = screen.getByTestId("inktrace");
    const nextGlyph = screen.getByRole("button", { name: "下一个字形" });
    drawStroke(canvas, strokePts("一", 0));
    fireEvent.click(replayMine());
    raf.frame(100);
    const oldId = Array.from(raf.pending.keys())[0];
    if (change === "字形按钮") fireEvent.click(nextGlyph);
    else if (change === "书写体按钮") fireEvent.click(screen.getByRole("button", { name: "印刷体" }));
    else if (change === "letter") rerender(<InkTrace letter="Bb" lang="fr" />);
    else rerender(<InkTrace letter="Aa" lang="en" />);

    const next = prepareCanvas(container);
    expect(next).not.toBe(canvas);
    expect(screen.getByTestId("inktrace")).toBe(shell);
    expect(screen.getByRole("button", { name: "下一个字形" })).toBe(nextGlyph);
    expect(screen.queryByText(/已描/)).toBeNull();
    expect(screen.queryByTestId("inktrace-progress")).toBeNull();
    expect(screen.getByTestId("inktrace-feedback").textContent).toBe("沿着虚线描一描（只记录轨迹，不判分）");
    expect(replayMine().disabled).toBe(true);
    expect(isPlaying()).toBe(false);
    expect(raf.cancel).toHaveBeenCalledWith(oldId);
    expect(raf.pending.size).toBe(0);
    drawStroke(next, strokePts("一", 0));
    expect(screen.getByText(/已描 1 笔/)).toBeTruthy();
    expect(playSfx).not.toHaveBeenCalled();
  });

  it("字形切换丢弃未收笔轨迹，书写体选择留在外壳且返回旧字形也是新练习", () => {
    const { canvas, container } = mountLetter("Aa", "fr");
    fireEvent.click(screen.getByRole("button", { name: "印刷体" }));
    const printCanvas = prepareCanvas(container);
    expect(printCanvas).not.toBe(canvas);
    pointer("pointerdown", printCanvas, [10, 10]);
    pointer("pointermove", printCanvas, [80, 80]);
    fireEvent.click(screen.getByRole("button", { name: "下一个字形" }));
    const next = prepareCanvas(container);
    expect(next.getAttribute("aria-label")).toContain("a（print）");
    expect(screen.getByRole("button", { name: "印刷体" }).getAttribute("aria-pressed")).toBe("true");
    pointer("pointerup", next);
    expect(replayMine().disabled).toBe(true);
    drawStroke(next, strokePts("一", 0));
    fireEvent.click(screen.getByRole("button", { name: "上一个字形" }));
    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toContain("A（print）");
    expect(replayMine().disabled).toBe(true);
    expect(screen.queryByText(/已描/)).toBeNull();
  });

  it("board 无 judge 仍只记录轨迹；board 与相同 glyph 的字母使用不同 resetKey", () => {
    const { canvas, container, rerender } = mountLetter("A", "fr");
    drawStroke(canvas, strokePts("一", 0));
    const board: TraceBoard = { ...toTraceBoard(getHanziGlyph("一")!), glyph: "A" };
    rerender(<InkTrace board={board} />);
    const boardCanvas = prepareCanvas(container);
    expect(boardCanvas).not.toBe(canvas);
    expect(replayMine().disabled).toBe(true);
    expect(screen.queryByTestId("inktrace-progress")).toBeNull();
    drawStroke(boardCanvas, [[10, 10], [90, 90]]);
    drawStroke(boardCanvas, [[90, 10], [10, 90]]);
    expect(screen.getByText(/已描 2 笔/)).toBeTruthy();
    expect(playSfx).not.toHaveBeenCalled();
    rerender(<InkTrace letter="A" lang="fr" />);
    expect(container.querySelector("canvas")).not.toBe(boardCanvas);
    expect(replayMine().disabled).toBe(true);
  });
});

// 固定弧长的局部夹具，不替换实际字形数据或判定阈值。
const replayBoard: TraceBoard = {
  glyph: "回放测试",
  grid: "rice",
  strokes: [20, 80].map((y) => ({
    kind: "base",
    points: [0, 1, 5, 10, 20, 40, 60, 80, 100].map((x): TracePoint => [x, y]),
  })),
};

describe("弧长回放与资源清理", () => {
  it.each([
    ["guide", 100],
    ["user", 150],
  ] as const)("%s 保持每秒 %i 单位与笔间 180ms 停顿（不按点数计时）", (mode, speed) => {
    const raf = mockRaf();
    const { canvas } = mount(replayBoard);
    if (mode === "user") {
      // 用户点更密，但总弧长同为 100。
      for (const y of [20, 80]) drawStroke(canvas, Array.from({ length: 51 }, (_, i): TracePoint => [i * 2, y]));
    }
    fireEvent.click(mode === "user" ? replayMine() : screen.getByRole("button", { name: /回放笔顺/ }));
    raf.frame(100);
    const duration = 100 / speed * 1000;
    const firstEnd = 100 + 180 + duration;
    raf.frame(firstEnd - 1);
    expect(isPlaying()).toBe(true);
    raf.frame(firstEnd + 1); // 第一笔走完，第二笔从此时重新计停顿。
    const secondStart = firstEnd + 1;
    raf.frame(secondStart + duration + 1); // 去掉停顿才会在此过早结束。
    raf.frame(secondStart + duration + 17);
    expect(isPlaying()).toBe(true);
    raf.frame(secondStart + 180 + duration - 1);
    expect(isPlaying()).toBe(true);
    raf.frame(secondStart + 180 + duration + 1);
    raf.frame(secondStart + 180 + duration + 17);
    expect(isPlaying()).toBe(false);
    expect(raf.pending.size).toBe(0);
  });

  it("无数据分支卸载练习并取消 RAF，恢复数据后重新观察画布", () => {
    const raf = mockRaf();
    const observers = mockResizeObserver();
    const { canvas, container, rerender } = mount(replayBoard);
    fireEvent.click(screen.getByRole("button", { name: /回放笔顺/ }));
    rerender(<InkTrace board={{ ...replayBoard, strokes: [] }} />);
    expect(screen.getByTestId("inktrace-empty")).toBeTruthy();
    expect(raf.pending.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    rerender(<InkTrace board={replayBoard} />);
    expect(container.querySelector("canvas")).not.toBe(canvas);
    expect(observers[1].observe).toHaveBeenCalledOnce();
    expect(isPlaying()).toBe(false);
    expect(replayMine().disabled).toBe(true);
  });

  it("抖动中的练习直接卸载会清理 420ms 计时器与 ResizeObserver", () => {
    vi.useFakeTimers();
    const observers = mockResizeObserver();
    const { canvas, unmount } = mount(judgeBoard("二"));
    drawStroke(canvas, strokePts("二", 1));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });
});
