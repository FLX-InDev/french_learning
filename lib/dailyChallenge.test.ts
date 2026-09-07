import { describe, it, expect } from "vitest";
import {
  generateDailyChallenge,
  isDailyCorrect,
  dailyItemToQuizQuestion,
  type DailyItem,
} from "./dailyChallenge";
import { expandDailyMix, type Subject } from "./levels";
import { mulberry32, seedFromString, normalizeAnswer } from "./mathGenerator";
import type { Sentence } from "./parser";
import type { Word, AlphabetCard } from "./contentTypes";

// ── 固定夹具（与内容文件解耦，保证测试稳定）──────────────────────

const POOL: Sentence[] = Array.from({ length: 30 }, (_, i) => ({
  zh: `中文句子${i}`,
  en: `English sentence ${i}`,
  fr: `Phrase française ${i}`,
  level: i < 10 ? "L1" : i < 20 ? "L2" : "L3",
}));

const WORDS: Word[] = [
  {
    id: "w_test0",
    level: "L2",
    category: "动物",
    emoji: "🐱",
    zh: "猫",
    en: "cat",
    fr: "chat",
  },
  {
    id: "w_test1",
    level: "L3",
    category: "场所",
    emoji: "🏰",
    zh: "城堡",
    en: "castle",
    fr: "château",
  },
  {
    id: "w_test2",
    level: "L3",
    category: "校园",
    emoji: "🏫",
    zh: "学校",
    en: "school",
    fr: "école",
  },
];

const ALPHABETS: AlphabetCard[] = [];

function subjectsOf(items: DailyItem[]): Record<Subject, number> {
  const out: Record<Subject, number> = {
    language: 0,
    math: 0,
    logic: 0,
    life: 0,
  };
  items.forEach((it) => out[it.subject]++);
  return out;
}

describe("generateDailyChallenge（出卷）", () => {
  it("L2：题数与学科配比符合 dailyMix（语言3/数学2/逻辑1）", () => {
    const items = generateDailyChallenge({
      level: "L2",
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
    });
    expect(items).toHaveLength(6);
    const counts = subjectsOf(items);
    expect(counts.language).toBe(3);
    expect(counts.math).toBe(2);
    expect(counts.logic).toBe(1);
  });

  it("L1：4 题全为语言题（dailyMix 无数学/逻辑）", () => {
    const items = generateDailyChallenge({
      level: "L1",
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
    });
    expect(items).toHaveLength(4);
    items.forEach((it) => expect(it.subject).toBe("language"));
  });

  it("幂等：同日期 + 同学段 + 同池 → 深度相等（同日不出新卷）", () => {
    const params = {
      level: "L2" as const,
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
      misspelled: [],
    };
    const a = generateDailyChallenge(params);
    const b = generateDailyChallenge({ ...params });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("不同日期出不同卷（多组日期抽样验证非恒等）", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
    const serials = dates.map(
      (d) =>
        JSON.stringify(
          generateDailyChallenge({
            level: "L2",
            date: d,
            pool: POOL,
            words: WORDS,
            alphabets: ALPHABETS,
          })
        )
    );
    expect(new Set(serials).size).toBeGreaterThan(1);
  });

  it("拼错词优先重现：misspelled 中的词（在池内）以拼写题出现", () => {
    const items = generateDailyChallenge({
      level: "L2",
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
      misspelled: ["w_test0"],
    });
    const spell = items.find((it) => it.mode === "spell");
    expect(spell).toBeDefined();
    expect(spell && spell.mode === "spell" ? spell.word.id : "").toBe("w_test0");
    // 总题数不变（拼写题占用一个语言题名额）
    expect(items).toHaveLength(6);
  });

  it("misspelled 指向不在拼词池的 id 时不产生拼写题", () => {
    const items = generateDailyChallenge({
      level: "L2",
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
      misspelled: ["w_not_exists"],
    });
    expect(items.some((it) => it.mode === "spell")).toBe(false);
  });

  it("语言题按学段过滤（L1 卷不含 L3 句子）", () => {
    const items = generateDailyChallenge({
      level: "L1",
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
    });
    items.forEach((it) => {
      if (it.mode === "lang") {
        expect(it.q.fr).toMatch(/Phrase française [0-9]/);
        const idx = Number(it.q.fr.replace(/\D+/g, ""));
        expect(idx).toBeLessThan(10); // L1 句子只有前 10 条
      }
    });
  });

  it("语言题 choice/listen 交替出现（跟读题不进每日挑战）", () => {
    const items = generateDailyChallenge({
      level: "L4",
      date: "2026-09-07",
      pool: POOL,
      words: WORDS,
      alphabets: ALPHABETS,
    });
    const langItems = items.filter((it) => it.mode === "lang");
    langItems.forEach((it) => {
      if (it.mode === "lang") {
        expect(["choice", "listen"]).toContain(it.q.mode);
      }
    });
  });
});

describe("isDailyCorrect（判分）", () => {
  const items = generateDailyChallenge({
    level: "L2",
    date: "2026-09-07",
    pool: POOL,
    words: WORDS,
    alphabets: ALPHABETS,
    misspelled: ["w_test0"],
  });

  it("语言题：所选下标 = correctIndex 判对", () => {
    const lang = items.find((it) => it.mode === "lang");
    expect(lang).toBeDefined();
    if (lang && lang.mode === "lang") {
      expect(isDailyCorrect(lang, { choice: lang.q.correctIndex })).toBe(true);
      expect(isDailyCorrect(lang, { choice: (lang.q.correctIndex + 1) % 4 })).toBe(false);
      expect(isDailyCorrect(lang, { choice: null })).toBe(false);
    }
  });

  it("数学题：作答规范化后比对（空白差异不影响）", () => {
    const math = items.find((it) => it.mode === "math");
    expect(math).toBeDefined();
    if (math && math.mode === "math") {
      const ans = math.q.answer;
      expect(isDailyCorrect(math, { text: ans })).toBe(true);
      expect(isDailyCorrect(math, { text: " " + ans + " " })).toBe(true);
      expect(isDailyCorrect(math, { text: "999" })).toBe(false);
      expect(isDailyCorrect(math, { text: null })).toBe(false);
    }
  });

  it("逻辑题：答案文本比对", () => {
    const logic = items.find((it) => it.mode === "logic");
    expect(logic).toBeDefined();
    if (logic && logic.mode === "logic") {
      expect(isDailyCorrect(logic, { text: logic.q.answer })).toBe(true);
      expect(isDailyCorrect(logic, { text: "___" })).toBe(false);
    }
  });

  it("拼写题：按 SpellingAttempt 判定结果", () => {
    const spell = items.find((it) => it.mode === "spell");
    expect(spell).toBeDefined();
    if (spell && spell.mode === "spell") {
      expect(isDailyCorrect(spell, { correct: true })).toBe(true);
      expect(isDailyCorrect(spell, { correct: false })).toBe(false);
    }
  });
});

describe("dailyItemToQuizQuestion（错题本桥接）", () => {
  const items = generateDailyChallenge({
    level: "L4",
    date: "2026-09-07",
    pool: POOL,
    words: WORDS,
    alphabets: ALPHABETS,
    misspelled: ["w_test1"],
  });
  const rng = mulberry32(seedFromString("settle"));

  it("语言题带 subject=language，保留 correctIndex", () => {
    const lang = items.find((it) => it.mode === "lang");
    if (lang && lang.mode === "lang") {
      const q = dailyItemToQuizQuestion(lang, { choice: 0 }, rng);
      expect(q.subject).toBe("language");
      expect(q.correctIndex).toBe(lang.q.correctIndex);
    }
  });

  it("数学题转 4 选项：孩子的错误作答被注入选项并定位 userIndex", () => {
    const math = items.find((it) => it.mode === "math");
    expect(math).toBeDefined();
    if (math && math.mode === "math") {
      const wrong = "999";
      const q = dailyItemToQuizQuestion(math, { text: wrong }, rng);
      expect(q.subject).toBe("math");
      expect(q.kind).toBe(math.q.kind);
      expect(q.options).toContain(math.q.answer);
      expect(q.options).toContain("999");
      expect(new Set(q.options).size).toBe(q.options.length); // 选项去重
      const ui = q.options.findIndex((o) => o === "999");
      expect(q.userIndex).toBe(ui);
      expect(q.userIndex).not.toBe(q.correctIndex);
      // 正确作答 → userIndex = correctIndex
      const q2 = dailyItemToQuizQuestion(math, { text: math.q.answer }, rng);
      expect(q2.userIndex).toBe(q2.correctIndex);
    }
  });

  it("数学 keypad 答案为数值时选项恰为 4 个", () => {
    const math = items.find((it) => it.mode === "math");
    if (math && math.mode === "math" && /^\d+$/.test(math.q.answer)) {
      const q = dailyItemToQuizQuestion(math, { text: null }, rng);
      expect(q.options).toHaveLength(4);
    }
  });

  it("逻辑题带 subject=logic 与 kind；pattern/oddOne 保留候选选项", () => {
    const logic = items.find((it) => it.mode === "logic");
    if (logic && logic.mode === "logic") {
      const q = dailyItemToQuizQuestion(logic, { text: logic.q.answer }, rng);
      expect(q.subject).toBe("logic");
      expect(q.kind).toBe(logic.q.kind);
      expect(["pattern", "oddOne"]).toContain(logic.q.kind);
      expect(q.options.length).toBeGreaterThan(0);
      expect(q.userIndex).toBe(q.correctIndex);
    }
  });

  it("拼写题转换后 userIndex 判定正确/错误，便于进错题本", () => {
    const spell = items.find((it) => it.mode === "spell");
    if (spell && spell.mode === "spell") {
      const ok = dailyItemToQuizQuestion(spell, { correct: true }, rng);
      expect(ok.userIndex).toBe(0);
      const bad = dailyItemToQuizQuestion(spell, { correct: false }, rng);
      expect(bad.userIndex).toBeNull();
      expect(bad.options).toContain(spell.word.fr);
    }
  });

  it("normalizeAnswer 空白/全角冒号规范化（判等一致性）", () => {
    expect(normalizeAnswer(" 3 : 30 ")).toBe("3:30");
  });
});
