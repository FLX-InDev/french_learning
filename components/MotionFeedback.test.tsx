import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { usePrefersReducedMotion } from "./useMotionPrefs";
import { Confetti } from "./Confetti";
import { StarReveal } from "./celebrate";
import { playSfx } from "@/lib/audioManager";

vi.mock("@/lib/audioManager", () => ({ playSfx: vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

let reduced = false;
let events: EventTarget;
const addListener = vi.fn((type: string, listener: EventListener) => events.addEventListener(type, listener));
const removeListener = vi.fn((type: string, listener: EventListener) => events.removeEventListener(type, listener));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  reduced = false;
  events = new EventTarget();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return reduced; },
    addEventListener: addListener,
    removeEventListener: removeListener,
  })));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function changeMotion(value: boolean) {
  act(() => {
    reduced = value;
    events.dispatchEvent(new Event("change"));
  });
}
function MotionProbe() {
  return <output>{String(usePrefersReducedMotion())}</output>;
}

describe("usePrefersReducedMotion external snapshot", () => {
  it("reads the initial boolean, follows both changes, and removes its listener", () => {
    reduced = true;
    const view = render(<MotionProbe />);
    expect(screen.getByRole("status").textContent).toBe("true");
    changeMotion(false);
    expect(screen.getByRole("status").textContent).toBe("false");
    changeMotion(true);
    expect(screen.getByRole("status").textContent).toBe("true");
    view.unmount();
    expect(addListener).toHaveBeenCalledOnce();
    expect(removeListener.mock.calls).toEqual(addListener.mock.calls);
  });

  it("falls back to false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<MotionProbe />);
    expect(screen.getByRole("status").textContent).toBe("false");
  });

  it("uses false on the server and hydrates a true client preference without mismatch", async () => {
    reduced = true;
    const container = document.createElement("div");
    container.innerHTML = renderToString(<MotionProbe />);
    expect(container.textContent).toBe("false");
    expect(addListener).not.toHaveBeenCalled();
    const recoverable = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <MotionProbe />, { onRecoverableError: recoverable });
    });
    expect(container.textContent).toBe("true");
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    expect(removeListener.mock.calls).toEqual(addListener.mock.calls);
  });
});

describe("Confetti burst lifetime", () => {
  it("lasts exactly 1600ms, does not replay while active, and replays on the next edge", () => {
    const view = render(<StrictMode><Confetti active /></StrictMode>);
    expect(view.container.querySelectorAll("span")).toHaveLength(24);
    act(() => vi.advanceTimersByTime(1599));
    expect(view.container.querySelectorAll("span")).toHaveLength(24);
    act(() => vi.advanceTimersByTime(1));
    expect(view.container.childElementCount).toBe(0);
    view.rerender(<StrictMode><Confetti active /></StrictMode>);
    act(() => vi.advanceTimersByTime(2000));
    expect(view.container.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<StrictMode><Confetti active={false} /></StrictMode>);
    view.rerender(<StrictMode><Confetti active /></StrictMode>);
    expect(view.container.querySelectorAll("span")).toHaveLength(24);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels when deactivated or reduced motion changes, and suppresses reduced bursts", () => {
    reduced = true;
    const view = render(<Confetti active />);
    expect(view.container.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    changeMotion(false);
    expect(view.container.querySelectorAll("span")).toHaveLength(24);
    changeMotion(true);
    expect(view.container.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    changeMotion(false);
    view.rerender(<Confetti active={false} />);
    expect(view.container.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("StarReveal keyed count", () => {
  it("lights and sounds every 420ms only once, preserving the same rounded count", () => {
    const view = render(<StrictMode><StarReveal stars={2} /></StrictMode>);
    const lit = () => view.container.querySelectorAll("span.inline-block").length;
    expect(lit()).toBe(0);
    act(() => vi.advanceTimersByTime(419));
    expect(lit()).toBe(0);
    expect(playSfx).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(lit()).toBe(1);
    expect(playSfx).toHaveBeenCalledWith("star");
    view.rerender(<StrictMode><StarReveal stars={2.1} /></StrictMode>);
    expect(lit()).toBe(1);
    act(() => vi.advanceTimersByTime(420));
    expect(lit()).toBe(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(lit()).toBe(2);
    expect(playSfx).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clamps to 1–3, resets only for a new clamped count, and cleans up mid-reveal", () => {
    const view = render(<StarReveal stars={-10} />);
    act(() => vi.advanceTimersByTime(420));
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<StarReveal stars={0} />);
    expect(view.container.querySelectorAll("span.inline-block")).toHaveLength(1);
    view.rerender(<StarReveal stars={9} />);
    expect(view.container.querySelectorAll("span.inline-block")).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1260));
    expect(view.container.querySelectorAll("span.inline-block")).toHaveLength(3);
    expect(playSfx).toHaveBeenCalledTimes(4);
    view.rerender(<StarReveal stars={2} />);
    act(() => vi.advanceTimersByTime(420));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(playSfx).toHaveBeenCalledTimes(5);
  });
});
