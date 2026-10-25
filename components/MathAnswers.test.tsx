import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInitialState, quizResult, type AppState, type Locale, type QuizQuestion } from "@/lib/workspace";
import { translate } from "@/lib/i18nDict";
import { formatMathAnswer } from "@/lib/mathAnswer";
import { toQuizQuestion, type MathQuestion } from "@/lib/mathGenerator";
import type { DailyItem } from "@/lib/dailyChallenge";
import { MathQuestionCard } from "./MathQuestionCard";
import { MathQuiz } from "./MathQuiz";
import { DailyChallenge } from "./DailyChallenge";
import { QuestionCard } from "./workspace/QuestionCard";
import { LiveQuizModal } from "./workspace/LiveQuizModal";
import WorkspaceView from "@/app/[locale]/workspace/WorkspaceView";

const h = vi.hoisted(() => ({
  locale: "en" as Locale,
  state: null as AppState | null,
  questions: [] as MathQuestion[],
  daily: [] as DailyItem[],
  generateDaily: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    locale: h.locale,
    t: (key: string, vars?: Record<string, string>) => translate(key, vars, h.locale),
  }),
  localizedHref: (locale: Locale, path: string) => `/${locale}${path}`,
}));
vi.mock("@/components/AppStateProvider", () => ({
  useAppState: () => ({ state: h.state, update: h.update }),
}));
vi.mock("@/lib/mathGenerator", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mathGenerator")>(),
  generateMathQuiz: () => h.questions,
}));
vi.mock("@/lib/dailyChallenge", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/dailyChallenge")>(),
  generateDailyChallenge: () => { h.generateDaily(); return h.daily; },
}));
vi.mock("@/lib/audioManager", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/audioManager")>(),
  playSfx: vi.fn(), configureSpeech: vi.fn(), cancelSpeech: vi.fn(), speak: vi.fn(),
}));
vi.mock("@/components/Confetti", () => ({
  Confetti: () => null,
  useConfetti: () => ({ active: false, fire: vi.fn() }),
}));
vi.mock("@/components/Mascot", () => ({ Mascot: () => null }));
vi.mock("@/components/growth/GrowthView", () => ({
  MascotPen: () => null, BadgeWall: () => null, DailyQuestList: () => null,
}));
vi.mock("@/components/growth/ProgressView", () => ({ SubjectStats: () => null }));

const locales: Locale[] = ["zh", "en", "fr"];
const prompt = { zh: "计算结果？", en: "Calculate the result?", fr: "Calcule le résultat ?" };
function mathQuestion(answer = "3r2", options = ["3r1", "3r2"]): MathQuestion {
  return {
    id: "math-view", subject: "math", level: "L6", source: "generated",
    kind: "mulDiv", prompt, answer, options, inputMode: "choice",
  };
}
function liveProps(q: QuizQuestion, submitted = false) {
  return {
    mode: "choice" as const, questions: [q], answers: [0], submitted,
    revealed: new Set<number>(), audioState: "idle" as const, recState: "idle" as const,
    recMsg: "", speakResults: [], onPlay: vi.fn(), onAnswer: vi.fn(),
    onToggleReveal: vi.fn(), onSubmit: vi.fn(), onRecognize: vi.fn(), onClose: vi.fn(),
  };
}

beforeEach(() => {
  h.locale = "en";
  h.state = createInitialState();
  h.state.profile.level = "L6";
  h.questions = [mathQuestion()];
  h.daily = [{ subject: "math", mode: "math", q: mathQuestion() }];
  h.update.mockClear();
  h.generateDaily.mockClear();
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("math prompts do not reveal solutions", () => {
  it.each(locales)("keeps columnar unknowns and renders only one equation in %s", (locale) => {
    h.locale = locale;
    const q: MathQuestion = {
      ...mathQuestion(),
      visual: { type: "columnar", op: "÷", a: 29, b: 9, result: 3, remainder: 2 },
    };
    const { container, rerender } = render(<MathQuestionCard q={q} />);
    expect(screen.getAllByText("29 ÷ 9 = ?")).toHaveLength(1);
    expect(screen.getByText("⟌")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();
    expect(screen.queryByText("3 … 2")).toBeNull();
    const before = container.innerHTML;
    rerender(<MathQuestionCard q={{ ...q, visual: { ...q.visual as Extract<MathQuestion["visual"], { type: "columnar" }>, result: 31, remainder: 19 } }} />);
    expect(container.innerHTML).toBe(before);

    rerender(<MathQuestionCard q={{ ...q, visual: { type: "columnar", op: "÷", a: 28, b: 7, result: 4, remainder: 0 } }} />);
    expect(screen.queryByText("4")).toBeNull();
    expect(screen.getByText("?")).toBeTruthy();
    rerender(<MathQuestionCard q={{ ...q, visual: { type: "columnar", op: "×", a: 4, b: 23, result: 92, remainder: 0 } }} />);
    expect(screen.getAllByText("4 × 23 = ?")).toHaveLength(1);
    expect(screen.queryByText("92")).toBeNull();
  });

  it.each(locales)("keeps the symmetry shape but hides both outcome labels in %s", (locale) => {
    h.locale = locale;
    const q: MathQuestion = {
      ...mathQuestion("yes", ["no", "yes"]), kind: "axisSymmetry",
      visual: { type: "symmetry", shape: "△", hasAxis: true },
    };
    const { container, rerender } = render(<MathQuestionCard q={q} />);
    expect(screen.getByText("△")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();
    expect(screen.queryByText(translate("math.symmetry.yes", undefined, locale))).toBeNull();
    const before = container.innerHTML;
    rerender(<MathQuestionCard q={{ ...q, answer: "no", visual: { type: "symmetry", shape: "△", hasAxis: false } }} />);
    expect(screen.queryByText(translate("math.symmetry.no", undefined, locale))).toBeNull();
    expect(container.innerHTML).toBe(before);
  });

  it("still shows ordinary horizontal arithmetic", () => {
    render(<MathQuestionCard q={{ ...mathQuestion("5"), kind: "add", visual: { a: 2, b: 3, op: "+" } }} />);
    expect(screen.getByText("2 + 3 = ?")).toBeTruthy();
  });
});

describe.each(locales)("math answer views in %s", (locale) => {
  beforeEach(() => { h.locale = locale; });

  it("clears previous daily feedback before the next question and replaces it on reselection", () => {
    vi.useFakeTimers();
    h.daily = [
      { subject: "math", mode: "math", q: mathQuestion("yes", ["no", "yes"]) },
      { subject: "math", mode: "math", q: mathQuestion("3r2", ["3r1", "3r2"]) },
    ];
    render(<DailyChallenge pool={[]} words={[]} alphabets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: translate("dailyChallenge.start", undefined, locale) }));
    fireEvent.click(screen.getByRole("button", { name: formatMathAnswer("yes", locale) }));
    expect(screen.getByText(translate("dailyChallenge.correct", undefined, locale))).toBeTruthy();
    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(screen.getByRole("button", { name: translate("dailyChallenge.next", undefined, locale) }));
    expect(screen.queryByText(translate("dailyChallenge.correct", undefined, locale))).toBeNull();
    expect(screen.queryByText(translate("dailyChallenge.incorrect", undefined, locale))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: formatMathAnswer("3r1", locale) }));
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByText(translate("dailyChallenge.incorrect", undefined, locale))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: formatMathAnswer("3r2", locale) }));
    expect(screen.getByText(translate("dailyChallenge.correct", undefined, locale))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: formatMathAnswer("3r1", locale) }));
    expect(screen.queryByText(translate("dailyChallenge.correct", undefined, locale))).toBeNull();
    expect(screen.getByText(translate("dailyChallenge.incorrect", undefined, locale))).toBeTruthy();
  });

  it.each([
    ["3r2", ["3r1", "3r2"]], ["yes", ["no", "yes"]],
    ["不是", ["是", "不是"]], ["3余2", ["3余1", "3余2"]],
  ])("MathQuiz formats %s options and wrong-answer guidance", (answer, options) => {
    vi.useFakeTimers();
    const q = mathQuestion(answer as string, options as string[]);
    h.questions = [q];
    render(<MathQuiz stageId="l6-mulDiv" fixedItems={[]} />);
    const wrong = q.options![0];
    expect(screen.getByRole("button", { name: formatMathAnswer(q.answer, locale) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: formatMathAnswer(wrong, locale) }));
    fireEvent.click(screen.getByRole("button", { name: translate("math.confirm", undefined, locale) }));
    expect(screen.getByText(translate("math.correctAnswer", { answer: formatMathAnswer(q.answer, locale) }, locale))).toBeTruthy();
  });

  it("MathQuiz supplies the locked level and the distinct current level", () => {
    h.state!.profile.level = "L3";
    render(<MathQuiz stageId="l6-mulDiv" fixedItems={[]} />);
    expect(screen.getByText(translate("math.levelLocked", { level: "L6", currentLevel: "L3" }, locale))).toBeTruthy();
  });

  it.each([
    ["3r2", ["3r1", "3r2"]], ["yes", ["no", "yes"]],
  ])("DailyChallenge formats math %s but retains raw choice values", (answer, options) => {
    vi.useFakeTimers();
    h.daily = [{ subject: "math", mode: "math", q: mathQuestion(answer as string, options as string[]) }];
    render(<DailyChallenge pool={[]} words={[]} alphabets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: translate("dailyChallenge.start", undefined, locale) }));
    const option = screen.getByRole("button", { name: formatMathAnswer(answer as string, locale) });
    fireEvent.click(option);
    expect(option.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(translate("dailyChallenge.correct", undefined, locale))).toBeTruthy();
  });

  it.each([
    ["3余2", ["3余1", "3余2"]], ["是", ["不是", "是"]],
  ])("review cards format persisted %s without changing indices", (answer, options) => {
    const q = toQuizQuestion(mathQuestion(answer as string, options as string[]), { userAnswer: (options as string[])[0] });
    const before = JSON.stringify(q);
    const { container } = render(<QuestionCard q={q} index={0} onPlay={vi.fn()} />);
    expect(container.querySelector("span.italic")?.textContent).toBe(prompt[locale]);
    const correct = screen.getByText(formatMathAnswer(q.options[1], locale));
    const wrong = screen.getByText(formatMathAnswer(q.options[0], locale));
    expect(correct.parentElement?.className).toContain("border-green-400");
    expect(wrong.parentElement?.className).toContain("border-red-400");
    expect(JSON.stringify(q)).toBe(before);
  });

  it.each([false, true])("live math choices retain selection indices (submitted=%s)", (submitted) => {
    const q = toQuizQuestion(mathQuestion("3余2", ["3余1", "3余2"]), { userAnswer: "3余1" });
    const props = liveProps(q, submitted);
    const { container } = render(<LiveQuizModal {...props} />);
    expect(container.querySelector("span.italic")?.textContent).toBe(prompt[locale]);
    fireEvent.click(screen.getByText(formatMathAnswer("3余1", locale)));
    expect(props.onAnswer).toHaveBeenCalledWith(0, 0);
    expect(screen.getByText(formatMathAnswer("3余2", locale))).toBeTruthy();
  });

  it("workspace math review localizes persisted answers and explanation without updating scores", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ available: false }) }));
    const q = toQuizQuestion(mathQuestion("3余2", ["3余1", "3余2"]), { userAnswer: "3余1" });
    h.state!.sessions = [{
      id: "legacy-math", date: "2026-01-01", durationMin: 1, subject: "math", reviewed: false,
      contentRef: { type: "mixed", title: "Legacy math" }, quiz: { title: "Math", questions: [q] },
    }];
    const before = JSON.stringify(h.state!.sessions);
    const score = quizResult(h.state!.sessions[0]);
    await act(async () => { render(<WorkspaceView stories={[]} sentences={[]} />); });
    expect(screen.getByText(translate("workspace.yourAnswer", { answer: formatMathAnswer("3余1", locale) }, locale))).toBeTruthy();
    expect(screen.getByText(translate("workspace.correctAnswer", { answer: formatMathAnswer("3余2", locale) }, locale))).toBeTruthy();
    expect(screen.getByText(`${prompt[locale]} = ${formatMathAnswer("3余2", locale)}`)).toBeTruthy();
    expect(JSON.stringify(h.state!.sessions)).toBe(before);
    expect(quizResult(h.state!.sessions[0])).toEqual(score);
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe("session timing and stable daily papers", () => {
  it("starts timing only when the math level is ready and resets on retry", () => {
    vi.useFakeTimers();
    h.state = null;
    const fixedItems: [] = [];
    const view = render(<MathQuiz stageId="l6-mulDiv" fixedItems={fixedItems} />);
    act(() => vi.advanceTimersByTime(600000));
    h.state = createInitialState("L6");
    view.rerender(<MathQuiz stageId="l6-mulDiv" fixedItems={fixedItems} />);
    act(() => vi.advanceTimersByTime(120000));
    const finish = () => {
      fireEvent.click(screen.getByRole("button", { name: formatMathAnswer("3r2", "en") }));
      fireEvent.click(screen.getByRole("button", { name: translate("math.confirm", undefined, "en") }));
      act(() => vi.advanceTimersByTime(420));
      return h.update.mock.calls.at(-1)![0](h.state) as AppState;
    };
    expect(finish().sessions.at(-1)?.durationMin).toBe(2);
    act(() => vi.advanceTimersByTime(300000));
    fireEvent.click(screen.getByRole("button", { name: translate("math.retry", undefined, "en") }));
    act(() => vi.advanceTimersByTime(180000));
    expect(finish().sessions.at(-1)?.durationMin).toBe(3);
  });

  it("does not regenerate an open daily paper on usage, SRS, or points updates", () => {
    vi.useFakeTimers();
    const props = { pool: [], words: [], alphabets: [] };
    const view = render(<DailyChallenge {...props} />);
    expect(h.generateDaily).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(600000));
    fireEvent.click(screen.getByRole("button", { name: translate("dailyChallenge.start", undefined, "en") }));
    fireEvent.click(screen.getByRole("button", { name: formatMathAnswer("3r2", "en") }));
    h.daily = [{ subject: "math", mode: "math", q: mathQuestion("yes", ["no", "yes"]) }];
    h.state = { ...h.state!, screenTime: { ...h.state!.screenTime, usedSec: 5 }, points: { ...h.state!.points, total: 30 }, srs: {}, misspelled: ["chat"] };
    view.rerender(<DailyChallenge {...props} />);
    expect(h.generateDaily).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: formatMathAnswer("3r2", "en") }).getAttribute("aria-pressed")).toBe("true");
    act(() => vi.advanceTimersByTime(120000));
    fireEvent.click(screen.getByRole("button", { name: translate("dailyChallenge.submit", undefined, "en") }));
    const result = h.update.mock.calls.at(-1)![0](h.state) as AppState;
    expect(result.sessions.at(-1)?.durationMin).toBe(2);
    expect(result.sessions.at(-1)?.quiz.questions[0].options).toContain("3r2");
  });
});

describe("language answers remain unchanged", () => {
  it.each(["language", undefined] as const)("review and live cards do not format subject=%s", (subject) => {
    const q: QuizQuestion = {
      ...toQuizQuestion(mathQuestion("yes", ["no", "yes", "3r2", "是"]), { userAnswer: "no" }),
      subject, kind: "axisSymmetry",
    };
    const { rerender } = render(<QuestionCard q={q} index={0} onPlay={vi.fn()} />);
    for (const option of q.options) expect(screen.getByText(option)).toBeTruthy();
    expect(screen.getByText(`« ${q.fr} » 是什么意思？`)).toBeTruthy();
    rerender(<LiveQuizModal {...liveProps(q)} />);
    for (const option of q.options) expect(screen.getByText(option)).toBeTruthy();
    expect(screen.getByText(`« ${q.fr} » 是什么意思？`)).toBeTruthy();
  });

  it("workspace leaves language answers and explanations unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ available: false }) }));
    const q: QuizQuestion = {
      ...toQuizQuestion(mathQuestion("yes", ["no", "yes"]), { userAnswer: "no" }),
      subject: "language", explanation: "Language explanation: yes / no",
    };
    h.state!.sessions = [{
      id: "language", date: "2026-01-01", durationMin: 1, subject: "language", reviewed: false,
      contentRef: { type: "mixed", title: "Language" }, quiz: { title: "Language", questions: [q] },
    }];
    await act(async () => { render(<WorkspaceView stories={[]} sentences={[]} />); });
    expect(screen.getByText(translate("workspace.yourAnswer", { answer: "no" }, "en"))).toBeTruthy();
    expect(screen.getByText(translate("workspace.correctAnswer", { answer: "yes" }, "en"))).toBeTruthy();
    expect(screen.getByText(q.explanation)).toBeTruthy();
  });

  it("DailyChallenge leaves language choices unchanged", () => {
    const q = { ...toQuizQuestion(mathQuestion("yes", ["no", "yes", "3r2", "是"]), { userAnswer: null }), subject: "language" as const };
    h.daily = [{ subject: "language", mode: "lang", q }];
    render(<DailyChallenge pool={[]} words={[]} alphabets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: translate("dailyChallenge.start", undefined, "en") }));
    for (const option of q.options) expect(screen.getByText(option)).toBeTruthy();
  });
});
