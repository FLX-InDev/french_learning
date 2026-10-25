import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => function MockLottie({ src }: { src: { name: string } }) {
    return <span data-testid="lottie">{src.name}</span>;
  },
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

let Mascot: typeof import("./Mascot").Mascot;
let reduced = false;
let mediaEvents: EventTarget;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset();
  reduced = false;
  mediaEvents = new EventTarget();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return reduced; },
    addEventListener: (type: string, listener: EventListener) => mediaEvents.addEventListener(type, listener),
    removeEventListener: (type: string, listener: EventListener) => mediaEvents.removeEventListener(type, listener),
  })));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  ({ Mascot } = await import("./Mascot"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function response(name: string, status = 200) {
  return new Response(JSON.stringify({ name }), { status });
}
function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function changeMotion(value: boolean) {
  act(() => {
    reduced = value;
    mediaEvents.dispatchEvent(new Event("change"));
  });
}

describe("Mascot lazy mood cache", () => {
  it("keeps its dimensions and fallback while loading, then reuses cached data on remount", async () => {
    const request = deferredResponse();
    fetchMock.mockReturnValue(request.promise);
    const view = render(<Mascot size={120} className="mascot-test" />);
    const wrapper = view.container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("120px");
    expect(wrapper.style.height).toBe("120px");
    expect(wrapper.classList.contains("mascot-test")).toBe(true);
    expect(screen.getByLabelText("mascot.name")).toBeTruthy();
    expect(screen.queryByTestId("lottie")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/lottie/felix-idle.json");
    await act(async () => { request.resolve(response("idle")); });
    expect(screen.getByTestId("lottie").textContent).toBe("idle");
    view.rerender(<Mascot mood="idle" size={120} />);
    expect(fetchMock).toHaveBeenCalledOnce();
    view.unmount();
    render(<Mascot mood="idle" />);
    expect(screen.getByTestId("lottie").textContent).toBe("idle");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never shows old mood data while switching and ignores a late old request", async () => {
    const idle = deferredResponse();
    const happy = deferredResponse();
    const encourage = deferredResponse();
    fetchMock.mockReturnValueOnce(idle.promise).mockReturnValueOnce(happy.promise).mockReturnValueOnce(encourage.promise);
    const view = render(<Mascot mood="idle" />);
    view.rerender(<Mascot mood="happy" />);
    expect(screen.queryByTestId("lottie")).toBeNull();
    await act(async () => { happy.resolve(response("happy")); });
    expect(screen.getByTestId("lottie").textContent).toBe("happy");
    await act(async () => { idle.resolve(response("idle-late")); });
    expect(screen.getByTestId("lottie").textContent).toBe("happy");
    view.rerender(<Mascot mood="encourage" />);
    expect(screen.queryByTestId("lottie")).toBeNull();
    expect(screen.getByLabelText("mascot.name")).toBeTruthy();
    await act(async () => { encourage.resolve(response("encourage")); });
    expect(screen.getByTestId("lottie").textContent).toBe("encourage");
    view.rerender(<Mascot mood="happy" />);
    expect(screen.getByTestId("lottie").textContent).toBe("happy");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["network", "http"] as const)("falls back on %s failure, does not loop, and can load a different mood", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    else fetchMock.mockResolvedValueOnce(response("bad", 503));
    const view = render(<Mascot mood="idle" />);
    await act(async () => {});
    expect(screen.queryByTestId("lottie")).toBeNull();
    expect(screen.getByLabelText("mascot.name")).toBeTruthy();
    view.rerender(<Mascot mood="idle" />);
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(response("happy"));
    view.rerender(<Mascot mood="happy" />);
    await act(async () => {});
    expect(screen.getByTestId("lottie").textContent).toBe("happy");
    // Failures are not cached: a new idle attempt can recover.
    fetchMock.mockResolvedValueOnce(response("idle-recovered"));
    view.rerender(<Mascot mood="idle" />);
    await act(async () => {});
    expect(screen.getByTestId("lottie").textContent).toBe("idle-recovered");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ignores rejected requests after changing mood or unmounting", async () => {
    const idle = deferredResponse();
    const happy = deferredResponse();
    fetchMock.mockReturnValueOnce(idle.promise).mockReturnValueOnce(happy.promise);
    const view = render(<Mascot mood="idle" />);
    view.rerender(<Mascot mood="happy" />);
    await act(async () => { idle.reject(new Error("late failure")); });
    await act(async () => { happy.resolve(response("happy")); });
    expect(screen.getByTestId("lottie").textContent).toBe("happy");
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    view.rerender(<Mascot mood="encourage" />);
    view.unmount();
    await act(async () => { pending.reject(new Error("after unmount")); });
    expect(view.container.childElementCount).toBe(0);
  });

  it("stays static for reduced motion and switches dynamically without refetching cached data", async () => {
    reduced = true;
    fetchMock.mockResolvedValue(response("idle"));
    render(<Mascot />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("mascot.name")).toBeTruthy();
    changeMotion(false);
    await act(async () => {});
    expect(screen.getByTestId("lottie").textContent).toBe("idle");
    changeMotion(true);
    expect(screen.queryByTestId("lottie")).toBeNull();
    expect(screen.getByLabelText("mascot.name")).toBeTruthy();
    changeMotion(false);
    expect(screen.getByTestId("lottie").textContent).toBe("idle");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("renders a static server fallback even with a warm cache and hydrates without mismatch", async () => {
    fetchMock.mockResolvedValue(response("idle"));
    const warm = render(<Mascot />);
    await act(async () => {});
    expect(screen.getByTestId("lottie")).toBeTruthy();
    warm.unmount();
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Mascot />);
    expect(container.querySelector('[aria-label="mascot.name"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="lottie"]')).toBeNull();
    expect((container.firstElementChild as HTMLElement).style.width).toBe("96px");
    const recoverable = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Mascot />, { onRecoverableError: recoverable });
    });
    expect(container.querySelector('[data-testid="lottie"]')?.textContent).toBe("idle");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
