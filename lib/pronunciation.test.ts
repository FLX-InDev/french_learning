import { describe, expect, it } from "vitest";
import {
  alignWords,
  normalizeText,
  pickBestCandidate,
  scorePronunciation,
  tokenize,
  type Candidate,
} from "./pronunciation";

describe("normalizeText", () => {
  it("小写化并去掉变音符号", () => {
    expect(normalizeText("ÉLève")).toBe("eleve");
    expect(normalizeText("Ça va")).toBe("ca va");
    expect(normalizeText("Leçon")).toBe("lecon");
  });

  it("删除撇号以消除法语省音的分词歧义", () => {
    // 直撇号 / 弯撇号 /  Modifier letter apostrophe
    expect(normalizeText("J'aime")).toBe("jaime");
    expect(normalizeText("l’eau")).toBe("leau");
    expect(normalizeText("cʼest")).toBe("cest");
  });

  it("标点与多余空白折叠为单个空格并去首尾", () => {
    expect(normalizeText("Bonjour,   le monde!")).toBe("bonjour le monde");
    expect(normalizeText("  ,.!  ")).toBe("");
    expect(normalizeText("")).toBe("");
  });

  it("保留数字", () => {
    expect(normalizeText("J'ai 3 pommes")).toBe("jai 3 pommes");
  });
});

describe("tokenize", () => {
  it("空串与纯标点返回空数组", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("?!")).toEqual([]);
  });

  it("按空格切分归一化后的词", () => {
    expect(tokenize("Bonjour le monde")).toEqual([
      "bonjour",
      "le",
      "monde",
    ]);
  });
});

describe("alignWords", () => {
  it("完全一致：全部命中，无漏读无多读", () => {
    const r = alignWords(["a", "b", "c"], ["a", "b", "c"]);
    expect(r).toEqual({
      matched: ["a", "b", "c"],
      missing: [],
      extra: [],
    });
  });

  it("漏读：目标词未说出", () => {
    const r = alignWords(["a", "b", "c"], ["a", "c"]);
    expect(r.matched).toEqual(["a", "c"]);
    expect(r.missing).toEqual(["b"]);
    expect(r.extra).toEqual([]);
  });

  it("多读：说出了非目标词", () => {
    const r = alignWords(["a", "b"], ["a", "x", "b"]);
    expect(r.matched).toEqual(["a", "b"]);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual(["x"]);
  });

  it("完全没有重合：全部记为漏读 + 多读", () => {
    const r = alignWords(["a"], ["z"]);
    expect(r.matched).toEqual([]);
    expect(r.missing).toEqual(["a"]);
    expect(r.extra).toEqual(["z"]);
  });

  it("目标为空时说出的词全部记为多读", () => {
    const r = alignWords([], ["a", "b"]);
    expect(r.matched).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual(["a", "b"]);
  });

  it("按最长公共子序列对齐（顺序敏感）", () => {
    // LCS 为 a,b → 逆序的 b,a 会被拆成 missing/extra
    const r = alignWords(["a", "b"], ["b", "a"]);
    expect(r.matched).toHaveLength(1);
    expect(r.missing).toHaveLength(1);
    expect(r.extra).toHaveLength(1);
  });
});

describe("pickBestCandidate", () => {
  it("挑与目标 F1 最高的候选", () => {
    const cands: Candidate[] = [
      { transcript: "bonjour le monde", confidence: 0.9 },
      { transcript: "au revoir", confidence: 0.99 },
    ];
    expect(pickBestCandidate("Bonjour le monde", cands).transcript).toBe(
      "bonjour le monde"
    );
  });

  it("F1 并列时取置信度更高的", () => {
    const cands: Candidate[] = [
      { transcript: "bonjour le monde", confidence: 0.5 },
      { transcript: "BONJOUR LE MONDE", confidence: 0.8 },
    ];
    const best = pickBestCandidate("Bonjour le monde", cands);
    expect(best.transcript).toBe("BONJOUR LE MONDE");
    expect(best.confidence).toBe(0.8);
  });

  it("忽略大小写与变音符号差异", () => {
    const cands: Candidate[] = [
      { transcript: "L'éléphant", confidence: 1 },
      { transcript: "la pomme", confidence: 1 },
    ];
    expect(pickBestCandidate("l'elephant", cands).transcript).toBe(
      "L'éléphant"
    );
  });
});

describe("scorePronunciation", () => {
  it("无候选（未识别到语音）→ 0 分并给出重试提示", () => {
    const r = scorePronunciation("Bonjour", [], "fr");
    expect(r.score).toBe(0);
    expect(r.transcript).toBe("");
    expect(r.missing).toEqual(["bonjour"]);
    expect(r.feedback.join()).toContain("未检测到有效语音");
  });

  it("识别结果为空串 → 0 分", () => {
    const r = scorePronunciation("Bonjour", [
      { transcript: "", confidence: 1 },
    ], "fr");
    expect(r.score).toBe(0);
    expect(r.feedback.join()).toContain("未检测到有效语音");
  });

  it("完全匹配 + 置信度 1 → 100 分", () => {
    const r = scorePronunciation("Bonjour le monde", [
      { transcript: "Bonjour le monde", confidence: 1 },
    ], "fr");
    expect(r.score).toBe(100);
    expect(r.matched).toEqual(["bonjour", "le", "monde"]);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
  });

  it("完全匹配但置信度缺失 → 用 0.8 兜底（0.7*1 + 0.3*0.8 = 94）", () => {
    const r = scorePronunciation("Bonjour", [
      { transcript: "bonjour", confidence: 0 },
    ], "fr");
    expect(r.confidence).toBe(0.8);
    expect(r.score).toBe(94);
  });

  it("置信度越界时被 clamp 到 [0,1]", () => {
    const r = scorePronunciation("Bonjour", [
      { transcript: "bonjour", confidence: 5 },
    ], "fr");
    expect(r.confidence).toBe(1);
    expect(r.score).toBe(100);
  });

  it("漏读：recall 下降使分数低于及格线（3 词命中 1 词 → 59 分）", () => {
    const r = scorePronunciation("Bonjour le monde", [
      { transcript: "bonjour", confidence: 0.8 },
    ], "fr");
    expect(r.recall).toBeCloseTo(1 / 3, 5);
    expect(r.precision).toBe(1);
    expect(r.missing).toEqual(["le", "monde"]);
    const expected = Math.round(100 * (0.7 * ((2 * 1 * (1 / 3)) / (1 + 1 / 3)) + 0.3 * 0.8));
    expect(r.score).toBe(expected);
    expect(r.score).toBe(59);
    expect(r.score).toBeLessThan(60);
  });

  it("及格线 PASS_SCORE(60) 附近：全对低置信度可过，全错不可过", () => {
    const pass = scorePronunciation("Bonjour", [
      { transcript: "bonjour", confidence: 0.1 },
    ], "fr");
    expect(pass.score).toBeGreaterThanOrEqual(60);

    const fail = scorePronunciation("Bonjour le monde", [
      { transcript: "au revoir", confidence: 0.9 },
    ], "fr");
    expect(fail.matched).toEqual([]);
    expect(fail.score).toBeLessThan(60);
  });

  it("多读词计入 extra 并给出反馈", () => {
    const r = scorePronunciation("Bonjour", [
      { transcript: "bonjour tout le monde", confidence: 0.9 },
    ], "fr");
    expect(r.matched).toEqual(["bonjour"]);
    expect(r.extra).toEqual(["tout", "le", "monde"]);
    expect(r.feedback.join()).toContain("多读");
  });

  it("多候选时采用最优候选的分数", () => {
    const r = scorePronunciation("Bonjour le monde", [
      { transcript: "au revoir", confidence: 0.99 },
      { transcript: "bonjour le monde", confidence: 0.6 },
    ], "fr");
    expect(r.transcript).toBe("bonjour le monde");
    expect(r.matched).toHaveLength(3);
  });

  it("低置信度且有命中时追加安静环境提示", () => {
    const r = scorePronunciation("Bonjour", [
      { transcript: "bonjour", confidence: 0.3 },
    ], "fr");
    expect(r.feedback.join()).toContain("置信度较低");
  });

  it("反馈按语言给不同要点", () => {
    const fr = scorePronunciation("Bonjour", [
      { transcript: "bonjour", confidence: 1 },
    ], "fr");
    const en = scorePronunciation("Hello", [
      { transcript: "hello", confidence: 1 },
    ], "en");
    expect(fr.feedback.join()).toContain("联诵");
    expect(en.feedback.join()).toContain("元音");
  });

  it("分数始终落在 0-100 区间", () => {
    const cases: [string, Candidate[]][] = [
      ["Bonjour", []],
      ["Bonjour", [{ transcript: "bonjour", confidence: 1 }]],
      ["Bonjour", [{ transcript: "x y z w", confidence: 0 }]],
      ["", [{ transcript: "", confidence: 1 }]],
    ];
    for (const [target, cands] of cases) {
      const r = scorePronunciation(target, cands, "fr");
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
