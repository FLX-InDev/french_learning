import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sentence } from "@/lib/parser";
import type { Level } from "@/lib/levels";
import en from "@/translations/en.json";
import fr from "@/translations/fr.json";
import zh from "@/translations/zh.json";
import { SentenceList } from "./SentenceList";

const app = vi.hoisted(() => ({
  level: "L3" as Level,
  hiddenContent: [] as string[],
  speechRate: 0.9,
  locale: "en" as "en" | "fr" | "zh",
}));

const audio = vi.hoisted(() => ({
  generation: 0,
  pending: [] as (() => void)[],
  rendered: [] as string[],
  speak: vi.fn(),
  cancelSpeech: vi.fn(),
  configureSpeech: vi.fn(),
  pause: vi.fn(),
}));

vi.mock("@/components/AppStateProvider", () => ({
  useAppState: () => ({
    state: {
      profile: { level: app.level },
      settings: {
        hiddenContent: app.hiddenContent,
        speechRate: app.speechRate,
      },
    },
  }),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, vars: Record<string, string> = {}) => {
      const dictionaries: Record<string, Record<string, string>> = { en, fr, zh };
      return (dictionaries[app.locale][key] ?? key).replace(
        /\{(\w+)\}/g,
        (match, name: string) => vars[name] ?? match
      );
    },
  }),
}));

// Exercise the real usePlaylist loop; only the audio transport is mocked.
vi.mock("@/lib/audioManager", () => ({
  speak: audio.speak,
  cancelSpeech: audio.cancelSpeech,
  configureSpeech: audio.configureSpeech,
  pause: audio.pause,
  speechGeneration: () => audio.generation,
}));

vi.mock("@/components/PlayButton", async () => {
  const { useEffect } = await import("react");
  return {
    default: function MockPlayButton({ text, lang }: { text: string; lang: string }) {
      audio.rendered.push(text);
      useEffect(() => () => {
        // Real PlayButton unmounts cancel browser speech (without incrementing
        // audioManager's generation). Page changes must finish cleanup before
        // the playlist starts speaking the first sentence on the next page.
        audio.pending.splice(0).forEach((resolve) => resolve());
      }, []);
      return <button type="button" aria-label={`Read ${lang}: ${text}`} />;
    },
  };
});

function sentences(count: number, prefix = "sentence", overrides: Partial<Sentence> = {}): Sentence[] {
  return Array.from({ length: count }, (_, i) => ({
    zh: `${prefix}-zh-${i + 1}`,
    en: `${prefix}-en-${i + 1}`,
    fr: `${prefix}-fr-${i + 1}`,
    level: "L3",
    scene: "School",
    category: "Everyday",
    ...overrides,
  }));
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

function range(): string | null {
  return screen.getByRole("status").textContent;
}

async function finishSentence() {
  expect(audio.pending).toHaveLength(1);
  await act(async () => {
    audio.pending.shift()!();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  app.level = "L3";
  app.hiddenContent = [];
  app.speechRate = 0.9;
  app.locale = "en";
  audio.generation = 0;
  audio.pending = [];
  audio.rendered = [];
  audio.speak.mockImplementation(() => new Promise<void>((resolve) => audio.pending.push(resolve)));
  audio.pause.mockResolvedValue(undefined);
  audio.cancelSpeech.mockImplementation(() => {
    audio.generation++;
    audio.pending.splice(0).forEach((resolve) => resolve());
  });
});

afterEach(cleanup);

describe("SentenceList pagination", () => {
  it("server-renders only the first 20 sentences without truncating the count", () => {
    const html = renderToString(<SentenceList sentences={sentences(45)} />);
    expect(html).toContain("sentence-fr-20");
    expect(html).not.toContain("sentence-fr-21");
    expect(html).not.toContain("sentence-fr-45");
    expect(html).toContain("Sentences 1–20 of 45");
    expect(html.match(/aria-label="Read fr:/g)).toHaveLength(20);
  });

  it("pages through every sentence, with global numbering and a partial last page", () => {
    render(<SentenceList sentences={sentences(45)} />);
    expect(screen.getByText("45 / 45 sentences visible for this level")).toBeTruthy();
    expect(screen.getAllByText(/^sentence-fr-/)).toHaveLength(20);
    expect(screen.getAllByRole("button", { name: /^Read / })).toHaveLength(60);
    expect(button("Previous page").disabled).toBe(true);
    expect(button("Next page").disabled).toBe(false);
    expect(range()).toBe("Sentences 1–20 of 45");

    // Native, labelled buttons are focusable and support browser keyboard activation.
    const next = button("Next page");
    expect(next.tagName).toBe("BUTTON");
    expect(next.type).toBe("button");
    next.focus();
    expect(document.activeElement).toBe(next);
    const seen = screen.getAllByText(/^sentence-fr-/).map((el) => el.textContent);
    fireEvent.click(next);
    expect(document.activeElement).toBe(next);
    expect(range()).toBe("Sentences 21–40 of 45");
    expect(screen.queryByText("sentence-fr-1")).toBeNull();
    expect(button("Tap to play from this sentence: 21").textContent).toBe("21");
    seen.push(...screen.getAllByText(/^sentence-fr-/).map((el) => el.textContent));

    fireEvent.click(next);
    expect(range()).toBe("Sentences 41–45 of 45");
    expect(screen.getAllByText(/^sentence-fr-/)).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /^Read / })).toHaveLength(15);
    expect(next.disabled).toBe(true);
    expect(button("Previous page").disabled).toBe(false);
    seen.push(...screen.getAllByText(/^sentence-fr-/).map((el) => el.textContent));
    expect(new Set(seen).size).toBe(45);

    fireEvent.click(button("Previous page"));
    expect(range()).toBe("Sentences 21–40 of 45");
    fireEvent.click(button("Previous page"));
    expect(range()).toBe("Sentences 1–20 of 45");
  });

  it.each([1, 20, 40])("handles a %i-sentence list without an extra empty page", (count) => {
    render(<SentenceList sentences={sentences(count)} />);
    if (count > 20) fireEvent.click(button("Next page"));
    expect(button("Next page").disabled).toBe(true);
    expect(range()).toBe(`Sentences ${count > 20 ? 21 : 1}–${count} of ${count}`);
    expect(screen.getAllByText(/^sentence-fr-/)).toHaveLength(Math.min(20, count));
  });

  it.each([
    ["en", "Sentence pages", "Previous page", "Next page", "Sentences 1–20 of 21"],
    ["fr", "Pages de phrases", "Page précédente", "Page suivante", "Phrases 1–20 sur 21"],
    ["zh", "句子分页", "上一页", "下一页", "第 1–20 句，共 21 句"],
  ] as const)("localizes pagination labels in %s", (locale, label, previous, next, expected) => {
    app.locale = locale;
    render(<SentenceList sentences={sentences(21)} />);
    expect(screen.getByRole("navigation", { name: label })).toBeTruthy();
    expect(button(previous).disabled).toBe(true);
    expect(button(next).disabled).toBe(false);
    expect(range()).toBe(expected);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("shows an empty range and disables playback and pagination for an empty list", () => {
    render(<SentenceList sentences={[]} />);
    expect(screen.getByText(en["sentence.empty"])).toBeTruthy();
    expect(range()).toBe("Sentences 0–0 of 0");
    expect(button("Previous page").disabled).toBe(true);
    expect(button("Next page").disabled).toBe(true);
    expect(button("Start continuous play").disabled).toBe(true);
    expect(screen.queryAllByRole("button", { name: /^Read / })).toHaveLength(0);
    fireEvent.click(button("Start continuous play"));
    expect(audio.speak).not.toHaveBeenCalled();
  });

  it("resets immediately on scene changes and cancels the old playlist", async () => {
    const data = [
      ...sentences(45, "school"),
      ...sentences(45, "home", { scene: "Home" }),
    ];
    render(<SentenceList sentences={data} />);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Start continuous play"));
    expect(audio.speak).toHaveBeenLastCalledWith("school-fr-41", "fr");
    const cancellations = audio.cancelSpeech.mock.calls.length;
    audio.rendered = [];

    fireEvent.click(button("Home"));
    expect(range()).toBe("Sentences 1–20 of 45");
    expect(button("Home").getAttribute("aria-pressed")).toBe("true");
    expect(audio.rendered).toContain("home-fr-1");
    expect(audio.rendered).not.toContain("home-fr-41");
    expect(audio.cancelSpeech.mock.calls.length).toBeGreaterThan(cancellations);
    expect(button("Start continuous play")).toBeTruthy();
    await act(async () => {});
    expect(audio.speak).toHaveBeenCalledTimes(1);

    fireEvent.click(button("Next page"));
    fireEvent.click(button("Home")); // Toggle the selected scene back to All.
    expect(range()).toBe("Sentences 1–20 of 90");
    expect(button("All").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("Home"));
    fireEvent.click(button("Next page"));
    fireEvent.click(button("All"));
    expect(range()).toBe("Sentences 1–20 of 90");
  });

  it("resets on level changes before rendering, retaining scene and universal sentences", async () => {
    const data = [
      ...sentences(45, "l3"),
      ...sentences(45, "l4", { level: "L4" }),
      ...sentences(1, "universal", { level: null }),
      ...sentences(1, "other-scene", { level: null, scene: "Home" }),
    ];
    const view = render(<SentenceList sentences={data} />);
    fireEvent.click(button("School"));
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Start continuous play"));
    const cancellations = audio.cancelSpeech.mock.calls.length;
    app.level = "L4";
    audio.rendered = [];
    view.rerender(<SentenceList sentences={data} />);

    expect(range()).toBe("Sentences 1–20 of 46");
    expect(button("School").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("l4-fr-1")).toBeTruthy();
    expect(screen.queryByText("l3-fr-21")).toBeNull();
    expect(audio.rendered).not.toContain("l4-fr-21");
    expect(audio.cancelSpeech.mock.calls.length).toBeGreaterThan(cancellations);
    await act(async () => {});
    expect(audio.speak).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Next page"));
    expect(screen.getByText("universal-fr-1")).toBeTruthy();
    expect(screen.queryByText("other-scene-fr-1")).toBeNull();
  });

  it("recovers from empty scene and level results on the first page", () => {
    const data = [
      ...sentences(25),
      ...sentences(1, "l4-home", { level: "L4", scene: "Home" }),
    ];
    const view = render(<SentenceList sentences={data} />);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Home"));
    expect(range()).toBe("Sentences 0–0 of 0");
    expect(button("Start continuous play").disabled).toBe(true);
    expect(screen.getByText(en["sentence.empty"])).toBeTruthy();
    fireEvent.click(button("All"));
    expect(range()).toBe("Sentences 1–20 of 25");
    fireEvent.click(button("Next page"));
    app.level = "L1";
    view.rerender(<SentenceList sentences={data} />);
    expect(range()).toBe("Sentences 0–0 of 0");
    app.level = "L3";
    view.rerender(<SentenceList sentences={data} />);
    expect(range()).toBe("Sentences 1–20 of 25");
  });

  it("honors hidden content, cancels playback when locked, and resets on unlock", async () => {
    const data = sentences(45);
    app.hiddenContent = ["sentence"];
    const view = render(<SentenceList sentences={data} />);
    expect(screen.getByText(en["sentence.parentLocked"])).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(audio.configureSpeech).not.toHaveBeenCalled();

    app.hiddenContent = ["story"];
    view.rerender(<SentenceList sentences={data} />);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Start continuous play"));
    const cancellations = audio.cancelSpeech.mock.calls.length;
    app.hiddenContent = ["sentence"];
    view.rerender(<SentenceList sentences={data} />);
    expect(screen.queryByText("sentence-fr-21")).toBeNull();
    expect(audio.cancelSpeech.mock.calls.length).toBeGreaterThan(cancellations);
    await act(async () => {});
    expect(audio.speak).toHaveBeenCalledTimes(1);

    app.hiddenContent = [];
    view.rerender(<SentenceList sentences={data} />);
    expect(range()).toBe("Sentences 1–20 of 45");
  });

  it("starts on the current page and follows full-list playback through the last page", async () => {
    render(<SentenceList sentences={sentences(45)} />);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Start continuous play"));
    const cancellations = audio.cancelSpeech.mock.calls.length;

    for (let number = 21; number <= 45; number++) {
      expect(audio.speak).toHaveBeenLastCalledWith(`sentence-fr-${number}`, "fr");
      expect(button(`Tap to stop: ${number}`).getAttribute("aria-pressed")).toBe("true");
      expect(range()).toBe(number <= 40 ? "Sentences 21–40 of 45" : "Sentences 41–45 of 45");
      await finishSentence();
    }

    expect(audio.speak.mock.calls.map(([text]) => text)).toEqual(
      sentences(45).slice(20).map((sentence) => sentence.fr)
    );
    expect(audio.cancelSpeech).toHaveBeenCalledTimes(cancellations);
    expect(button("Start continuous play")).toBeTruthy();
    expect(range()).toBe("Sentences 41–45 of 45");
    // Completion must not bounce back to the page on which playback started.
    fireEvent.click(button("Start continuous play"));
    expect(audio.speak).toHaveBeenLastCalledWith("sentence-fr-41", "fr");
  });

  it("uses filtered global indices for row playback, trilingual items, and stop", async () => {
    const data = [...sentences(10, "excluded", { scene: "Home" }), ...sentences(45)];
    render(<SentenceList sentences={data} />);
    fireEvent.click(button("School"));
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Trilingual rotation"));
    fireEvent.click(button("Tap to play from this sentence: 24"));
    expect(audio.speak).toHaveBeenLastCalledWith("sentence-zh-24", "zh");
    await finishSentence();
    expect(audio.speak).toHaveBeenLastCalledWith("sentence-en-24", "en");
    await finishSentence();
    expect(audio.speak).toHaveBeenLastCalledWith("sentence-fr-24", "fr");
    await finishSentence();
    expect(audio.speak).toHaveBeenLastCalledWith("sentence-zh-25", "zh");
    expect(button("Tap to stop: 25").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("Tap to stop: 25"));
    await act(async () => {});
    expect(audio.speak).toHaveBeenCalledTimes(4);
    expect(range()).toBe("Sentences 21–40 of 45");
    expect(button("Start continuous play")).toBeTruthy();
  });

  it.each([
    ["Next page", "Sentences 41–45 of 45", "sentence-fr-41"],
    ["Previous page", "Sentences 1–20 of 45", "sentence-fr-1"],
  ])("manual %s stops playback and starts the next run from the chosen page", async (direction, expected, first) => {
    render(<SentenceList sentences={sentences(45)} />);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Tap to play from this sentence: 40"));
    const cancellations = audio.cancelSpeech.mock.calls.length;
    fireEvent.click(button(direction));
    expect(audio.cancelSpeech.mock.calls.length).toBeGreaterThan(cancellations);
    expect(range()).toBe(expected);
    await act(async () => {});
    expect(audio.speak).toHaveBeenCalledTimes(1);
    expect(button("Start continuous play")).toBeTruthy();
    fireEvent.click(button("Start continuous play"));
    expect(audio.speak).toHaveBeenLastCalledWith(first, "fr");
  });

  it("does not reset or stop playback on ordinary rerenders or unchanged filters", async () => {
    const data = sentences(45);
    const view = render(<StrictMode><SentenceList sentences={data} /></StrictMode>);
    fireEvent.click(button("Next page"));
    fireEvent.click(button("Tap to play from this sentence: 24"));
    const cancellations = audio.cancelSpeech.mock.calls.length;
    app.speechRate = 0.75;
    view.rerender(<StrictMode><SentenceList sentences={[...data]} /></StrictMode>);
    fireEvent.click(button("All"));
    expect(audio.cancelSpeech).toHaveBeenCalledTimes(cancellations);
    expect(audio.configureSpeech).toHaveBeenLastCalledWith(0.75);
    expect(range()).toBe("Sentences 21–40 of 45");
    expect(button("Tap to stop: 24")).toBeTruthy();
    await finishSentence();
    expect(audio.speak).toHaveBeenLastCalledWith("sentence-fr-25", "fr");
    expect(audio.cancelSpeech).toHaveBeenCalledTimes(cancellations);
  });
});
