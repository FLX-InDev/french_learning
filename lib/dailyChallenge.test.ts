import { describe, it, expect } from "vitest";
import {
  generateDailyChallenge,
  isDailyCorrect,
  dailyItemToQuizQuestion,
  type DailyItem,
} from "./dailyChallenge";
import { expandDailyMix, type Subject } from "./levels";
import {
  mulberry32,
  seedFromString,
  normalizeAnswer,
  type MathKind,
} from "./mathGenerator";
import { stageKindsForLevel } from "./mathCurriculum";
import { langItemKey, spellItemKey, mathItemKey, logicItemKey } from "./srs";
import type { Sentence } from "./parser";
import type { Word, AlphabetCard } from "./contentTypes";
import type { SrsState } from "./workspace";

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

// ── Phase 5A：listenPick（PRD §7.6.3 / F39）───────────────────────
describe("listenPick（听音选图）", () => {
  // 补充词卡池（使 L2 有足够的 emoji 词触发 listenPick）
  const LP_WORDS: Word[] = [
    WORDS[0], // chat L2 🐱
    { id: "w_lp1", level: "L2", category: "动物", emoji: "🐶", zh: "狗", en: "dog", fr: "chien" },
    { id: "w_lp2", level: "L2", category: "动物", emoji: "🐰", zh: "兔", en: "rabbit", fr: "lapin" },
    { id: "w_lp3", level: "L2", category: "动物", emoji: "🐻", zh: "熊", en: "bear", fr: "ours" },
    { id: "w_lp4", level: "L2", category: "水果", emoji: "🍎", zh: "苹果", en: "apple", fr: "pomme" },
    { id: "w_lp5", level: "L2", category: "水果", emoji: "🍌", zh: "香蕉", en: "banana", fr: "banane" },
  ];

  it("L2（optionCount=3）每日挑战含 listenPick 题", () => {
    const items = generateDailyChallenge({
      level: "L2", date: "2026-09-09", pool: POOL, words: LP_WORDS, alphabets: ALPHABETS,
    });
    const lp = items.filter((it) => it.mode === "listenPick");
    expect(lp.length).toBeGreaterThan(0);
    lp.forEach((it) => {
      if (it.mode !== "listenPick") return;
      expect(it.options).toHaveLength(3);
      expect(new Set(it.options.map((w) => w.emoji)).size).toBe(3);
      expect(it.options.some((w) => w.id === it.word.id)).toBe(true);
      expect(it.correctIndex).toBe(it.options.findIndex((w) => w.id === it.word.id));
    });
    // 总题数不变（listenPick 占用语言名额）
    expect(items).toHaveLength(6);
  });

  it("L1（optionCount=2）每日挑战遇到词池不足时回退语言题", () => {
    const items = generateDailyChallenge({
      level: "L1", date: "2026-09-09", pool: POOL, words: WORDS, alphabets: ALPHABETS,
    });
    // L1 词池 emoji 词不足 → listenPick 不触发，全部语言题
    expect(items.every((it) => it.mode === "lang")).toBe(true);
  });

  it("isDailyCorrect：choice 与 correctIndex 比对", () => {
    const items = generateDailyChallenge({
      level: "L2", date: "2026-09-09", pool: POOL, words: LP_WORDS, alphabets: ALPHABETS,
    });
    const lp = items.find((it) => it.mode === "listenPick");
    expect(lp).toBeDefined();
    if (lp && lp.mode === "listenPick") {
      expect(isDailyCorrect(lp, { choice: lp.correctIndex })).toBe(true);
      const wrong = (lp.correctIndex + 1) % lp.options.length;
      expect(isDailyCorrect(lp, { choice: wrong })).toBe(false);
    }
  });

  it("dailyItemToQuizQuestion：subject language / kind listenPick / 选项为中文标签", () => {
    const items = generateDailyChallenge({
      level: "L2", date: "2026-09-09", pool: POOL, words: LP_WORDS, alphabets: ALPHABETS,
    });
    const lp = items.find((it) => it.mode === "listenPick");
    if (lp && lp.mode === "listenPick") {
      const rng = mulberry32(seedFromString("settle"));
      const q = dailyItemToQuizQuestion(lp, { choice: lp.correctIndex }, rng);
      expect(q.subject).toBe("language");
      expect(q.kind).toBe("listenPick");
      expect(q.options).toHaveLength(lp.options.length);
      // 选项为中文标签
      expect(q.options.every((o) => typeof o === "string")).toBe(true);
      expect(q.userIndex).toBe(q.correctIndex);
    }
  });
});

// ── Phase 6 T6-06：SRS 到期题优先（契约 §2.1）────────────────────
describe("SRS 到期题优先", () => {
  const TODAY = "2026-09-07";
  // 本地 L2 拼词池：三个词都在 L2，确保多张到期卡都能命中
  // （公共夹具 WORDS 中仅 w_test0 属 L2，w_test1/2 属 L3 不在 L2 拼词池）
  const SRS_WORDS: Word[] = [
    { id: "w_srs0", level: "L2", category: "动物", emoji: "🐱", zh: "猫", en: "cat", fr: "chat" },
    { id: "w_srs1", level: "L2", category: "动物", emoji: "🐶", zh: "狗", en: "dog", fr: "chien" },
    { id: "w_srs2", level: "L2", category: "动物", emoji: "🐰", zh: "兔", en: "rabbit", fr: "lapin" },
  ];
  const base = {
    level: "L2" as const,
    date: TODAY,
    pool: POOL,
    words: SRS_WORDS,
    alphabets: ALPHABETS,
  };
  const card = (due: string) => ({ reps: 0, interval: 1, ease: 2.5, due, lapses: 0 });

  it("无到期卡时与不传 srs 深度相等（向后兼容）", () => {
    const a = generateDailyChallenge(base);
    const b = generateDailyChallenge({ ...base, srs: { state: {}, today: TODAY } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("spell 到期卡命中词池 → 生成拼写题，总数/配比不变", () => {
    const state: SrsState = { [spellItemKey("w_srs0")]: card("2026-09-01") };
    const items = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    expect(items).toHaveLength(6);
    const counts = subjectsOf(items);
    expect(counts.language).toBe(3);
    expect(counts.math).toBe(2);
    expect(counts.logic).toBe(1);
    const spell = items.find((it) => it.mode === "spell");
    expect(spell && spell.mode === "spell" ? spell.word.id : "").toBe("w_srs0");
  });

  it("每日至多 2 道到期题（默认 limit）", () => {
    const state: SrsState = {
      [spellItemKey("w_srs0")]: card("2026-09-01"),
      [spellItemKey("w_srs1")]: card("2026-09-02"),
      [spellItemKey("w_srs2")]: card("2026-09-03"),
    };
    const items = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    expect(items.filter((it) => it.mode === "spell")).toHaveLength(2);
    expect(items).toHaveLength(6);
  });

  it("limit=3 时放 3 道到期题", () => {
    const state: SrsState = {
      [spellItemKey("w_srs0")]: card("2026-09-01"),
      [spellItemKey("w_srs1")]: card("2026-09-02"),
      [spellItemKey("w_srs2")]: card("2026-09-03"),
    };
    const items = generateDailyChallenge({
      ...base,
      srs: { state, today: TODAY, limit: 3 },
    });
    expect(items.filter((it) => it.mode === "spell")).toHaveLength(3);
  });

  it("按 due 升序优先（最早到期者先入选）", () => {
    const state: SrsState = {
      [spellItemKey("w_srs0")]: card("2026-09-03"),
      [spellItemKey("w_srs1")]: card("2026-09-01"),
      [spellItemKey("w_srs2")]: card("2026-09-02"),
    };
    const items = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    const ids = items
      .filter((it) => it.mode === "spell")
      .map((it) => (it.mode === "spell" ? it.word.id : ""));
    expect(ids.sort()).toEqual(["w_srs1", "w_srs2"]);
  });

  it("lang 到期卡命中内容池 → 该句出现在卷中", () => {
    const s = POOL[0] as Sentence;
    const state: SrsState = { [langItemKey(s.fr, s.zh, s.en)]: card("2026-09-01") };
    const items = generateDailyChallenge({
      ...base,
      level: "L1",
      srs: { state, today: TODAY },
    });
    expect(items).toHaveLength(4);
    expect(items[0].mode).toBe("lang");
    if (items[0].mode === "lang") expect(items[0].q.fr).toBe(s.fr);
  });

  it("lang 到期卡未命中内容池 → 回退常规题，总数不变", () => {
    const state: SrsState = {
      [langItemKey("不存在", "不存在", "不存在")]: card("2026-09-01"),
    };
    const items = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    expect(items).toHaveLength(6);
    expect(items.some((it) => it.mode === "spell")).toBe(false);
  });

  it("math 到期卡（本学段 kind）→ 重建题 kind 匹配且占数学名额", () => {
    const kind = stageKindsForLevel("L2")[0] as MathKind;
    const state: SrsState = { [mathItemKey(kind, "seed")]: card("2026-09-01") };
    const items = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    const math = items.filter((it) => it.mode === "math");
    expect(math).toHaveLength(2);
    expect(math[0].mode === "math" ? math[0].q.kind : "").toBe(kind);
  });

  it("非本学段 kind 的数学到期卡被跳过（回退常规题）", () => {
    const l2 = stageKindsForLevel("L2");
    const all = (["L1", "L2", "L3", "L4", "L5", "L6"] as const).flatMap((l) =>
      stageKindsForLevel(l)
    );
    const foreign = all.find((k) => !l2.includes(k));
    if (!foreign) return; // 各学段 kind 无差异时跳过
    const state: SrsState = { [mathItemKey(foreign, "seed")]: card("2026-09-01") };
    const plain = generateDailyChallenge(base);
    const withForeign = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    expect(JSON.stringify(withForeign)).toBe(JSON.stringify(plain));
  });

  it("logic 到期卡 → 重建 pattern 题", () => {
    const state: SrsState = { [logicItemKey("pattern", "AB")]: card("2026-09-01") };
    const items = generateDailyChallenge({ ...base, srs: { state, today: TODAY } });
    const logic = items.find((it) => it.mode === "logic");
    expect(logic && logic.mode === "logic" ? logic.q.kind : "").toBe("pattern");
  });

  it("L1 卷（无数学名额）遇到数学到期卡 → 忽略，卷面仍为 4 道语言题", () => {
    const kind = stageKindsForLevel("L1")[0] as MathKind;
    const state: SrsState = { [mathItemKey(kind, "seed")]: card("2026-09-01") };
    const items = generateDailyChallenge({
      ...base,
      level: "L1",
      srs: { state, today: TODAY },
    });
    expect(items).toHaveLength(4);
    expect(items.every((it) => it.subject === "language")).toBe(true);
  });

  it("含 srs 时仍当日幂等", () => {
    const state: SrsState = { [spellItemKey("w_srs0")]: card("2026-09-01") };
    const p = { ...base, srs: { state, today: TODAY } };
    expect(JSON.stringify(generateDailyChallenge(p))).toBe(
      JSON.stringify(generateDailyChallenge({ ...p }))
    );
  });
});

// ── Phase 6 T6-06：拼读扩展点（T6-07 接线）──────────────────────
describe("拼读扩展点（phonics provider）", () => {
  const base = {
    level: "L2" as const,
    date: "2026-09-09",
    pool: POOL,
    words: WORDS,
    alphabets: ALPHABETS,
  };

  it("provider 返回题目 → 替换一道语言题，总数不变", () => {
    const fake: DailyItem = {
      subject: "language",
      mode: "spell",
      word: {
        id: "w_ph",
        fr: "chat",
        zh: "猫",
        en: "cat",
        emoji: "🐱",
        source: "word",
      },
    };
    const items = generateDailyChallenge({ ...base, phonics: { provider: () => fake } });
    expect(items).toHaveLength(6);
    expect(items.some((it) => it.mode === "spell" && it.word.id === "w_ph")).toBe(true);
  });

  it("provider 返回 null → 回退常规语言题（与不传时深度相等）", () => {
    const plain = generateDailyChallenge(base);
    const withProvider = generateDailyChallenge({
      ...base,
      phonics: { provider: () => null },
    });
    expect(JSON.stringify(withProvider)).toBe(JSON.stringify(plain));
  });
});

// ── Phase 6 T6-07：拼读题接入（契约 §2.3）──────────────────────
describe("phonics（拼读题）", () => {
  const base = {
    level: "L2" as const,
    date: "2026-09-14",
    pool: POOL,
    words: WORDS,
    alphabets: ALPHABETS,
  };

  const card = {
    id: "phonics_fr_syllabique_w_test0",
    lang: "fr" as const,
    parts: ["cha", "peau"],
    whole: "chapeau",
    emoji: "🎩",
    level: "L2" as const,
  };

  it("provider 返回拼读卡 → 卷中出现 phonics 项且总数不变", () => {
    const items = generateDailyChallenge({
      ...base,
      phonics: {
        provider: (): DailyItem => ({ subject: "language", mode: "phonics", card }),
      },
    });
    expect(items).toHaveLength(6);
    const p = items.find((it) => it.mode === "phonics");
    expect(p).toBeDefined();
    if (p && p.mode === "phonics") {
      expect(p.card.whole).toBe("chapeau");
      expect(p.subject).toBe("language");
    }
  });

  it("isDailyCorrect：以 UI（PhonicsCardView）回传的 correct 判定", () => {
    const item: DailyItem = { subject: "language", mode: "phonics", card };
    expect(isDailyCorrect(item, { correct: true })).toBe(true);
    expect(isDailyCorrect(item, { correct: false })).toBe(false);
    expect(isDailyCorrect(item, {})).toBe(false);
  });

  it("dailyItemToQuizQuestion：kind=phonics 且解释含切分", () => {
    const item: DailyItem = { subject: "language", mode: "phonics", card };
    const rng = mulberry32(seedFromString("phonics_settle"));
    const q = dailyItemToQuizQuestion(item, { correct: false }, rng);
    expect(q.subject).toBe("language");
    expect(q.kind).toBe("phonics");
    expect(q.explanation).toContain("cha");
    expect(q.explanation).toContain("chapeau");
    expect(q.userIndex).toBeNull();
    const ok = dailyItemToQuizQuestion(item, { correct: true }, rng);
    expect(ok.userIndex).toBe(0);
  });
});
