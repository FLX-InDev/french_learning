import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, type Locale } from "@/lib/i18n";
import { translate } from "@/lib/i18nDict";
import PlayButton from "./PlayButton";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class Utterance {
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

class Track {
  static instances: Track[] = [];
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  currentTime = 0;
  play = vi.fn(async () => { this.onplay?.(); });
  constructor(public url: string) { Track.instances.push(this); }
}

const synth = {
  cancel: vi.fn(), getVoices: vi.fn(() => []), speak: vi.fn<(u: Utterance) => void>(),
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
};
const fetchMock = vi.fn<typeof fetch>();

function View({ locale }: { locale: Locale }) {
  return <I18nProvider initialLocale={locale}><PlayButton text="bonjour" lang="fr" /></I18nProvider>;
}

function clickPlay() { fireEvent.click(screen.getByRole("button")); }

async function settle() { await act(async () => {}); }

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  Track.instances = [];
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("Audio", Track);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:test");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PlayButton committed locale callbacks", () => {
  it("fetches config once across locale changes and logs the latest locale when it resolves", async () => {
    const config = deferred<Response>();
    fetchMock.mockReturnValue(config.promise);
    const view = render(<View locale="en" />);
    view.rerender(<View locale="fr" />);
    await act(async () => config.resolve(new Response(JSON.stringify({ provider: "webspeech" }))));
    view.rerender(<View locale="zh" />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/tts/config");
    expect(console.log).toHaveBeenLastCalledWith(`[PlayButton] ${translate("playbutton.ttsProviderWebSpeech", undefined, "fr")}`);
  });

  it("translates a late config failure without refetching", async () => {
    const config = deferred<Response>();
    fetchMock.mockReturnValue(config.promise);
    const view = render(<View locale="en" />);
    view.rerender(<View locale="zh" />);
    await act(async () => config.reject(new Error("offline")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenLastCalledWith(`[PlayButton] ${translate("playbutton.ttsConfigError", undefined, "zh")}`);
  });

  it("does not cancel active Web Speech on locale changes; existing error callbacks use the new locale", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ provider: "webspeech" })));
    const view = render(<View locale="en" />);
    await settle();
    clickPlay();
    const utterance = synth.speak.mock.calls[0][0];
    act(() => utterance.onstart?.());
    const cancellations = synth.cancel.mock.calls.length;
    view.rerender(<View locale="fr" />);
    expect(synth.cancel).toHaveBeenCalledTimes(cancellations);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    act(() => utterance.onerror?.({ error: "network" }));
    expect(console.warn).toHaveBeenLastCalledWith(`[PlayButton] ${translate("playbutton.webspeechError", undefined, "fr")}:`, "network");
    clickPlay();
    expect(synth.speak).toHaveBeenCalledTimes(2);
  });

  it.each(["response", "exception"] as const)("uses the current locale for a late backend %s failure", async (failure) => {
    const response = deferred<Response>();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ provider: "cloud", available: true })))
      .mockReturnValueOnce(response.promise);
    const view = render(<View locale="en" />);
    await settle();
    clickPlay();
    view.rerender(<View locale="fr" />);
    const error = new Error("offline");
    await act(async () => {
      if (failure === "response") response.resolve(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
      else response.reject(error);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (failure === "response") {
      expect(console.error).toHaveBeenLastCalledWith(`[PlayButton] ${translate("playbutton.requestFailed", undefined, "fr")}`, 503, "unavailable");
    } else {
      expect(console.error).toHaveBeenLastCalledWith(`[PlayButton] ${translate("playbutton.callError", undefined, "fr")}:`, error);
    }
  });

  it("keeps backend audio playing during locale changes and localizes its later error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ provider: "cloud", available: true })))
      .mockResolvedValueOnce(new Response("audio"));
    const view = render(<View locale="en" />);
    await settle();
    clickPlay();
    await settle();
    const track = Track.instances[0];
    expect(track.play).toHaveBeenCalledTimes(1);
    view.rerender(<View locale="fr" />);
    expect(track.pause).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => track.onerror?.());
    expect(console.warn).toHaveBeenLastCalledWith(`[PlayButton] ${translate("playbutton.audioPlayError", undefined, "fr")}`);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
