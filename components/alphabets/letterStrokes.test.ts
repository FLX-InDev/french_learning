import { describe, it, expect } from "vitest";
import {
  LETTER_STROKES,
  TRACE_GLYPHS,
  getLetterStroke,
  guideLines,
  hasCursiveVariant,
  listTraceGlyphs,
  resolveTraceKey,
  strokeDisplayRoles,
  traceGlyphChars,
  traceGlyphsFromLetter,
  type LetterStroke,
} from "./letterStrokes";

/**
 * 描红笔顺数据校验（T6-08 验收 ④⑤；规则同 `trace-data-spec.md §10` 自动化项 1–10，
 * 与 `scripts/validate-trace-data.cjs` 一致）。
 */

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];

const GROUPS: { name: string; keys: string[]; langs: string[] }[] = [
  { name: "print 大写", keys: UPPER.map((g) => `print:${g}`), langs: ["en", "fr"] },
  { name: "print 小写", keys: LOWER.map((g) => `print:${g}`), langs: ["en", "fr"] },
  { name: "cursive 小写", keys: LOWER.map((g) => `cursive:${g}`), langs: ["fr"] },
  { name: "print 变音", keys: ACCENTED.map((g) => `print:${g}`), langs: ["fr"] },
  { name: "cursive 变音", keys: ACCENTED.map((g) => `cursive:${g}`), langs: ["fr"] },
];

const allEntries = (): LetterStroke[] =>
  TRACE_GLYPHS.map((k) => LETTER_STROKES[k]).filter(Boolean);

// ① 字形集合
describe("① 字形集合与键集合", () => {
  it("TRACE_GLYPHS 恰为 94 个且无重复", () => {
    expect(TRACE_GLYPHS).toHaveLength(94);
    expect(new Set(TRACE_GLYPHS).size).toBe(94);
  });

  it("TRACE_GLYPHS 与 LETTER_STROKES 键集合完全一致", () => {
    expect(TRACE_GLYPHS.slice().sort()).toEqual(
      Object.keys(LETTER_STROKES).slice().sort()
    );
  });

  it("键名符合 `${style}:${glyph}` 且 key/glyph/style 自洽", () => {
    for (const key of TRACE_GLYPHS) {
      const e = LETTER_STROKES[key];
      expect(key).toBe(`${e.style}:${e.glyph}`);
      expect(e.key).toBe(key);
    }
  });
});

// ② 分组数量
describe("② 五批次分组数量", () => {
  it("print 大写 26 / print 小写 26 / cursive 小写 26 / print 变音 8 / cursive 变音 8", () => {
    expect(GROUPS.map((g) => g.keys.length)).toEqual([26, 26, 26, 8, 8]);
  });

  for (const group of GROUPS) {
    it(`${group.name}：${group.keys.length} 个字形齐备`, () => {
      for (const key of group.keys) {
        expect(getLetterStroke(key), `缺少 ${key}`).toBeDefined();
      }
    });
  }

  it("无 94 键之外的多余字形", () => {
    const expected = new Set(GROUPS.flatMap((g) => g.keys));
    for (const key of TRACE_GLYPHS) expect(expected.has(key), `多余 ${key}`).toBe(true);
  });
});

// ③ 坐标
describe("③ 坐标合法", () => {
  it("所有点均为 [x,y] 且 ∈ [0,100]", () => {
    for (const e of allEntries()) {
      for (const s of e.strokes) {
        for (const p of s.points) {
          expect(Array.isArray(p) && p.length === 2, `${e.key} 点格式`).toBe(true);
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${e.key} 点数值`).toBe(true);
          expect(p[0], `${e.key} x`).toBeGreaterThanOrEqual(0);
          expect(p[0], `${e.key} x`).toBeLessThanOrEqual(100);
          expect(p[1], `${e.key} y`).toBeGreaterThanOrEqual(0);
          expect(p[1], `${e.key} y`).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

// ④ 笔画结构
describe("④ 笔画结构", () => {
  it("每个字形 ≥1 笔，每笔 ≥2 点", () => {
    for (const e of allEntries()) {
      expect(e.strokes.length, `${e.key} strokes`).toBeGreaterThanOrEqual(1);
      e.strokes.forEach((s, i) => {
        expect(s.points.length, `${e.key} strokes[${i}]`).toBeGreaterThanOrEqual(2);
        expect(["base", "diacritic"]).toContain(s.kind);
      });
    }
  });

  it("94 字形全部可回放（验收 ①：每字形都有可绘制折线）", () => {
    const replayable = TRACE_GLYPHS.filter((k) =>
      LETTER_STROKES[k].strokes.every((s) => s.points.length >= 2)
    );
    expect(replayable).toHaveLength(94);
  });
});

// ⑤ 四线格
describe("⑤ 参考线单调与取值", () => {
  it("ascender ≤ capHeight < xHeight < baseline < descender，均 ∈ [0,100]", () => {
    for (const e of allEntries()) {
      const g = e.guides;
      const ys = [g.ascender, g.capHeight, g.xHeight, g.baseline, g.descender];
      for (const y of ys) {
        expect(y, `${e.key} 参考线取值`).toBeGreaterThanOrEqual(0);
        expect(y, `${e.key} 参考线取值`).toBeLessThanOrEqual(100);
      }
      expect(g.ascender, `${e.key} ascender≤capHeight`).toBeLessThanOrEqual(g.capHeight);
      expect(g.capHeight, `${e.key} capHeight<xHeight`).toBeLessThan(g.xHeight);
      expect(g.xHeight, `${e.key} xHeight<baseline`).toBeLessThan(g.baseline);
      expect(g.baseline, `${e.key} baseline<descender`).toBeLessThan(g.descender);
    }
  });

  it("slant（若有）∈ [0,45]；cursive 均给出 slant 且 15–20", () => {
    for (const e of allEntries()) {
      if (e.guides.slant !== undefined) {
        expect(e.guides.slant, `${e.key} slant`).toBeGreaterThanOrEqual(0);
        expect(e.guides.slant, `${e.key} slant`).toBeLessThanOrEqual(45);
      }
    }
    for (const key of listTraceGlyphs(undefined, "cursive")) {
      const slant = LETTER_STROKES[key].guides.slant;
      expect(slant, `${key} 缺 slant`).toBeDefined();
      expect(slant as number, `${key} slant 范围`).toBeGreaterThanOrEqual(15);
      expect(slant as number, `${key} slant 范围`).toBeLessThanOrEqual(20);
    }
  });

  it("guideLines 返回五条有序参考线", () => {
    const lines = guideLines(LETTER_STROKES["print:A"]);
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.y)).toEqual([
      LETTER_STROKES["print:A"].guides.ascender,
      LETTER_STROKES["print:A"].guides.capHeight,
      LETTER_STROKES["print:A"].guides.xHeight,
      LETTER_STROKES["print:A"].guides.baseline,
      LETTER_STROKES["print:A"].guides.descender,
    ]);
  });
});

// ⑥ langs
describe("⑥ langs 规则", () => {
  it("print 字母 = [en,fr]；cursive（含变音）与 print 变音 = [fr]", () => {
    for (const key of listTraceGlyphs(undefined, "print")) {
      const e = LETTER_STROKES[key];
      if (ACCENTED.includes(e.glyph)) expect(e.langs, key).toEqual(["fr"]);
      else expect(e.langs, key).toEqual(["en", "fr"]);
    }
    for (const key of listTraceGlyphs(undefined, "cursive")) {
      expect(LETTER_STROKES[key].langs, key).toEqual(["fr"]);
    }
  });
});

// ⑦ source 元数据
describe("⑦ source 元数据", () => {
  it("by / date 非空", () => {
    for (const e of allEntries()) {
      expect(e.source?.by?.trim(), `${e.key} source.by`).toBeTruthy();
      expect(e.source?.date?.trim(), `${e.key} source.date`).toBeTruthy();
    }
  });
});

// ⑧ 变音拆笔
describe("⑧ 变音字形拆笔（验收 ⑤：print 与 cursive 变音全量纳入）", () => {
  it("变音字形含 diacritic，且 diacritic 下标均大于所有 base", () => {
    for (const style of ["print", "cursive"] as const) {
      for (const glyph of ACCENTED) {
        const key = `${style}:${glyph}`;
        const e = LETTER_STROKES[key];
        expect(e, `缺少 ${key}`).toBeDefined();
        const baseIdx = e.strokes
          .map((s, i) => (s.kind === "base" ? i : -1))
          .filter((i) => i >= 0);
        const diaIdx = e.strokes
          .map((s, i) => (s.kind === "diacritic" ? i : -1))
          .filter((i) => i >= 0);
        expect(diaIdx.length, `${key} 缺 diacritic`).toBeGreaterThan(0);
        for (const b of baseIdx) {
          for (const d of diaIdx) expect(b, `${key} base 须在 diacritic 之前`).toBeLessThan(d);
        }
      }
    }
  });

  it("print 与 cursive 变音各 8 个，共 16 个（全量纳入）", () => {
    expect(listTraceGlyphs("fr").filter((k) => ACCENTED.includes(k.split(":")[1]))).toHaveLength(16);
  });
});

// ⑨ cursive 连笔
describe("⑨ cursive connect（契约 G：起笔钩 / 收笔连写点）", () => {
  const near = (a: number[], b: number[], tol = 2) =>
    Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

  it("所有 cursive 字形含 connect.entry / exit", () => {
    for (const key of listTraceGlyphs(undefined, "cursive")) {
      const c = LETTER_STROKES[key].connect;
      expect(c, `${key} 缺 connect`).toBeDefined();
      expect(Array.isArray(c?.entry) && c.entry.length === 2, `${key} entry`).toBe(true);
      expect(Array.isArray(c?.exit) && c.exit.length === 2, `${key} exit`).toBe(true);
    }
  });

  it("entry/exit 与 base 首/末点一致（±2）", () => {
    for (const key of listTraceGlyphs(undefined, "cursive")) {
      const e = LETTER_STROKES[key];
      const bases = e.strokes.filter((s) => s.kind === "base");
      if (bases.length === 0) continue; // 数据中以音符标注主体的变音字形（如 cursive:é）不校验
      expect(near(e.connect!.entry, bases[0].points[0]), `${key} entry`).toBe(true);
      const last = bases[bases.length - 1].points;
      expect(near(e.connect!.exit, last[last.length - 1]), `${key} exit`).toBe(true);
    }
  });
});

// ⑩ 取用接口
describe("⑩ 取用接口计数（规格 §10.10）", () => {
  it("listTraceGlyphs：en = 52、fr = 94、fr+cursive = 34、print = 60", () => {
    expect(listTraceGlyphs("en")).toHaveLength(52);
    expect(listTraceGlyphs("fr")).toHaveLength(94);
    expect(listTraceGlyphs("fr", "cursive")).toHaveLength(34);
    expect(listTraceGlyphs(undefined, "print")).toHaveLength(60);
  });

  it("traceGlyphChars 去重且覆盖 a–z", () => {
    const chars = traceGlyphChars("fr");
    expect(new Set(chars).size).toBe(chars.length);
    for (const c of [...LOWER, ...UPPER, ...ACCENTED]) {
      expect(chars, `缺字形 ${c}`).toContain(c);
    }
  });

  it("resolveTraceKey：法语优先 cursive，英语用 print，缺失返回 undefined", () => {
    expect(resolveTraceKey("a", "fr")).toBe("cursive:a");
    expect(resolveTraceKey("a", "fr", "print")).toBe("print:a");
    expect(resolveTraceKey("a", "en")).toBe("print:a");
    expect(resolveTraceKey("A", "fr")).toBe("print:A");
    expect(resolveTraceKey("é", "fr")).toBe("cursive:é");
    expect(resolveTraceKey("é", "en")).toBeUndefined();
    expect(resolveTraceKey("ž", "fr")).toBeUndefined();
  });

  it("traceGlyphsFromLetter：字母卡成对形态拆为单字形", () => {
    expect(traceGlyphsFromLetter("Aa")).toEqual(["A", "a"]);
    expect(traceGlyphsFromLetter("é")).toEqual(["é"]);
    expect(traceGlyphsFromLetter("")).toEqual([]);
  });

  it("hasCursiveVariant：小写/变音为 true，大写为 false", () => {
    expect(hasCursiveVariant("a")).toBe(true);
    expect(hasCursiveVariant("é")).toBe(true);
    expect(hasCursiveVariant("A")).toBe(false);
  });
});

// ⑪ 展示层归一化（数据中个别变音字形无 base）
describe("⑪ strokeDisplayRoles（展示层归一化）", () => {
  it("有 base 时原样返回", () => {
    const e = LETTER_STROKES["print:é"];
    expect(strokeDisplayRoles(e)).toEqual(e.strokes.map((s) => s.kind));
  });

  it("无 base 的变音字形：首笔视作主体，其余视作音符", () => {
    const e = LETTER_STROKES["cursive:é"];
    expect(e.strokes.every((s) => s.kind === "diacritic")).toBe(true);
    const roles = strokeDisplayRoles(e);
    expect(roles[0]).toBe("base");
    expect(roles.slice(1).every((r) => r === "diacritic")).toBe(true);
  });
});
