import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaylist, type LangMode } from "./usePlaylist";
import type { Language } from "@/lib/voiceConfig";

const transport = vi.hoisted(() => ({
  generation: 0,
  pending: [] as (() => void)[],
  speak: vi.fn(), cancel: vi.fn(), configure: vi.fn(),
}));
vi.mock("@/lib/audioManager", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/audioManager")>(),
  speak: transport.speak,
  cancelSpeech: transport.cancel,
  speechGeneration: () => transport.generation,
  configureSpeech: transport.configure,
}));

function buildItems(index: number, mode: LangMode) {
  const languages: Language[] = mode === "all" ? ["zh", "en", "fr"] : ["fr"];
  return languages.map((lang) => ({ text: `${index}-${lang}`, lang }));
}
function useTestPlaylist() { return usePlaylist({ count: 3, buildItems, gapMs: 400, speechRate: 0.9 }); }
async function finish() { await act(async () => { transport.pending.shift()!(); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  transport.generation = 0;
  transport.pending = [];
  transport.speak.mockImplementation(() => new Promise<void>((resolve) => transport.pending.push(resolve)));
  transport.cancel.mockImplementation(() => {
    transport.generation++;
    transport.pending.splice(0).forEach((resolve) => resolve());
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("usePlaylist event-driven language changes", () => {
  it("does not cancel on mount or a same-value selection; changing language stops immediately", async () => {
    const { result } = renderHook(useTestPlaylist);
    expect(transport.cancel).not.toHaveBeenCalled();
    act(() => result.current.start());
    const cancellations = transport.cancel.mock.calls.length;
    act(() => result.current.setLangMode("fr"));
    expect(result.current.playing).toBe(true);
    expect(result.current.activeIndex).toBe(0);
    expect(transport.cancel).toHaveBeenCalledTimes(cancellations);
    act(() => result.current.setLangMode("all"));
    expect(result.current.playing).toBe(false);
    expect(result.current.activeIndex).toBeNull();
    expect(result.current.langMode).toBe("all");
    await advance(1000);
    expect(transport.speak).toHaveBeenCalledTimes(1);
    act(() => result.current.start(1));
    expect(transport.speak).toHaveBeenLastCalledWith("1-zh", "zh");
    await finish();
    expect(transport.speak).toHaveBeenLastCalledWith("1-en", "en");
    await finish();
    expect(transport.speak).toHaveBeenLastCalledWith("1-fr", "fr");
    await finish();
    await advance(400);
    expect(transport.speak).toHaveBeenLastCalledWith("2-zh", "zh");
  });

  it("does not let a cancelled run clear the replacement run's active row", async () => {
    const { result } = renderHook(useTestPlaylist);
    act(() => result.current.start());
    const stale = transport.pending[0];
    act(() => result.current.toggle(2));
    await act(async () => { stale(); });
    expect(result.current.activeIndex).toBe(2);
    expect(result.current.playing).toBe(true);
    expect(transport.speak).toHaveBeenLastCalledWith("2-fr", "fr");
    await finish();
    await advance(400);
    expect(result.current.activeIndex).toBeNull();
    expect(result.current.playing).toBe(false);
  });

  it("honors external generation cancellation and stop during a real inter-line pause", async () => {
    const { result } = renderHook(useTestPlaylist);
    act(() => result.current.start());
    transport.generation++;
    await finish();
    expect(result.current.playing).toBe(false);
    expect(transport.speak).toHaveBeenCalledTimes(1);
    act(() => result.current.start());
    await finish();
    act(() => result.current.stop());
    await advance(400);
    expect(result.current.activeIndex).toBeNull();
    expect(transport.speak).toHaveBeenCalledTimes(2);
  });

  it("keeps one live run under StrictMode and cancels on unmount", async () => {
    const view = renderHook(useTestPlaylist, {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    act(() => view.result.current.start());
    const cancellations = transport.cancel.mock.calls.length;
    view.rerender();
    expect(transport.cancel).toHaveBeenCalledTimes(cancellations);
    expect(transport.pending).toHaveLength(1);
    view.unmount();
    await advance(1000);
    expect(transport.pending).toHaveLength(0);
    expect(transport.speak).toHaveBeenCalledTimes(1);
  });
});
