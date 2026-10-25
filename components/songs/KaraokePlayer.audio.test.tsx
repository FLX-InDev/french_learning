import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "@/components/AppStateProvider";
import { usePronunciationCheck } from "@/components/usePronunciationCheck";
import { I18nProvider, type Locale } from "@/lib/i18n";
import { translate } from "@/lib/i18nDict";
import { STATE_KEY, todayStr, type AppState } from "@/lib/workspace";
import type { Song } from "@/lib/contentTypes";
import type { SpeechRecognitionLike, SpeechRecognitionEventLike, SpeechRecognitionErrorEventLike } from "@/lib/speechRecognition";
import { KaraokePlayer } from "./KaraokePlayer";

const transport = vi.hoisted(() => ({
  generation: 0,
  pending: [] as (() => void)[],
  highlighted: [] as boolean[],
  speak: vi.fn(),
  cancel: vi.fn(),
  configure: vi.fn(),
  sfx: vi.fn(),
}));

// Keep the real pause/countdown, AppState persistence, ASR hook, scoring and playback loop.
vi.mock("@/lib/audioManager", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/audioManager")>(),
  speak: transport.speak,
  cancelSpeech: transport.cancel,
  speechGeneration: () => transport.generation,
  configureSpeech: transport.configure,
  playSfx: transport.sfx,
}));

class Recognition extends EventTarget implements SpeechRecognitionLike {
  static instances: Recognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  onstart: SpeechRecognitionLike["onstart"] = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    super();
    Recognition.instances.push(this);
  }
}

class SongTrack {
  static instances: SongTrack[] = [];
  currentTime = 0;
  duration = 50;
  onloadedmetadata: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  rejectPlay: (error: Error) => void = () => {};
  pause = vi.fn();
  play = vi.fn(() => new Promise<void>((_resolve, reject) => { this.rejectPlay = reject; }));
  constructor(public src: string) { SongTrack.instances.push(this); }
}

function resultEvent(text: string): SpeechRecognitionEventLike {
  const result = Object.assign([{ transcript: text, confidence: 1 }], { isFinal: true });
  return Object.assign(new Event("result"), {
    resultIndex: 0,
    results: [result] as unknown as SpeechRecognitionResultList,
  });
}

function errorEvent(error: string): SpeechRecognitionErrorEventLike {
  return Object.assign(new Event("error"), { error, message: error });
}

function song(id = "one", count = 5): Song {
  return {
    id, level: "L3", emoji: "", title: { zh: `${id}-title-zh`, en: `${id}-title-en`, fr: `${id}-title-fr` },
    lines: Array.from({ length: count }, (_, i) => ({
      zh: `${id}-zh-${i + 1}`, en: `${id}-en-${i + 1}`, fr: `${id}-fr-${i + 1}`, time: i * 10,
    })),
  };
}

function StateProbe() {
  const { state, update } = useAppState();
  return <>
    <output data-testid="points">{state?.points.total}</output>
    <output data-testid="used">{state?.screenTime.usedSec}</output>
    <button onClick={() => update((s) => ({ ...s, settings: { ...s.settings, speechRate: 0.75 } }))}>slower</button>
    <button onClick={() => update((s) => ({ ...s, taskFlags: { ...s.taskFlags, song_one: todayStr() } }))}>already rewarded</button>
  </>;
}

function View({ data, locale = "en" }: { data: Song; locale?: Locale }) {
  return <AppStateProvider><I18nProvider initialLocale={locale}>
    <StateProbe /><KaraokePlayer song={data} />
  </I18nProvider></AppStateProvider>;
}

function click(key: string, locale: Locale = "en", vars?: Record<string, string>) {
  fireEvent.click(screen.getByRole("button", { name: translate(key, vars, locale) }));
}

function active(text: string) {
  return screen.getByText(text).closest("button")!.classList.contains("border-purple-400");
}

async function finishUtterance() {
  expect(transport.pending).toHaveLength(1);
  await act(async () => { transport.pending.shift()!(); });
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function restartFrench() {
  click("karaoke.stop");
  click("karaoke.langFr");
  click("karaoke.play");
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 6, 12));
  window.localStorage.clear();
  vi.clearAllMocks();
  transport.generation = 0;
  transport.pending = [];
  transport.highlighted = [];
  transport.cancel.mockImplementation(() => {
    transport.generation++;
    transport.pending.splice(0).forEach((resolve) => resolve());
  });
  transport.speak.mockImplementation((text: string) => {
    transport.highlighted.push(active(text));
    return new Promise<void>((resolve) => transport.pending.push(resolve));
  });
  Recognition.instances = [];
  SongTrack.instances = [];
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal("Audio", SongTrack);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Karaoke playback sessions", () => {
  it("autoplays with the first line already highlighted, rotates three languages and completes", async () => {
    render(<View data={song("one", 2)} />);
    expect(transport.speak).toHaveBeenCalledTimes(1);
    expect(transport.speak).toHaveBeenLastCalledWith("one-zh-1", "zh");
    expect(transport.highlighted[0]).toBe(true);
    for (let line = 1; line <= 2; line++) {
      for (const lang of ["zh", "en", "fr"]) {
        expect(transport.speak).toHaveBeenLastCalledWith(`one-${lang}-${line}`, lang);
        expect(screen.getByText(`one-${lang}-${line}`).classList.contains("text-purple-700")).toBe(true);
        await finishUtterance();
      }
      await advance(800);
    }
    expect(transport.speak).toHaveBeenCalledTimes(6);
    expect(screen.getByText(translate("karaoke.singingDone", undefined, "en"))).toBeTruthy();
    expect(screen.getByTestId("points").textContent).toBe("5");
    expect(active("one-fr-2")).toBe(false);
  });

  it("does not replay on five-second persistence, copied song props, rate or locale changes", async () => {
    const data = song();
    const view = render(<View data={data} />);
    const cancellations = transport.cancel.mock.calls.length;
    await advance(5000);
    expect(screen.getByTestId("used").textContent).toBe("5");
    const saved = JSON.parse(window.localStorage.getItem(STATE_KEY)!) as AppState;
    expect(saved.screenTime.usedSec).toBe(5);
    view.rerender(<View data={{ ...data, lines: [...data.lines] }} locale="fr" />);
    fireEvent.click(screen.getByText("slower"));
    expect(transport.configure).toHaveBeenLastCalledWith(0.75);
    expect(transport.speak).toHaveBeenCalledTimes(1);
    expect(transport.cancel).toHaveBeenCalledTimes(cancellations);
    expect(active("one-zh-1")).toBe(true);
    await finishUtterance();
    expect(transport.speak).toHaveBeenLastCalledWith("one-en-1", "en");
  });

  it("uses the new language on the next line without interrupting the current rotation", async () => {
    render(<View data={song()} />);
    const cancellations = transport.cancel.mock.calls.length;
    click("karaoke.langFr");
    await finishUtterance();
    expect(transport.speak).toHaveBeenLastCalledWith("one-en-1", "en");
    await finishUtterance();
    await finishUtterance();
    await advance(799);
    expect(transport.speak).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(transport.speak).toHaveBeenLastCalledWith("one-fr-2", "fr");
    expect(transport.cancel).toHaveBeenCalledTimes(cancellations);
  });

  it("stops and skips immediately, discarding old completions and unmount continuations", async () => {
    const view = render(<View data={song()} />);
    const stale = transport.pending[0];
    click("karaoke.playLine", "en", { n: "3" });
    expect(active("one-zh-3")).toBe(true);
    await act(async () => { stale(); });
    expect(transport.speak).toHaveBeenCalledTimes(2);
    expect(transport.speak).toHaveBeenLastCalledWith("one-zh-3", "zh");
    click("karaoke.stop");
    await advance(10000);
    expect(active("one-zh-3")).toBe(false);
    expect(transport.speak).toHaveBeenCalledTimes(2);
    click("karaoke.play");
    view.unmount();
    await advance(10000);
    expect(transport.pending).toHaveLength(0);
    expect(transport.speak).toHaveBeenCalledTimes(3);
  });

  it("keeps language and sing-along preferences across songs while cancelling the old song", async () => {
    const view = render(<View data={song()} />);
    click("karaoke.langEn");
    click("karaoke.singAlong", "en", { on: "" });
    view.rerender(<View data={song("two")} />);
    await act(async () => {});
    expect(transport.pending).toHaveLength(1);
    expect(transport.speak).toHaveBeenLastCalledWith("two-en-1", "en");
    expect(active("two-en-1")).toBe(true);
    await finishUtterance();
    expect(screen.getByText("3")).toBeTruthy();
    await advance(3000);
    expect(Recognition.instances).toHaveLength(1);
  });

  it("awards at 80%, does not restart on the reward update, and is idempotent per song/day", async () => {
    const data = song();
    const view = render(<View data={data} />);
    await restartFrench();
    view.rerender(<View data={data} locale="fr" />);
    const baseline = transport.speak.mock.calls.length;
    for (let line = 1; line <= 5; line++) {
      await finishUtterance();
      expect(screen.getByTestId("points").textContent).toBe(line < 4 ? "0" : "5");
      await advance(800);
    }
    expect(transport.speak).toHaveBeenCalledTimes(baseline + 4);
    const saved = JSON.parse(window.localStorage.getItem(STATE_KEY)!) as AppState;
    expect(saved.points.history[0].reason).toBe(translate("karaoke.rewardListen", undefined, "fr"));
    click("karaoke.playLine", "fr", { n: "4" });
    await finishUtterance();
    expect(screen.getByTestId("points").textContent).toBe("5");
    view.rerender(<View data={song("two")} locale="fr" />);
    click("karaoke.playLine", "fr", { n: "4" });
    await finishUtterance();
    expect(screen.getByTestId("points").textContent).toBe("10");
    vi.setSystemTime(new Date(2026, 9, 7, 12));
    view.rerender(<View data={data} />);
    click("karaoke.playLine", "en", { n: "4" });
    await finishUtterance();
    expect(screen.getByTestId("points").textContent).toBe("15");
  });

  it("checks the latest task flags rather than the playback-start snapshot", async () => {
    render(<View data={song()} />);
    await restartFrench();
    fireEvent.click(screen.getByText("already rewarded"));
    click("karaoke.playLine", "en", { n: "4" });
    await finishUtterance();
    expect(screen.getByTestId("points").textContent).toBe("0");
  });

  it.each([["one-fr-1", "correct"], ["unrelated words", "encourage"]])(
    "waits three real seconds, scores once with %s, plays %s and cancels ASR on stop", async (transcript, sfx) => {
    render(<View data={song()} />);
    await restartFrench();
    click("karaoke.singAlong", "en", { on: "" });
    await finishUtterance();
    expect(screen.getByText("3")).toBeTruthy();
    await advance(1000);
    expect(screen.getByText("2")).toBeTruthy();
    await advance(1000);
    expect(screen.getByText("1")).toBeTruthy();
    expect(Recognition.instances).toHaveLength(0);
    await advance(1000);
    const rec = Recognition.instances[0];
    expect(rec.lang).toBe("fr-FR");
    expect(rec.start).toHaveBeenCalledTimes(1);
    const callback = rec.onresult!;
    act(() => callback(resultEvent(transcript)));
    act(() => callback(resultEvent(transcript)));
    expect(transport.sfx).toHaveBeenCalledTimes(1);
    expect(transport.sfx).toHaveBeenLastCalledWith(sfx);
    await advance(4999);
    expect(transport.speak).toHaveBeenLastCalledWith("one-fr-1", "fr");
    await advance(1);
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(transport.speak).toHaveBeenLastCalledWith("one-fr-2", "fr");
    await finishUtterance();
    await advance(3000);
    const second = Recognition.instances[1];
    const late = second.onresult!;
    click("karaoke.stop");
    expect(second.abort).toHaveBeenCalledTimes(1);
    act(() => late(resultEvent("one-fr-2")));
    await advance(10000);
    expect(transport.sfx).toHaveBeenCalledTimes(1);
    expect(transport.speak).toHaveBeenCalledTimes(3);
  });

  it("does not start ASR after stopping during the countdown", async () => {
    render(<View data={song()} />);
    await restartFrench();
    click("karaoke.singAlong", "en", { on: "" });
    await finishUtterance();
    await advance(1000);
    click("karaoke.stop");
    await advance(10000);
    expect(Recognition.instances).toHaveLength(0);
    expect(screen.queryByText("2")).toBeNull();
  });

  it.each(["skip", "song", "unmount"])("cancels ASR and stale scoring callbacks on %s", async (action) => {
    const view = render(<View data={song()} />);
    await restartFrench();
    click("karaoke.singAlong", "en", { on: "" });
    await finishUtterance();
    await advance(3000);
    const rec = Recognition.instances[0];
    const late = rec.onresult!;
    if (action === "skip") click("karaoke.playLine", "en", { n: "3" });
    else if (action === "song") view.rerender(<View data={song("two")} />);
    else view.unmount();
    expect(rec.abort).toHaveBeenCalledTimes(1);
    act(() => late(resultEvent("one-fr-1")));
    const calls = transport.speak.mock.calls.length;
    await advance(10000);
    expect(transport.sfx).not.toHaveBeenCalled();
    expect(transport.speak).toHaveBeenCalledTimes(calls);
    expect(transport.pending).toHaveLength(action === "unmount" ? 0 : 1);
  });

  it("follows media timestamps, seeks on row clicks and awards only once", async () => {
    const data = { ...song(), audio: "/song.mp3" };
    const view = render(<View data={data} />);
    const first = SongTrack.instances[0];
    expect(first.src).toBe("/song.mp3");
    expect(first.play).toHaveBeenCalledTimes(1);
    expect(active("one-zh-1")).toBe(true);
    expect(transport.speak).not.toHaveBeenCalled();
    act(() => { first.currentTime = 30; first.ontimeupdate?.(); });
    expect(active("one-zh-4")).toBe(true);
    expect(screen.getByTestId("points").textContent).toBe("0");
    await advance(5000);
    view.rerender(<View data={{ ...data }} locale="fr" />);
    expect(SongTrack.instances).toHaveLength(1);
    act(() => { first.currentTime = 40; first.ontimeupdate?.(); first.ontimeupdate?.(); });
    expect(screen.getByTestId("points").textContent).toBe("5");
    const late = first.ontimeupdate!;
    click("karaoke.playLine", "fr", { n: "3" });
    expect(first.pause).toHaveBeenCalledTimes(1);
    const second = SongTrack.instances[1];
    act(() => second.onloadedmetadata?.());
    expect(second.currentTime).toBe(20);
    expect(active("one-zh-3")).toBe(true);
    act(() => late());
    expect(active("one-zh-3")).toBe(true);
    act(() => { second.currentTime = 45; second.ontimeupdate?.(); second.onended?.(); });
    expect(screen.getByTestId("points").textContent).toBe("5");
    expect(screen.getByText(translate("karaoke.singingDone", undefined, "fr"))).toBeTruthy();
    view.unmount();
    expect(second.pause).toHaveBeenCalledTimes(1);
  });

  it("handles autoplay rejection and ignores rejected/late media callbacks after stop under StrictMode", async () => {
    render(<StrictMode><View data={{ ...song(), audio: "/song.mp3" }} /></StrictMode>);
    const [disposed, current] = SongTrack.instances;
    expect(disposed.pause).toHaveBeenCalledTimes(1);
    expect(disposed.ontimeupdate).toBeNull();
    await act(async () => disposed.rejectPlay(new Error("cancelled")));
    expect(active("one-zh-1")).toBe(true);
    await act(async () => current.rejectPlay(new Error("autoplay denied")));
    expect(active("one-zh-1")).toBe(false);
    click("karaoke.play");
    const retry = SongTrack.instances[2];
    const late = retry.ontimeupdate!;
    click("karaoke.stop");
    act(() => { retry.currentTime = 45; late(); });
    await act(async () => retry.rejectPlay(new Error("stopped")));
    expect(retry.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("points").textContent).toBe("0");
    expect(active("one-zh-5")).toBe(false);
  });

  it("leaves an empty song idle rather than starting an invalid utterance", () => {
    render(<View data={song("empty", 0)} />);
    expect(transport.speak).not.toHaveBeenCalled();
    click("karaoke.play");
    expect(transport.speak).not.toHaveBeenCalled();
  });

  it("survives StrictMode setup/cleanup with only one live loop and one reward", async () => {
    render(<StrictMode><View data={song("one", 1)} /></StrictMode>);
    await act(async () => {});
    expect(transport.pending).toHaveLength(1);
    expect(transport.highlighted.every(Boolean)).toBe(true);
    const count = transport.speak.mock.calls.length;
    await finishUtterance();
    await finishUtterance();
    await finishUtterance();
    await advance(800);
    expect(transport.speak).toHaveBeenCalledTimes(count + 2);
    expect(screen.getByTestId("points").textContent).toBe("5");
    expect(transport.pending).toHaveLength(0);
  });
});

describe("ASR lifecycle and current locale callbacks", () => {
  it("keeps start stable across locale changes and translates late errors in the committed locale", () => {
    let locale: Locale = "en";
    const view = renderHook(() => usePronunciationCheck(), {
      wrapper: ({ children }) => <I18nProvider initialLocale={locale}>{children}</I18nProvider>,
    });
    const start = view.result.current.start;
    act(() => start("bonjour", "fr", "L3"));
    locale = "fr";
    view.rerender();
    expect(view.result.current.start).toBe(start);
    const rec = Recognition.instances[0];
    act(() => rec.onerror!(errorEvent("network")));
    expect(view.result.current.msg).toBe(translate("workspace.asrNetwork", undefined, "fr"));
    expect(rec.abort).not.toHaveBeenCalled();
  });

  it("aborts on reset/unmount, ignores old results, and stops a late microphone permission stream", async () => {
    let grant: (stream: MediaStream) => void = () => {};
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", vi.fn());
    const view = renderHook(() => usePronunciationCheck());
    const scored = vi.fn();
    act(() => view.result.current.start("bonjour", "fr", "L3", scored));
    const rec = Recognition.instances[0];
    const late = rec.onresult!;
    act(() => view.result.current.reset());
    expect(rec.abort).toHaveBeenCalledTimes(1);
    act(() => late(resultEvent("bonjour")));
    expect(scored).not.toHaveBeenCalled();
    expect(view.result.current.state).toBe("idle");
    const stop = vi.fn();
    await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledTimes(1);
    act(() => view.result.current.start("salut", "fr", "L3"));
    view.unmount();
    expect(Recognition.instances[1].abort).toHaveBeenCalledTimes(1);
  });
});
