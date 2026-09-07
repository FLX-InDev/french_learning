import { describe, it, expect } from "vitest";
import {
  splitTiles,
  isSpellingEligible,
  scrambleTiles,
  isSpellingCorrect,
  buildSpellingPool,
  MIN_TILES,
  MAX_TILES,
  type SpellingWord,
} from "./spelling";
import { mulberry32, seedFromString } from "./mathGenerator";
import { getAllWords, getAllAlphabets } from "./parser";

describe("splitTiles（瓦片拆分）", () => {
  it("普通单词逐字符拆分并小写化", () => {
    expect(splitTiles("Chat")).toEqual(["c", "h", "a", "t"]);
  });

  it("变音符字符保留为独立瓦片（château → â 是一张瓦片）", () => {
    const tiles = splitTiles("château");
    expect(tiles).toHaveLength(7);
    expect(tiles).toContain("â");
    expect(tiles.join("")).toBe("château");
  });

  it("撇号并入前一字母块（PRD §7.5.4 撇号整块处理；变音符保留）", () => {
    expect(splitTiles("l'école")).toEqual(["l'", "é", "c", "o", "l", "e"]);
  });

  it("弯撇号（’）同样并入前块", () => {
    expect(splitTiles("l’eau")).toEqual(["l'", "e", "a", "u"]);
  });
});

describe("isSpellingEligible（长度与字符过滤）", () => {
  it(`接受 ${MIN_TILES}–${MAX_TILES} 瓦片的纯字母词`, () => {
    expect(isSpellingEligible("thé")).toBe(true); // 3
    expect(isSpellingEligible("chat")).toBe(true); // 4
    expect(isSpellingEligible("château")).toBe(true); // 7
  });

  it("拒绝过短/过长", () => {
    expect(isSpellingEligible("où")).toBe(false); // 2
    expect(isSpellingEligible("chaussure")).toBe(false); // 9
  });

  it("拒绝含空格/连字符/数字的词", () => {
    expect(isSpellingEligible("petit train")).toBe(false);
    expect(isSpellingEligible("grand-père")).toBe(false);
    expect(isSpellingEligible("abc123")).toBe(false);
  });
});

describe("scrambleTiles（种子化乱序）", () => {
  it("同种子结果一致（可重放）", () => {
    const a = scrambleTiles(["c", "h", "â", "t"], mulberry32(seedFromString("x")));
    const b = scrambleTiles(["c", "h", "â", "t"], mulberry32(seedFromString("x")));
    expect(a).toEqual(b);
  });

  it("不同种子大概率不同顺序", () => {
    const orig = ["c", "h", "a", "t", "e", "a", "u"];
    const results = new Set<string>();
    for (let i = 0; i < 8; i++) {
      results.add(
        scrambleTiles(orig, mulberry32(seedFromString("seed" + i))).join("")
      );
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("乱序不改变瓦片多重集合", () => {
    const tiles = ["a", "b", "a", "c"];
    const out = scrambleTiles(tiles, mulberry32(42));
    expect(out.slice().sort()).toEqual(tiles.slice().sort());
  });

  it("全同瓦片不陷入重洗循环", () => {
    expect(scrambleTiles(["a", "a", "a"], mulberry32(1))).toEqual(["a", "a", "a"]);
  });
});

describe("isSpellingCorrect（判分）", () => {
  const tiles = splitTiles("château");
  it("按序拼对返回 true", () => {
    expect(isSpellingCorrect(tiles, "château")).toBe(true);
  });
  it("顺序错误返回 false", () => {
    expect(isSpellingCorrect(tiles.slice().reverse(), "château")).toBe(false);
  });
  it("数量不符返回 false", () => {
    expect(isSpellingCorrect(tiles.slice(0, 5), "château")).toBe(false);
  });
});

describe("buildSpellingPool（真实内容题源）", () => {
  const pool = buildSpellingPool(getAllWords(), getAllAlphabets());

  it("题源充足（≥ 100 词，覆盖 C2 词卡 + 字母表代表词）", () => {
    expect(pool.length).toBeGreaterThanOrEqual(100);
  });

  it("所有条目均为合法瓦片长度", () => {
    pool.forEach((w) => {
      const n = splitTiles(w.fr).length;
      expect(n).toBeGreaterThanOrEqual(MIN_TILES);
      expect(n).toBeLessThanOrEqual(MAX_TILES);
    });
  });

  it("按 fr 去重（大小写不敏感）", () => {
    const seen = new Set<string>();
    pool.forEach((w) => {
      const key = w.fr.toLowerCase();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
  });

  it("包含变音符代表词 château（验收：变音符词可拼出）", () => {
    expect(pool.some((w) => w.fr.toLowerCase() === "château")).toBe(true);
  });

  it("学段过滤：L3 池含 château，L1 池不含 L3 词", () => {
    const l3 = buildSpellingPool(getAllWords(), getAllAlphabets(), "L3");
    const l1 = buildSpellingPool(getAllWords(), getAllAlphabets(), "L1");
    expect(l3.some((w) => w.fr.toLowerCase() === "château")).toBe(true);
    expect(l1.some((w) => w.fr.toLowerCase() === "château")).toBe(false);
    expect(l1.length).toBeGreaterThan(0);
  });

  it("拼词条目保留词 id（错词队列可回链）", () => {
    const sample: SpellingWord | undefined = pool.find((w) => w.source === "word");
    expect(sample?.id).toMatch(/^w-\d+$/);
  });
});
