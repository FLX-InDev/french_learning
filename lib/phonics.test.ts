import { describe, it, expect } from "vitest";
import {
  phonicsScriptFor,
  splitSyllablesFr,
  splitGraphemesFr,
  splitCvc,
  phonicsPool,
  nextPhonicsCard,
  FR_SYLLABLE_OVERRIDES,
  type PhonicsCard,
} from "./phonics";
import { mulberry32, seedFromString } from "./mathGenerator";
import type { Word } from "./contentTypes";
import type { Level } from "./levels";

// ── DG-1 学段映射（契约 §2.6，必须单测）──────────────────────────
describe("phonicsScriptFor（DG-1 分龄双体系）", () => {
  it("L1–L3 → syllabique", () => {
    (["L1", "L2", "L3"] as Level[]).forEach((l) => {
      expect(phonicsScriptFor(l)).toBe("syllabique");
    });
  });

  it("L4–L6 → mixte", () => {
    (["L4", "L5", "L6"] as Level[]).forEach((l) => {
      expect(phonicsScriptFor(l)).toBe("mixte");
    });
  });
});

// ── syllabique 音节切分 ─────────────────────────────────────────
describe("splitSyllablesFr（syllabique 音节切分）", () => {
  it("单音节词整体返回", () => {
    expect(splitSyllablesFr("chat")).toEqual(["chat"]);
    expect(splitSyllablesFr("chien")).toEqual(["chien"]);
    expect(splitSyllablesFr("fleur")).toEqual(["fleur"]);
  });

  it("V-CV：单辅音归后一音节", () => {
    expect(splitSyllablesFr("chapeau")).toEqual(["cha", "peau"]);
    expect(splitSyllablesFr("banane")).toEqual(["ba", "na", "ne"]);
    expect(splitSyllablesFr("école")).toEqual(["é", "co", "le"]);
    expect(splitSyllablesFr("maison")).toEqual(["mai", "son"]);
    expect(splitSyllablesFr("oiseau")).toEqual(["oi", "seau"]);
    expect(splitSyllablesFr("château")).toEqual(["châ", "teau"]);
  });

  it("VC-CV：双辅音分开（ar-bre / fil-le）", () => {
    expect(splitSyllablesFr("arbre")).toEqual(["arb", "re"]);
    expect(splitSyllablesFr("fille")).toEqual(["fil", "le"]);
  });

  it("合法首簇（bl/br/tr…）整体归后（ta-ble）", () => {
    expect(splitSyllablesFr("table")).toEqual(["ta", "ble"]);
  });

  it("大小写与空白容错；空串返回空数组", () => {
    expect(splitSyllablesFr("  Chapeau ")).toEqual(["cha", "peau"]);
    expect(splitSyllablesFr("")).toEqual([]);
  });
});

// ── mixte 字素切分 ─────────────────────────────────────────────
describe("splitGraphemesFr（mixte 字素切分）", () => {
  it("二合/三合字素作为整体", () => {
    expect(splitGraphemesFr("chapeau")).toEqual(["ch", "a", "p", "eau"]);
    expect(splitGraphemesFr("chat")).toEqual(["ch", "a", "t"]);
    expect(splitGraphemesFr("chien")).toEqual(["ch", "i", "en"]);
  });

  it("未命中多字符字素时按单字符切分", () => {
    expect(splitGraphemesFr("table")).toEqual(["t", "a", "b", "l", "e"]);
  });

  it("与 syllabique 结果不同（体系确有差异）", () => {
    expect(splitGraphemesFr("chapeau")).not.toEqual(splitSyllablesFr("chapeau"));
  });
});

// ── 英语 CVC ───────────────────────────────────────────────────
describe("splitCvc（英语 CVC 三卡）", () => {
  it("严格 CVC 通过", () => {
    expect(splitCvc("cat")).toEqual(["c", "a", "t"]);
    expect(splitCvc("dog")).toEqual(["d", "o", "g"]);
    expect(splitCvc("pig")).toEqual(["p", "i", "g"]);
  });

  it("非 3 字母 / 非 CVC 返回 null", () => {
    expect(splitCvc("chat")).toBeNull();
    expect(splitCvc("at")).toBeNull();
    expect(splitCvc("tree")).toBeNull();
    expect(splitCvc("eat")).toBeNull(); // 首字母为元音
    expect(splitCvc("sky")).toBeNull(); // 尾字母为元音
  });
});

// ── 题池 ───────────────────────────────────────────────────────
describe("phonicsPool（按学段组装）", () => {
  const WORDS: Word[] = [
    { id: "w_chat", level: "L2", category: "动物", emoji: "🐱", zh: "猫", en: "cat", fr: "chat" },
    { id: "w_chapeau", level: "L2", category: "衣物", emoji: "🎩", zh: "帽子", en: "hat", fr: "chapeau" },
    { id: "w_ecole", level: "L3", category: "校园", emoji: "🏫", zh: "学校", en: "school", fr: "école" },
    { id: "w_dog", level: "L4", category: "动物", emoji: "🐶", zh: "狗", en: "dog", fr: "chien" },
    { id: "w_table", level: "L4", category: "家具", emoji: "🪑", zh: "桌子", en: "table", fr: "table" },
  ];

  it("L2（syllabique）：仅法语卡，且切分块 ≥ 2（chat 单音节被排除）", () => {
    const pool = phonicsPool("L2", WORDS);
    expect(pool.every((c) => c.lang === "fr")).toBe(true);
    expect(pool.map((c) => c.whole)).toEqual(["chapeau"]);
    expect(pool[0].parts).toEqual(["cha", "peau"]);
  });

  it("L3 学段过滤：不含 L2 词，含 L3 的 école", () => {
    const pool = phonicsPool("L3", WORDS);
    expect(pool.map((c) => c.whole)).toEqual(["école"]);
    expect(pool[0].parts).toEqual(["é", "co", "le"]);
  });

  it("L4（mixte）：法语走字素切分，并含英语 CVC 卡", () => {
    const pool = phonicsPool("L4", WORDS);
    const fr = pool.filter((c) => c.lang === "fr");
    const en = pool.filter((c) => c.lang === "en");
    // chien → [ch, i, en]；table → 单字符切分
    expect(fr.map((c) => c.whole).sort()).toEqual(["chien", "table"]);
    expect(fr.find((c) => c.whole === "chien")?.parts).toEqual(["ch", "i", "en"]);
    // dog → CVC 收录；table → 非 CVC（5 字母）排除
    expect(en.map((c) => c.whole)).toEqual(["dog"]);
    expect(en[0].parts).toEqual(["d", "o", "g"]);
  });

  it("卡片 id 唯一且带体系标识", () => {
    const pool = phonicsPool("L4", WORDS);
    const ids = pool.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.includes("mixte") || id.includes("cvc"))).toBe(true);
  });

  it("无匹配学段 → 空池", () => {
    expect(phonicsPool("L1", WORDS)).toEqual([]);
  });
});

// ── 抽卡 ───────────────────────────────────────────────────────
describe("nextPhonicsCard", () => {
  const pool: PhonicsCard[] = [
    { id: "a", lang: "fr", parts: ["cha", "peau"], whole: "chapeau", level: "L2" },
    { id: "b", lang: "fr", parts: ["ta", "ble"], whole: "table", level: "L2" },
  ];

  it("空池返回 null", () => {
    expect(nextPhonicsCard([], mulberry32(1))).toBeNull();
  });

  it("同 rng 种子结果可复现，且落在池内", () => {
    const rng1 = mulberry32(seedFromString("phonics"));
    const rng2 = mulberry32(seedFromString("phonics"));
    const c1 = nextPhonicsCard(pool, rng1);
    const c2 = nextPhonicsCard(pool, rng2);
    expect(c1).toEqual(c2);
    expect(pool).toContainEqual(c1);
  });

  it("单元素池恒返回该元素", () => {
    const single = [pool[0]];
    expect(nextPhonicsCard(single, mulberry32(999))).toBe(single[0]);
  });
});

// ── 切分例外表（母语者复核修正机制）──────────────────────────────
describe("切分例外表（复核后可二次修正，无需改算法）", () => {
  it("默认例外表为空 → 走算法", () => {
    expect(FR_SYLLABLE_OVERRIDES).toEqual({});
    expect(splitSyllablesFr("fille")).toEqual(["fil", "le"]);
  });

  it("命中学音节例外表 → 直接返回覆盖值，其它词不受影响", () => {
    const overrides = { fille: ["fi", "lle"] };
    expect(splitSyllablesFr("fille", overrides)).toEqual(["fi", "lle"]);
    expect(splitSyllablesFr("table", overrides)).toEqual(["ta", "ble"]);
  });

  it("大小写与空白容错（例外表以小写词形为键）", () => {
    const overrides = { fille: ["fi", "lle"] };
    expect(splitSyllablesFr("  Fille ", overrides)).toEqual(["fi", "lle"]);
  });

  it("字素切分例外表同理", () => {
    const overrides = { chapeau: ["cha", "peau"] };
    expect(splitGraphemesFr("chapeau", overrides)).toEqual(["cha", "peau"]);
    expect(splitGraphemesFr("chien", overrides)).toEqual(["ch", "i", "en"]);
  });
});
