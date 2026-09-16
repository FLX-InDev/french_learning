import { describe, expect, it } from "vitest";
import {
  generateMathQuestion,
  generateMathQuiz,
  mathQuestionFromFixedItem,
  mulberry32,
  normalizeAnswer,
  seedFromString,
  toChoiceQuizQuestion,
  toQuizQuestion,
  type ArithVisual,
} from "./mathGenerator";
import type { MathItem } from "./contentTypes";
import type { Level } from "./levels";

const LEVELS: Level[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

function arith(q: { visual?: unknown }): ArithVisual {
  return q.visual as ArithVisual;
}

// ─── 随机源 ──────────────────────────────────────────────────────

describe("mulberry32 / seed", () => {
  it("同种子产生同一序列（可重放）", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("不同种子序列不同", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("seedFromString 稳定且在 32 位范围内", () => {
    expect(seedFromString("2026-09-07")).toBe(seedFromString("2026-09-07"));
    expect(seedFromString("abc")).toBeLessThanOrEqual(0xffffffff);
  });
});

// ─── count / countWrite 范围 ─────────────────────────────────────

describe("count / countWrite 数值范围（L1 1–5；L2 1–10；L3 1–20）", () => {
  const maxByLevel: Record<string, number> = { L1: 5, L2: 10, L3: 20 };

  for (const [level, max] of Object.entries(maxByLevel)) {
    it(`${level}：30 题均在 1–${max}`, () => {
      const rng = mulberry32(seedFromString(level));
      for (let i = 0; i < 30; i++) {
        const q = generateMathQuestion({
          level: level as Level,
          kind: "count",
          rng,
        });
        const v = q.visual as { count: number };
        expect(v.count).toBeGreaterThanOrEqual(1);
        expect(v.count).toBeLessThanOrEqual(max);
        expect(q.answer).toBe(String(v.count));
      }
    });
  }
});

// ─── add / sub 范围 ──────────────────────────────────────────────

describe("add / sub 数值范围", () => {
  it("L1：5 以内且不进位（a+b ≤ 5）", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L1", kind: "add", rng });
      const { a, b, op } = arith(q);
      expect(op).toBe("+");
      expect(a + b).toBeLessThanOrEqual(5);
    }
  });

  it("L1：减法结果不为负", () => {
    const rng = mulberry32(8);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L1", kind: "sub", rng });
      const { a, b } = arith(q);
      expect(a - b).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBe(String(a - b));
    }
  });

  it("L3：10 以内；L4：20 以内", () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 30; i++) {
      const l3 = arith(generateMathQuestion({ level: "L3", kind: "add", rng }));
      expect(l3.a + l3.b).toBeLessThanOrEqual(10);
      const l4 = arith(generateMathQuestion({ level: "L4", kind: "add", rng }));
      expect(l4.a + l4.b).toBeLessThanOrEqual(20);
    }
  });
});

// ─── addCarry / subBorrow 硬约束 ─────────────────────────────────

describe("addCarry 必进位（L4，§9.5 硬约束）", () => {
  it("50 题：个位和 ≥ 10 且总和 ≤ 20，均附凑十分解", () => {
    const rng = mulberry32(100);
    for (let i = 0; i < 50; i++) {
      const q = generateMathQuestion({ level: "L4", kind: "addCarry", rng });
      const { a, b, op, decomposition } = arith(q);
      expect(op).toBe("+");
      expect((a % 10) + (b % 10)).toBeGreaterThanOrEqual(10); // 必进位
      expect(a + b).toBeLessThanOrEqual(20);
      expect(q.answer).toBe(String(a + b));
      expect(decomposition).toBeTruthy();
      expect(decomposition?.length).toBe(2);
      // 分解正确性：8 + 2 = 10 且 10 + rest = 答案
      const first = Number(decomposition?.[0].text.split("=")[1]);
      expect(first).toBe(10);
    }
  });
});

describe("subBorrow 必退位（L4，§9.5 硬约束）", () => {
  it("50 题：被减数个位 < 减数个位且差 ≥ 0，均附破十分解", () => {
    const rng = mulberry32(101);
    for (let i = 0; i < 50; i++) {
      const q = generateMathQuestion({ level: "L4", kind: "subBorrow", rng });
      const { a, b, op, decomposition } = arith(q);
      expect(op).toBe("-");
      expect(a % 10).toBeLessThan(b); // 必退位
      expect(a - b).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBe(String(a - b));
      expect(decomposition?.length).toBe(3);
      // 破十分解自洽：10 - b + (a%10) === a - b
      const step2 = Number(decomposition?.[1].text.split("=")[1].trim());
      const step3 = Number(decomposition?.[2].text.split("=")[1].trim());
      expect(step2).toBe(10 - b);
      expect(step3).toBe(a - b);
    }
  });
});

// ─── sequence / clock / money / mul ──────────────────────────────

describe("sequence（等差数列）", () => {
  it("步长 1–5，? 在第 4 位，答案与前后项等差", () => {
    const rng = mulberry32(200);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L4", kind: "sequence", rng });
      const v = q.visual as { items: (number | "?")[]; step: number };
      expect(v.step).toBeGreaterThanOrEqual(1);
      expect(v.step).toBeLessThanOrEqual(5);
      expect(v.items[3]).toBe("?");
      const n2 = v.items[2] as number;
      const n4 = v.items[4] as number;
      expect(Number(q.answer)).toBe((n2 + n4) / 2); // 等差中项
    }
  });
});

describe("clock", () => {
  it("L3 只有整点；L4 出现半点；答案为 h:mm", () => {
    const rng = mulberry32(300);
    const l4Minutes = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const l3 = generateMathQuestion({ level: "L3", kind: "clock", rng });
      expect((l3.visual as { minute: number }).minute).toBe(0);
      const l4 = generateMathQuestion({ level: "L4", kind: "clock", rng });
      const minute = (l4.visual as { minute: number }).minute;
      l4Minutes.add(minute);
      expect([0, 30]).toContain(minute);
      expect(l4.answer).toMatch(/^\d{1,2}:\d{2}$/);
      expect(l4.inputMode).toBe("choice");
    }
    expect(l4Minutes.has(30)).toBe(true);
  });
});

describe("money", () => {
  it("L3 为 CNY 面值组合，答案 = 面值之和", () => {
    const rng = mulberry32(400);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L3", kind: "money", rng });
      const v = q.visual as { currency: string; notes: number[] };
      expect(v.currency).toBe("CNY");
      for (const n of v.notes) expect([1, 5, 10]).toContain(n);
      expect(Number(q.answer)).toBe(v.notes.reduce((s, x) => s + x, 0));
    }
  });
});

describe("mul（表内乘法）", () => {
  it("全覆盖：a、b ∈ 1–9", () => {
    const rng = mulberry32(500);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L5", kind: "mul", rng });
      const v = q.visual as { a: number; b: number };
      expect(v.a).toBeGreaterThanOrEqual(1);
      expect(v.a).toBeLessThanOrEqual(9);
      expect(v.b).toBeGreaterThanOrEqual(1);
      expect(v.b).toBeLessThanOrEqual(9);
      expect(Number(q.answer)).toBe(v.a * v.b);
    }
  });

  it("口诀限定模式：6 的口诀 10 题全部为 6×(1–9)", () => {
    const quiz = generateMathQuiz({
      level: "L5",
      kind: "mul",
      count: 10,
      seed: "l5-mul-6",
      fixedFactor: 6,
    });
    expect(quiz).toHaveLength(10);
    for (const q of quiz) {
      const v = q.visual as { a: number; b: number };
      expect(v.b).toBe(6);
      expect(v.a).toBeGreaterThanOrEqual(1);
      expect(v.a).toBeLessThanOrEqual(9);
      expect(Number(q.answer)).toBe(v.a * 6);
    }
  });
});

// ─── 成卷：同种子同卷 / 同卷不连续重复 ──────────────────────────

describe("generateMathQuiz", () => {
  it("同种子同卷（重放一致），不同种子不同卷", () => {
    const a = generateMathQuiz({ level: "L4", kind: "add", count: 10, seed: "d1" });
    const b = generateMathQuiz({ level: "L4", kind: "add", count: 10, seed: "d1" });
    const c = generateMathQuiz({ level: "L4", kind: "add", count: 10, seed: "d2" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("同卷内不连续出现相同 (a,b)", () => {
    for (const kind of ["add", "sub", "addCarry", "mul"] as const) {
      const quiz = generateMathQuiz({
        level: "L4",
        kind,
        count: 10,
        seed: "dup-" + kind,
        fixedFactor: kind === "mul" ? 3 : undefined,
      });
      for (let i = 1; i < quiz.length; i++) {
        const p = arith(quiz[i - 1]);
        const c = arith(quiz[i]);
        if (p && c && "a" in p && "a" in c) {
          expect(`${p.a},${p.b}#${kind}`).not.toBe(`${c.a},${c.b}#${kind}`);
        }
      }
    }
  });

  it("固定题置于卷首并与生成题混合", () => {
    const fixedItem: MathItem = {
      id: "math-9",
      level: "L3",
      kind: "clock",
      prompt: { zh: "钟面上是几点？", en: "What time?", fr: "Il est quelle heure ?" },
      answer: "3 点",
    };
    const quiz = generateMathQuiz({
      level: "L3",
      kind: "add",
      count: 10,
      seed: "mix",
      fixedItems: [fixedItem],
    });
    expect(quiz[0].source).toBe("fixed");
    expect(quiz[0].fixedId).toBe("math-9");
    expect(quiz.filter((q) => q.source === "generated").length).toBe(9);
  });
});

// ─── 输入模式 / 选项 ─────────────────────────────────────────────

describe("inputMode 与 options", () => {
  it("L1/L2 数字题为选择题（L1 选项数 2 / L2 为 3）且含正确答案；L3+ 为键盘输入", () => {
    const rng = mulberry32(600);
    for (let i = 0; i < 10; i++) {
      const l1 = generateMathQuestion({ level: "L1", kind: "add", rng });
      expect(l1.inputMode).toBe("choice");
      expect(l1.options).toHaveLength(2); // L1 optionCount = 2（levels.ts）
      expect(l1.options).toContain(l1.answer);
      const l2 = generateMathQuestion({ level: "L2", kind: "add", rng });
      expect(l2.options).toHaveLength(3);
      const l3 = generateMathQuestion({ level: "L3", kind: "add", rng });
      expect(l3.inputMode).toBe("keypad");
    }
  });

  it("compare 恒为 choice，选项为符号且含答案", () => {
    const rng = mulberry32(700);
    for (let i = 0; i < 10; i++) {
      const q = generateMathQuestion({ level: "L2", kind: "compare", rng });
      expect(q.inputMode).toBe("choice");
      expect([">", "<", "="]).toContain(q.answer);
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options?.length);
    }
  });
});

// ─── 固定题与错题本对接 ─────────────────────────────────────────

describe("mathQuestionFromFixedItem / toQuizQuestion", () => {
  it("固定题转换保留 source/fixedId/prompt", () => {
    const item: MathItem = {
      id: "math-1",
      level: "L3",
      kind: "clock",
      prompt: { zh: "几点？", en: "What time?", fr: "Il est quelle heure ?" },
      answer: "3 点",
      answerTri: { zh: "3 点", en: "3 o'clock", fr: "3 heures" },
    };
    const q = mathQuestionFromFixedItem(item, "L3");
    expect(q.source).toBe("fixed");
    expect(q.fixedId).toBe("math-1");
    expect(q.answer).toBe("3 点");
    expect(q.subject).toBe("math");
  });

  it("keypad 题：答对记 userIndex=0，答错记 null（进错题本）", () => {
    const rng = mulberry32(800);
    const q = generateMathQuestion({ level: "L3", kind: "add", rng });
    const ok = toQuizQuestion(q, { userAnswer: q.answer });
    expect(ok.userIndex).toBe(0);
    const bad = toQuizQuestion(q, { userAnswer: "999" });
    expect(bad.userIndex).toBeNull();
  });

  it("choice 题：答对回填正确下标，答错回填所选错误下标（≠ 正确下标）", () => {
    const rng = mulberry32(900);
    const q = generateMathQuestion({ level: "L2", kind: "add", rng });
    const qq = toQuizQuestion(q, { userAnswer: q.answer });
    expect(qq.options[qq.userIndex as number]).toBe(q.answer);
    const wrongChoice = q.options?.find((o) => o !== q.answer) as string;
    const bad = toQuizQuestion(q, { userAnswer: wrongChoice });
    expect(bad.userIndex).not.toBeNull();
    expect(bad.userIndex).not.toBe(qq.correctIndex);
    expect(bad.options[bad.userIndex as number]).toBe(wrongChoice);
  });

  it("normalizeAnswer 去空白并统一冒号", () => {
    expect(normalizeAnswer(" 3 : 00 ")).toBe("3:00");
    expect(normalizeAnswer("12")).toBe("12");
  });
});

// ── Phase 3：toChoiceQuizQuestion（T3.5 错题复习/每日挑战桥接）────
describe("toChoiceQuizQuestion", () => {
  it("数值答案：4 个唯一选项且含正确答案", () => {
    const mq = generateMathQuestion({
      level: "L4",
      kind: "addCarry",
      rng: mulberry32(7),
      seedTag: "t",
      index: 0,
    });
    const q = toChoiceQuizQuestion(mq, mulberry32(99));
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain(mq.answer);
    expect(q.correctIndex).toBe(q.options.findIndex((o) => o === mq.answer));
    expect(q.subject).toBe("math");
    expect(q.kind).toBe(mq.kind);
  });

  it("错误作答注入选项并定位 userIndex；正确作答 userIndex=correctIndex", () => {
    const mq = generateMathQuestion({
      level: "L4",
      kind: "sub",
      rng: mulberry32(11),
      seedTag: "t",
      index: 0,
    });
    const wrong = toChoiceQuizQuestion(mq, mulberry32(5), "999");
    expect(wrong.options).toContain("999");
    expect(wrong.userIndex).toBe(wrong.options.indexOf("999"));
    expect(wrong.userIndex).not.toBe(wrong.correctIndex);
    const right = toChoiceQuizQuestion(mq, mulberry32(5), mq.answer);
    expect(right.userIndex).toBe(right.correctIndex);
  });

  it("比较符号答案：选项为 > < = 三符号", () => {
    const mq = generateMathQuestion({
      level: "L2",
      kind: "compare",
      rng: mulberry32(3),
      seedTag: "t",
      index: 0,
    });
    expect([">", "<", "="]).toContain(mq.answer);
    const q = toChoiceQuizQuestion(mq, mulberry32(8));
    expect(q.options.slice().sort()).toEqual([">", "<", "="].sort());
    expect(q.options).toContain(mq.answer);
  });

  it("时间答案：选项共享分钟位、小时不同", () => {
    const mq = generateMathQuestion({
      level: "L4",
      kind: "clock",
      rng: mulberry32(21),
      seedTag: "t",
      index: 0,
    });
    expect(mq.answer).toMatch(/^\d{1,2}:\d{2}$/);
    const q = toChoiceQuizQuestion(mq, mulberry32(13));
    expect(q.options).toContain(mq.answer);
    const minutes = new Set(q.options.map((o) => o.split(":")[1]));
    expect(minutes.size).toBe(1);
    expect(q.options.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── 测量/图形扩量（PRD §6.6 L5）─────────────────────────────────

describe("lengthUnit（长度单位换算）", () => {
  it("L5 生成 30 题：结果为正整数，单位合法", () => {
    const rng = mulberry32(1000);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L5", kind: "lengthUnit", rng });
      expect(q.kind).toBe("lengthUnit");
      expect(q.source).toBe("generated");
      const v = q.visual as { type: "length"; value: number; fromUnit: string; toUnit: string };
      expect(v.type).toBe("length");
      expect(["km", "m", "cm", "mm"]).toContain(v.fromUnit);
      expect(["km", "m", "cm", "mm"]).toContain(v.toUnit);
      expect(Number(q.answer)).toBeGreaterThan(0);
      expect(q.unit).toBe(v.toUnit);
    }
  });

  it("同种子同卷重放一致", () => {
    const seed = "lengthUnit-replay";
    const quizA = generateMathQuiz({ level: "L5", kind: "lengthUnit", count: 5, seed });
    const quizB = generateMathQuiz({ level: "L5", kind: "lengthUnit", count: 5, seed });
    expect(JSON.stringify(quizA)).toBe(JSON.stringify(quizB));
  });
});

describe("massUnit（质量单位换算）", () => {
  it("L5 生成 30 题：结果为正整数，单位合法", () => {
    const rng = mulberry32(1100);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L5", kind: "massUnit", rng });
      expect(q.kind).toBe("massUnit");
      const v = q.visual as { type: "mass"; value: number; fromUnit: string; toUnit: string };
      expect(v.type).toBe("mass");
      expect(["t", "kg", "g", "mg"]).toContain(v.fromUnit);
      expect(["t", "kg", "g", "mg"]).toContain(v.toUnit);
      expect(Number(q.answer)).toBeGreaterThan(0);
      expect(q.unit).toBe(v.toUnit);
    }
  });

  it("同种子同卷重放一致", () => {
    const seed = "massUnit-replay";
    const quizA = generateMathQuiz({ level: "L5", kind: "massUnit", count: 5, seed });
    const quizB = generateMathQuiz({ level: "L5", kind: "massUnit", count: 5, seed });
    expect(JSON.stringify(quizA)).toBe(JSON.stringify(quizB));
  });
});

describe("axisSymmetry（轴对称判断）", () => {
  it("L5 生成 30 题：answer 与 shape hasAxis 一致", () => {
    const rng = mulberry32(1200);
    for (let i = 0; i < 30; i++) {
      const q = generateMathQuestion({ level: "L5", kind: "axisSymmetry", rng });
      expect(q.kind).toBe("axisSymmetry");
      const v = q.visual as { type: "symmetry"; shape: string; hasAxis: boolean };
      expect(v.type).toBe("symmetry");
      expect(q.answer).toBe(v.hasAxis ? "是" : "不是");
      expect(q.inputMode).toBe("choice");
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options!.length);
    }
  });

  it("同种子同卷重放一致", () => {
    const seed = "axisSymmetry-replay";
    const quizA = generateMathQuiz({ level: "L5", kind: "axisSymmetry", count: 5, seed });
    const quizB = generateMathQuiz({ level: "L5", kind: "axisSymmetry", count: 5, seed });
    expect(JSON.stringify(quizA)).toBe(JSON.stringify(quizB));
  });
});
