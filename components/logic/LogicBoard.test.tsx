import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LogicCenter } from "./LogicBoard";
import { createInitialState, type AppState } from "@/lib/workspace";
import type { LogicQuestion } from "@/lib/logicEngine";

const h = vi.hoisted(() => ({ update: vi.fn(), question: null as LogicQuestion | null }));
vi.mock("@/components/AppStateProvider", () => ({
  useAppState: () => ({ state: createInitialState(), update: h.update }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));
vi.mock("@/lib/logicEngine", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/logicEngine")>(),
  generateLogicQuiz: () => [h.question],
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", MouseEvent);
  h.update.mockClear();
  h.question = {
    id: "classify", subject: "logic", level: "L3", kind: "classify", domain: "classify", source: "generated",
    stem: { zh: "分类", en: "Classify", fr: "Classer" }, answer: JSON.stringify({ a: "one", b: "two" }),
    payload: {
      type: "classify",
      baskets: [{ id: "one", emoji: "1", label: { zh: "一", en: "One", fr: "Un" } }, { id: "two", emoji: "2", label: { zh: "二", en: "Two", fr: "Deux" } }],
      items: [{ id: "a", emoji: "A", basketId: "one" }, { id: "b", emoji: "B", basketId: "two" }],
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "elementFromPoint");
});

function open() {
  const view = render(<LogicCenter fixedItems={[]} />);
  fireEvent.click(screen.getAllByRole("button", { name: /enter domain/ })[0]);
  return view;
}
function basket(id: string) {
  return document.querySelector(`[data-basket="${id}"]`)!;
}
function dropOn(id: string) {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => basket(id) });
  fireEvent.pointerUp(window, { clientX: 0, clientY: 0 });
}

describe("classification pointer lifecycle", () => {
  it("accepts both a completed drag and the equivalent click path", () => {
    open();
    fireEvent.pointerDown(screen.getAllByLabelText("select item")[0]);
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 });
    dropOn("one");
    expect(basket("one").textContent).toContain("A");
    fireEvent.click(screen.getByLabelText("select item"));
    fireEvent.click(basket("two"));
    fireEvent.click(screen.getByText("logic.check"));
    act(() => vi.advanceTimersByTime(900));
    const result = h.update.mock.calls[0][0](createInitialState()) as AppState;
    expect(result.sessions[0].quiz.questions[0].userIndex).toBe(result.sessions[0].quiz.questions[0].correctIndex);
  });

  it("cancels without assigning and removes all global drag listeners", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    open();
    fireEvent.pointerDown(screen.getAllByLabelText("select item")[0]);
    const listeners = add.mock.calls.filter(([name]) => ["pointermove", "pointerup", "pointercancel"].includes(name));
    fireEvent.pointerCancel(window);
    expect(screen.getAllByLabelText("select item")).toHaveLength(2);
    expect(document.querySelector(".pointer-events-none")).toBeNull();
    for (const [name, handler] of listeners) expect(remove).toHaveBeenCalledWith(name, handler);
    dropOn("one");
    expect(screen.getAllByLabelText("select item")).toHaveLength(2);
  });

  it("removes live listeners on unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const view = open();
    fireEvent.pointerDown(screen.getAllByLabelText("select item")[0]);
    const listeners = add.mock.calls.filter(([name]) => ["pointermove", "pointerup", "pointercancel"].includes(name));
    view.unmount();
    for (const [name, handler] of listeners) expect(remove).toHaveBeenCalledWith(name, handler);
  });
});
