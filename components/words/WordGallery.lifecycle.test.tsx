import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WordGallery } from "./WordGallery";
import { cancelSpeech, pause, speak } from "@/lib/audioManager";
import { createInitialState, type AppState } from "@/lib/workspace";
import type { Word } from "@/lib/contentTypes";
import type { ReactNode } from "react";

vi.mock("@/lib/audioManager", () => ({
  configureSpeech: vi.fn(), cancelSpeech: vi.fn(), playSfx: vi.fn(),
  speak: vi.fn(), pause: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, string>) => params ? `${key} ${Object.values(params).join(" ")}` : key,
  }),
  localizedHref: (_locale: string, path: string) => path,
}));
vi.mock("@/components/AppStateProvider", () => ({
  useAppState: () => ({ state, update }),
}));
vi.mock("@/components/celebrate", () => ({
  PopIn: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));
vi.mock("@/lib/speechRecognition", () => ({
  getSpeechRecognitionCtor: () => Recognition,
  isSpeechRecognitionSupported: () => true,
}));

let state: AppState;
let pendingSpeech: Array<() => void>;
let recognitions: Recognition[];
class Recognition {
  start = vi.fn();
  abort = vi.fn();
  constructor() { recognitions.push(this); }
}
const update = vi.fn((fn: (s: AppState) => AppState) => { state = fn(state); });
const words: Word[] = [
  { id: "cat", fr: "chat", zh: "cat-zh", en: "cat", category: "animals", level: null, emoji: "" },
  { id: "dog", fr: "chien", zh: "dog-zh", en: "dog", category: "animals", level: null, emoji: "" },
  { id: "bread", fr: "pain", zh: "bread-zh", en: "bread", category: "food", level: "L3", emoji: "" },
  { id: "apple", fr: "pomme", zh: "apple-zh", en: "apple", category: "fruit", level: "L4", emoji: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  state = createInitialState("L3");
  pendingSpeech = [];
  recognitions = [];
  vi.mocked(speak).mockImplementation(() => new Promise<void>((resolve) => pendingSpeech.push(resolve)));
  vi.mocked(pause).mockImplementation((ms) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function openCat() {
  fireEvent.click(screen.getByRole("button", { name: /^words.cardAria cat-zh/ }));
}
function autoplay() {
  fireEvent.click(screen.getByRole("button", { name: "words.listenEar" }));
}
async function finishSpeech() {
  expect(pendingSpeech.length).toBeGreaterThan(0);
  await act(async () => { pendingSpeech.shift()!(); });
}
async function finishCard() {
  await finishSpeech();
  await finishSpeech();
  await finishSpeech();
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe("WordGallery keyed level", () => {
  it("keeps category, deck and face at the same level; new level resets all and stops audio/recognition", async () => {
    state.wordProgress = { cat: "correct" };
    const view = render(<WordGallery words={words} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    const animals = screen.getByRole("button", { name: "animals（1/2）" });
    fireEvent.click(animals);
    openCat();
    fireEvent.click(screen.getByRole("button", { name: "words.flipAria cat-zh" }));
    fireEvent.click(screen.getByRole("button", { name: "words.readAlong" }));
    expect(recognitions[0].start).toHaveBeenCalledOnce();
    autoplay();
    state = { ...state, profile: { ...state.profile }, points: { ...state.points, total: 4 } };
    view.rerender(<WordGallery words={words} />);
    expect(animals.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "words.readAlong" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "words.listenEar" }).getAttribute("aria-pressed")).toBe("true");
    expect(speak).toHaveBeenCalledTimes(1);
    state = { ...state, profile: { ...state.profile, level: "L4" } };
    view.rerender(<WordGallery words={words} />);
    expect(screen.queryByRole("button", { name: "words.closeCard" })).toBeNull();
    expect(screen.getByRole("button", { name: /^words.all/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("pain")).toBeNull();
    expect(screen.getByText("pomme")).toBeTruthy();
    expect(cancelSpeech).toHaveBeenCalled();
    expect(recognitions[0].abort).toHaveBeenCalled();
    await finishSpeech();
    expect(speak).toHaveBeenCalledTimes(1);
    openCat();
    expect(screen.getByRole("button", { name: "words.listenEar" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "words.flipAria cat-zh" })).toBeTruthy();
  });

  it("retains flipping, status upgrades, manual next/previous, and category filtering", () => {
    const view = render(<WordGallery words={words} />);
    openCat();
    fireEvent.click(screen.getByRole("button", { name: "words.flipAria cat-zh" }));
    expect(state.wordProgress.cat).toBe("flipped");
    fireEvent.click(screen.getByRole("button", { name: "words.playEnglish" }));
    expect(speak).toHaveBeenLastCalledWith("cat", "en");
    expect(state.wordProgress.cat).toBe("flipped");
    fireEvent.click(screen.getByRole("button", { name: "words.next" }));
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "words.flipAria dog-zh" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "words.previous" }));
    expect(screen.getByText("1 / 3")).toBeTruthy();
    view.rerender(<WordGallery words={words} />);
    expect(screen.getByRole("button", { name: "animals（1/2）" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "food（0/1）" }));
    expect(screen.queryByRole("button", { name: "words.closeCard" })).toBeNull();
    expect(screen.queryByText("chat")).toBeNull();
    expect(screen.getByText("pain")).toBeTruthy();
  });
});

describe("WordGallery autoplay session", () => {
  it("cycles all three languages, advances committed indices and wraps without restarting on state updates", async () => {
    const view = render(<WordGallery words={words} />);
    openCat();
    autoplay();
    expect(speak).toHaveBeenLastCalledWith("cat-zh", "zh");
    await finishCard();
    expect(vi.mocked(speak).mock.calls).toEqual([["cat-zh", "zh"], ["cat", "en"], ["chat", "fr"]]);
    expect(state.wordProgress.cat).toBe("heard");
    view.rerender(<WordGallery words={words} />);
    expect(speak).toHaveBeenCalledTimes(3);
    await advance(800);
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(speak).toHaveBeenCalledTimes(3);
    await advance(1400);
    expect(speak).toHaveBeenLastCalledWith("dog-zh", "zh");
    await finishCard();
    expect(state.wordProgress.dog).toBe("heard");
    await advance(800);
    expect(screen.getByText("3 / 3")).toBeTruthy();
    await advance(1400);
    expect(speak).toHaveBeenLastCalledWith("bread-zh", "zh");
    await finishCard();
    await advance(800);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    await advance(1400);
    expect(speak).toHaveBeenLastCalledWith("cat-zh", "zh");
    expect(speak).toHaveBeenCalledTimes(10);
    expect(cancelSpeech).not.toHaveBeenCalled();
    autoplay();
    await finishSpeech();
    expect(speak).toHaveBeenCalledTimes(10);
  });

  it.each([0, 1, 2])("stops mid-language after %i completed utterances and never continues or scores", async (completed) => {
    render(<WordGallery words={words} />);
    openCat();
    autoplay();
    for (let n = 0; n < completed; n++) await finishSpeech();
    autoplay();
    expect(cancelSpeech).toHaveBeenCalledOnce();
    await finishSpeech();
    await advance(5000);
    expect(speak).toHaveBeenCalledTimes(completed + 1);
    expect(state.wordProgress).toEqual({});
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("does not restart for manual steps and reads the committed card after the inter-card pause", async () => {
    render(<WordGallery words={words} />);
    openCat();
    autoplay();
    await finishCard();
    await advance(800);
    expect(screen.getByText("2 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "words.next" }));
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(speak).toHaveBeenCalledTimes(3);
    await advance(1400);
    expect(speak).toHaveBeenLastCalledWith("bread-zh", "zh");
    expect(cancelSpeech).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "words.closeCard" }));
    await finishSpeech();
    expect(speak).toHaveBeenCalledTimes(4);
    expect(cancelSpeech).toHaveBeenCalledOnce();
  });

  it.each([0, 800])("cancels during the pause at offset %ims without another card or speech", async (offset) => {
    render(<WordGallery words={words} />);
    openCat();
    autoplay();
    await finishCard();
    await advance(offset);
    const index = offset === 0 ? "1 / 3" : "2 / 3";
    autoplay();
    await advance(5000);
    expect(screen.getByText(index)).toBeTruthy();
    expect(speak).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses changed list content rather than stale closures even if list length is unchanged", async () => {
    const view = render(<WordGallery words={words} />);
    openCat();
    autoplay();
    view.rerender(<WordGallery words={words.map((word) => ({ ...word, zh: `${word.zh}-updated` }))} />);
    expect(speak).toHaveBeenLastCalledWith("cat-zh-updated", "zh");
    expect(cancelSpeech).toHaveBeenCalledOnce();
    await finishSpeech();
    expect(speak).toHaveBeenCalledTimes(2);
    await finishSpeech();
    expect(speak).toHaveBeenLastCalledWith("cat", "en");
  });

  it("stops autoplay and recognition on unmount, including late speech completion", async () => {
    const view = render(<WordGallery words={words} />);
    openCat();
    fireEvent.click(screen.getByRole("button", { name: "words.flipAria cat-zh" }));
    fireEvent.click(screen.getByRole("button", { name: "words.readAlong" }));
    autoplay();
    view.unmount();
    expect(recognitions[0].abort).toHaveBeenCalledOnce();
    expect(cancelSpeech).toHaveBeenCalled();
    await finishSpeech();
    await advance(5000);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(state.wordProgress.cat).toBe("flipped");
  });

  it("also cancels a manual pronunciation when unmounted outside autoplay", () => {
    const view = render(<WordGallery words={words} />);
    openCat();
    fireEvent.click(screen.getByRole("button", { name: "words.playFrench" }));
    expect(speak).toHaveBeenCalledWith("chat", "fr");
    vi.mocked(cancelSpeech).mockClear();
    view.unmount();
    expect(cancelSpeech).toHaveBeenCalledOnce();
  });
});
