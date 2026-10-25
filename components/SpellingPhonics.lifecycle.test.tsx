import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PhonicsCardView } from "./PhonicsCardView";
import { SpellingAttempt } from "./SpellingBoard";
import { cancelSpeech, configureSpeech, playSfx, speak } from "@/lib/audioManager";
import { createInitialState, type AppState } from "@/lib/workspace";
import type { PhonicsCard } from "@/lib/phonics";
import type { SpellingWord } from "@/lib/spelling";

vi.mock("@/lib/audioManager", () => ({
  cancelSpeech: vi.fn(),
  configureSpeech: vi.fn(),
  playSfx: vi.fn(),
  speak: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/AppStateProvider", () => ({
  useAppState: () => ({ state, update }),
}));

let state: AppState;
const update = vi.fn((fn: (s: AppState) => AppState) => { state = fn(state); });
const card: PhonicsCard = {
  id: "bonjour", parts: ["bon", "jour"], whole: "bonjour", lang: "fr", level: "L3",
};
const word: SpellingWord = {
  id: "chat", fr: "chat", zh: "cat-zh", en: "cat", emoji: "", source: "word",
};

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialState("L3");
});
afterEach(cleanup);

function phonicsTile(part: string) {
  return screen.getAllByRole("button", { name: part })
    .find((button) => !button.closest('[role="group"]'))!;
}
function spellingTile(part: string) {
  return within(screen.getByRole("group", { name: "spelling.tiles" })).getByText(part);
}

describe("PhonicsCardView keyed attempt", () => {
  it("preserves a partial answer for the same ID and resets safely for a shorter new card", () => {
    const onSolved = vi.fn();
    const view = render(<PhonicsCardView card={card} onSolved={onSolved} />);
    fireEvent.click(phonicsTile("bon"));
    expect(screen.getByText("1/2")).toBeTruthy();
    view.rerender(<PhonicsCardView card={{ ...card }} onSolved={onSolved} compact />);
    expect(screen.getByText("1/2")).toBeTruthy();
    view.rerender(<PhonicsCardView card={{ ...card, id: "other", parts: ["chat"], whole: "chat" }} onSolved={onSolved} />);
    expect(screen.getByText("0/1")).toBeTruthy();
    expect(onSolved).not.toHaveBeenCalled();
    fireEvent.click(phonicsTile("chat"));
    expect(onSolved.mock.calls).toEqual([[true]]);
  });

  it("keeps scoring locked on same ID, resets checked on new ID, and preserves reading", () => {
    const onSolved = vi.fn();
    const view = render(<PhonicsCardView card={card} onSolved={onSolved} />);
    fireEvent.click(screen.getByRole("button", { name: "phonics.play" }));
    expect(cancelSpeech).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith("bonjour", "fr");
    fireEvent.click(phonicsTile("bon"));
    fireEvent.click(phonicsTile("jour"));
    expect(onSolved.mock.calls).toEqual([[true]]);
    expect(playSfx).toHaveBeenCalledWith("correct");
    view.rerender(<PhonicsCardView card={{ ...card }} onSolved={onSolved} />);
    expect(screen.getByText("phonics.correct")).toBeTruthy();
    fireEvent.click(phonicsTile("jour"));
    expect(onSolved).toHaveBeenCalledOnce();
    view.rerender(<PhonicsCardView card={{ ...card, id: "new" }} onSolved={onSolved} />);
    expect(screen.queryByText("phonics.correct")).toBeNull();
    expect(screen.getByText("0/2")).toBeTruthy();
  });

  it("retains wrong-answer feedback and retry", () => {
    const onSolved = vi.fn();
    render(<PhonicsCardView card={card} onSolved={onSolved} />);
    fireEvent.click(phonicsTile("jour"));
    fireEvent.click(phonicsTile("bon"));
    expect(onSolved.mock.calls).toEqual([[false]]);
    expect(playSfx).toHaveBeenCalledWith("encourage");
    fireEvent.click(screen.getByRole("button", { name: "phonics.retry" }));
    expect(screen.getByText("0/2")).toBeTruthy();
  });
});

describe("SpellingAttempt keyed attempt", () => {
  it("keeps placed tiles for same ID and clears them for a different ID", () => {
    const onResult = vi.fn();
    const view = render(<SpellingAttempt word={word} onResult={onResult} />);
    fireEvent.click(spellingTile("c"));
    view.rerender(<SpellingAttempt word={{ ...word }} onResult={onResult} compact />);
    expect(within(screen.getByRole("group", { name: "spelling.answerSlot" })).getByText("c")).toBeTruthy();
    view.rerender(<SpellingAttempt word={{ ...word, id: "a", fr: "a" }} onResult={onResult} />);
    expect(within(screen.getByRole("group", { name: "spelling.answerSlot" })).queryByText("c")).toBeNull();
    expect((screen.getByRole("button", { name: "spelling.remaining" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("preserves reading, scoring, progress and checked state until ID changes", () => {
    state.misspelled = [word.id];
    const onResult = vi.fn();
    const view = render(<SpellingAttempt word={word} onResult={onResult} />);
    expect(configureSpeech).toHaveBeenCalledWith(0.9);
    fireEvent.click(screen.getByRole("button", { name: "spelling.playFrench" }));
    expect(cancelSpeech).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith("chat", "fr");
    for (const ch of word.fr) fireEvent.click(spellingTile(ch));
    fireEvent.click(screen.getByRole("button", { name: "spelling.check" }));
    expect(onResult.mock.calls).toEqual([[true]]);
    expect(playSfx).toHaveBeenCalledWith("correct");
    expect(state.wordProgress[word.id]).toBe("correct");
    expect(state.misspelled).toEqual([]);
    view.rerender(<SpellingAttempt word={{ ...word }} onResult={onResult} />);
    expect(screen.getByText("spelling.spelledCorrectly")).toBeTruthy();
    view.rerender(<SpellingAttempt word={{ ...word, id: "new" }} onResult={onResult} />);
    expect(screen.queryByText("spelling.spelledCorrectly")).toBeNull();
    expect(screen.getByRole("button", { name: "spelling.remaining" })).toBeTruthy();
    expect(onResult).toHaveBeenCalledOnce();
  });

  it("retains wrong-answer retry and does not mark incorrect spelling as collected", () => {
    const onResult = vi.fn();
    render(<SpellingAttempt word={word} onResult={onResult} />);
    for (const ch of "tahc") fireEvent.click(spellingTile(ch));
    fireEvent.click(screen.getByRole("button", { name: "spelling.check" }));
    expect(onResult.mock.calls).toEqual([[false]]);
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "spelling.tryAgain" }));
    expect(screen.getByRole("button", { name: "spelling.remaining" })).toBeTruthy();
  });
});
