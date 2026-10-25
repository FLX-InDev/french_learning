import { describe, expect, it } from "vitest";
import { formatMathAnswer } from "./mathAnswer";
import { translate } from "./i18nDict";
import {
  generateMathQuestion,
  generateMathQuiz,
  mathQuestionFromFixedItem,
  mulberry32,
  normalizeAnswer,
  toChoiceQuizQuestion,
  toQuizQuestion,
  type MathKind,
  type MathQuestion,
} from "./mathGenerator";
import { dailyItemToQuizQuestion, isDailyCorrect } from "./dailyChallenge";
import { quizResult, type Locale, type StudySession } from "./workspace";
import { getAllMathItems } from "./parser";

const locales: Locale[] = ["zh", "en", "fr"];

function question(answer: string, options: string[], kind: MathKind = "mulDiv"): MathQuestion {
  return {
    id: "answer-regression", subject: "math", level: "L6", kind,
    source: "generated", prompt: { zh: "计算", en: "Calculate", fr: "Calcule" },
    answer, options, inputMode: "choice",
  };
}

describe("math answer normalization and scoring", () => {
  it.each([
    ["3余1", "3r1"], ["3 余 2", "3r2"], [" 3 R 2 ", "3r2"],
    [" 1 / 2 ", "1/2"], ["1/3", "1/3"],
    ["是", "yes"], ["不是", "no"], ["yes", "yes"], ["no", "no"],
    ["3 点", "3"], ["100 厘米", "100"], ["8 只", "8"], ["12 cm", "12"],
    [" 3 ： 00 ", "3:00"], ["3:30", "3:30"],
  ])("normalizes %s as %s", (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected);
  });

  it.each([
    ["3余1", "3余2"], ["3r1", "3r2"], ["3", "3r1"],
    ["1/2", "1/3"], ["1", "1/2"], ["3:00", "3:30"],
  ])("does not score %s as %s", (wrong, correct) => {
    const q = question(correct, [wrong, correct]);
    const item = { subject: "math", mode: "math", q } as const;
    expect(isDailyCorrect(item, { text: wrong })).toBe(false);
    expect(isDailyCorrect(item, { text: correct })).toBe(true);
    for (const converted of [
      toQuizQuestion(q, { userAnswer: wrong }),
      toChoiceQuizQuestion(q, mulberry32(1), wrong),
      dailyItemToQuizQuestion(item, { text: wrong }, mulberry32(1)),
    ]) {
      expect(converted.options).toEqual([wrong, correct]);
      expect(converted.correctIndex).toBe(1);
      expect(converted.userIndex).toBe(0);
    }
  });

  it.each(["3r", "3余", "1/", "1/2/3", "3r2r1"])("never truncates incomplete compounds: %s", (answer) => {
    expect(normalizeAnswer(answer)).toBe(answer);
  });
});

describe("stable generation and choice conversion", () => {
  it("converts every bundled fixed symmetry question into answerable yes/no choices", () => {
    const items = getAllMathItems().filter((item) => item.kind === "axisSymmetry");
    expect(items.length).toBeGreaterThan(0);
    const before = JSON.stringify(items);
    for (const item of items) {
      const q = mathQuestionFromFixedItem(item, "L5");
      expect(q.inputMode).toBe("choice");
      expect(q.options).toEqual(["yes", "no"]);
      expect(q.answer).toBe(normalizeAnswer(item.answerTri?.zh ?? item.answer));
      expect(q.prompt).toEqual(item.prompt);
      expect(q.source).toBe("fixed");
      expect(q.fixedId).toBe(item.id);
      const saved = toQuizQuestion(q, { userAnswer: q.answer });
      expect(saved.options[saved.correctIndex]).toBe(q.answer);
      expect(saved.userIndex).toBe(saved.correctIndex);
    }
    const quiz = generateMathQuiz({ level: "L5", kind: "axisSymmetry", count: 10, seed: "fixed-symmetry", fixedItems: items });
    expect(quiz.slice(0, items.length).map((q) => q.fixedId)).toEqual(items.map((item) => item.id));
    expect(quiz.every((q) => q.inputMode === "choice" && q.options?.includes(q.answer))).toBe(true);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("generates both symmetry outcomes using only yes/no tokens", () => {
    const rng = mulberry32(1200);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const q = generateMathQuestion({ level: "L5", kind: "axisSymmetry", rng });
      const v = q.visual as { hasAxis: boolean };
      expect(q.answer).toBe(v.hasAxis ? "yes" : "no");
      expect(q.options?.slice().sort()).toEqual(["no", "yes"]);
      seen.add(q.answer);
    }
    expect(seen.size).toBe(2);
  });

  it("generates neutral remainder options, all distractors score wrong", () => {
    const rng = mulberry32(1300);
    let seen = 0;
    for (let i = 0; i < 80; i++) {
      const q = generateMathQuestion({ level: "L6", kind: "mulDiv", rng });
      if (q.inputMode !== "choice") continue;
      seen++;
      expect(q.answer).toMatch(/^\d+r\d+$/);
      for (const option of q.options!) {
        expect(option).toMatch(/^\d+r\d+$/);
        expect(isDailyCorrect({ subject: "math", mode: "math", q }, { text: option }))
          .toBe(option === q.answer);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it.each<MathKind>(["axisSymmetry", "mulDiv", "fraction", "shape", "motif", "countFr", "clock", "compare", "add"])(
    "preserves every choice and its index for %s", (kind) => {
      const rng = mulberry32(99);
      let seen = 0;
      for (let i = 0; i < 40; i++) {
        const q = generateMathQuestion({ level: kind === "add" ? "L2" : "L6", kind, rng });
        if (q.inputMode !== "choice") continue;
        seen++;
        const before = JSON.stringify(q);
        q.options!.forEach((answer, index) => {
          const converted = toChoiceQuizQuestion(q, mulberry32(2), answer);
          expect(converted.options).toEqual(q.options);
          expect(converted.options).not.toBe(q.options);
          expect(converted.userIndex).toBe(index);
          expect(converted.correctIndex).toBe(q.options!.indexOf(q.answer));
        });
        expect(JSON.stringify(q)).toBe(before);
      }
      expect(seen).toBeGreaterThan(0);
    }
  );

  it.each([
    ["是", ["不是", "是"], "yes", "no", "axisSymmetry"],
    ["3 余 2", ["3余1", "3 余 2", "2余2", "4余2"], "3r2", "3r1", "mulDiv"],
  ] as const)("converts persisted %s choices without changing their tokens", (answer, options, right, wrong, kind) => {
    const q = question(answer, [...options], kind);
    for (const convert of [
      (input: string) => toQuizQuestion(q, { userAnswer: input }),
      (input: string) => toChoiceQuizQuestion(q, mulberry32(1), input),
    ]) {
      expect(convert(right).userIndex).toBe(1);
      expect(convert(wrong).userIndex).toBe(0);
      expect(convert(right).correctIndex).toBe(1);
      expect(convert(right).options).toEqual(options);
    }
  });
});

describe("math answer display", () => {
  it.each([
    ["zh", "是", "不是", "3 余 2"],
    ["en", "Yes", "No", "3 remainder 2"],
    ["fr", "Oui", "Non", "3 reste 2"],
  ] as const)("formats stable and persisted tokens in %s", (locale, yes, no, remainder) => {
    for (const answer of ["yes", "是"]) expect(formatMathAnswer(answer, locale)).toBe(yes);
    for (const answer of ["no", "不是"]) expect(formatMathAnswer(answer, locale)).toBe(no);
    for (const answer of ["3r2", "3 余 2", "3余2", "3 R 2"]) {
      expect(formatMathAnswer(answer, locale)).toBe(remainder);
    }
    for (const answer of ["1/2", "3:00", "100 厘米", "cercle", "trois", "cercle|rouge", ">", "12"]) {
      expect(formatMathAnswer(answer, locale)).toBe(answer);
    }
  });

  it.each(locales)("interpolates distinct locked and current levels in %s", (locale) => {
    const text = translate("math.levelLocked", { level: "L6", currentLevel: "L3" }, locale);
    expect(text.match(/L6/g)).toHaveLength(1);
    expect(text.match(/L3/g)).toHaveLength(1);
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it("localizes persisted choices without recalculating historical scores", () => {
    // Simulate a legacy session whose indices were scored before normalization was fixed.
    const q = toQuizQuestion(question("3余2", ["3余1", "3余2"]), { userAnswer: "3余1" });
    q.correctIndex = 0;
    const session: StudySession = {
      id: "persisted", date: "2026-01-01", durationMin: 1, subject: "math",
      contentRef: { type: "mixed", title: "Math" },
      quiz: { title: "Math", questions: [q] }, reviewed: false,
    };
    const before = JSON.stringify(session);
    const result = quizResult(session);
    for (const locale of locales) q.options.map((option) => formatMathAnswer(option, locale));
    expect(JSON.stringify(session)).toBe(before);
    expect(quizResult(session)).toEqual(result);
    expect(result.score).toBe(1);
  });
});
