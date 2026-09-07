import { describe, expect, it } from "vitest";
import {
  checkLogicAnswer,
  generateLogicQuestion,
  generateLogicQuiz,
  LOGIC_CATEGORIES,
  logicQuestionFromFixedItem,
  type ClassifyPayload,
  type OddOnePayload,
  type PatternPayload,
  type SortPayload,
} from "./logicEngine";
import { mulberry32, seedFromString } from "./mathGenerator";
import type { LogicItem } from "./contentTypes";
import type { Level } from "./levels";

describe("pattern（找规律）", () => {
  it("L1 全部为 AB 模式（核心 2 项、呈现 6 项、末位挖空）", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      const q = generateLogicQuestion({ level: "L1", kind: "pattern", rng });
      const p = q.payload as PatternPayload;
      expect(p.items).toHaveLength(6);
      expect(p.items[5]).toBe("?");
      expect(p.items[0]).toBe(p.items[2]);
      expect(p.items[0]).not.toBe(p.items[1]);
      expect(p.options).toContain(q.answer);
      // AB 周期为 2：「?」在第 6 位（下标 5），接续项 = core[5 % 2] = items[1]
      expect(q.answer).toBe(p.items[1]);
      expect(checkLogicAnswer(q, q.answer)).toBe(true);
    }
  });

  it("L2 为 AAB/ABB 模式", () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 20; i++) {
      const q = generateLogicQuestion({ level: "L2", kind: "pattern", rng });
      const p = q.payload as PatternPayload;
      const core = p.items.slice(0, 3);
      const isAAB = core[0] === core[1] && core[1] !== core[2];
      const isABB = core[0] !== core[1] && core[1] === core[2];
      expect(isAAB || isABB).toBe(true);
    }
  });

  it("L3 出现 ABC 三项规律", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 10; i++) {
      const q = generateLogicQuestion({ level: "L3", kind: "pattern", rng });
      const p = q.payload as PatternPayload;
      const core = p.items.slice(0, 3);
      expect(new Set(core).size).toBe(3);
    }
  });

  it("L4 为数字等差数列（步长 1–5），选项为数字", () => {
    const rng = mulberry32(4);
    for (let i = 0; i < 20; i++) {
      const q = generateLogicQuestion({ level: "L4", kind: "pattern", rng });
      const p = q.payload as PatternPayload;
      const n1 = Number(p.items[0]);
      const n2 = Number(p.items[1]);
      const step = n2 - n1;
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(5);
      // 答案与最后一项等差
      expect(Number(q.answer)).toBe(Number(p.items[3]) + step);
      expect(p.options).toContain(q.answer);
    }
  });
});

describe("classify（分类）", () => {
  it("L1 为 2 个篮子；L2+ 出现 3 个篮子；物品均有合法归属", () => {
    const rng = mulberry32(10);
    const l1 = generateLogicQuestion({ level: "L1", kind: "classify", rng });
    expect((l1.payload as ClassifyPayload).baskets).toHaveLength(2);

    let sawThree = false;
    for (let i = 0; i < 30; i++) {
      const q = generateLogicQuestion({ level: "L2", kind: "classify", rng });
      const p = q.payload as ClassifyPayload;
      expect([2, 3]).toContain(p.baskets.length);
      if (p.baskets.length === 3) sawThree = true;
      const ids = new Set(p.baskets.map((b) => b.id));
      for (const it of p.items) expect(ids.has(it.basketId)).toBe(true);
      expect(p.items.length).toBeGreaterThanOrEqual(4);
    }
    expect(sawThree).toBe(true);
  });

  it("判分：正确分组通过，错分不通过", () => {
    const rng = mulberry32(11);
    const q = generateLogicQuestion({ level: "L2", kind: "classify", rng });
    const p = q.payload as ClassifyPayload;
    // 正确作答：直接按 items 的归属构造
    const right = JSON.stringify(
      Object.fromEntries(p.items.map((it) => [it.id, it.basketId]))
    );
    expect(checkLogicAnswer(q, right)).toBe(true);

    // 打乱归属后判分应为 false（至少一个错位）
    const wrongMap = Object.fromEntries(
      p.items.map((it, i) => [it.id, p.baskets[(i + 1) % p.baskets.length].id])
    );
    const allWrong = p.items.every((it) => wrongMap[it.id] !== it.basketId);
    if (allWrong) {
      expect(checkLogicAnswer(q, JSON.stringify(wrongMap))).toBe(false);
    }
  });
});

describe("sort（排序 / sériation）", () => {
  it("L1 3 个、L3 5 个，尺寸唯一，答案为升序 id 序列", () => {
    const rng = mulberry32(20);
    const l1 = generateLogicQuestion({ level: "L1", kind: "sort", rng });
    expect((l1.payload as SortPayload).items).toHaveLength(3);

    const l3 = generateLogicQuestion({ level: "L3", kind: "sort", rng });
    const items = (l3.payload as SortPayload).items;
    expect(items).toHaveLength(5);
    expect(new Set(items.map((it) => it.size)).size).toBe(5);
    const sorted = [...items].sort((a, b) => a.size - b.size).map((it) => it.id);
    expect(checkLogicAnswer(l3, JSON.stringify(sorted))).toBe(true);
    const swapped = [...sorted];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(checkLogicAnswer(l3, JSON.stringify(swapped))).toBe(false);
  });
});

describe("oddOne（找不同 / intrus）", () => {
  it("4 项中 1 项不属于，且多余项与其他三项类别不同", () => {
    const rng = mulberry32(30);
    for (let i = 0; i < 20; i++) {
      const q = generateLogicQuestion({ level: "L1", kind: "oddOne", rng });
      const p = q.payload as OddOnePayload;
      expect(p.items).toHaveLength(4);
      expect(p.answerIndex).toBeGreaterThanOrEqual(0);
      expect(p.answerIndex).toBeLessThan(4);
      expect(p.items[p.answerIndex]).toBe(q.answer);
      const rest = p.items.filter((_, i) => i !== p.answerIndex);
      expect(new Set(rest).size).toBe(3); // 其余三项为同一类别中的三个不同成员
      expect(rest[0]).not.toBe(q.answer);
      // 答案不属于「其余三项」的类别
      const restCategory = LOGIC_CATEGORIES.find((c) => c.members.includes(rest[0]));
      expect(restCategory).toBeTruthy();
      expect(restCategory?.members.includes(q.answer)).toBe(false);
      expect(checkLogicAnswer(q, q.answer)).toBe(true);
    }
  });
});

describe("generateLogicQuiz（成卷）", () => {
  it("同种子同组；默认 5 题；kinds 轮换", () => {
    const a = generateLogicQuiz({
      level: "L2",
      kinds: ["pattern", "oddOne"],
      seed: "logic-d1",
    });
    const b = generateLogicQuiz({
      level: "L2",
      kinds: ["pattern", "oddOne"],
      seed: "logic-d1",
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toHaveLength(5);
    expect(new Set(a.map((q) => q.kind)).size).toBe(2);
  });

  it("固定题置于组首", () => {
    const item: LogicItem = {
      id: "logic-1",
      level: "L3",
      domain: "pattern",
      kind: "pattern",
      stem: { zh: "接规律", en: "Pattern", fr: "Suite" },
      answer: "🔴",
    };
    const quiz = generateLogicQuiz({
      level: "L3",
      kinds: ["pattern"],
      seed: "logic-mix",
      fixedItems: [item],
    });
    expect(quiz[0].source).toBe("fixed");
    expect(quiz[0].fixedId).toBe("logic-1");
  });

  it("固定题转换保留 domain/stem/answer", () => {
    const item: LogicItem = {
      id: "logic-9",
      level: "L3",
      domain: "deduce",
      kind: "deduce",
      stem: { zh: "谁？", en: "Who?", fr: "Qui ?" },
      answer: "狐狸",
    };
    const q = logicQuestionFromFixedItem(item, "L3");
    expect(q.source).toBe("fixed");
    expect(q.domain).toBe("deduce");
    expect(q.answer).toBe("狐狸");
  });
});
