import { describe, it, expect } from "vitest";
import {
  LETTER_STROKES,
  TRACE_GLYPHS,
  accentGlyphChars,
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
import { ACCENT_KEYS } from "@/lib/spelling";

/**
 * 描红笔顺数据校验（T6-08 验收 ④⑤；规则同 `trace-data-spec.md §10` 自动化项 1–10，
 * 与 `scripts/validate-trace-data.cjs` 一致）。
 */

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
/** 常用变音 13 个（顺序对齐 packs/frcursive/accentcase.md） */
const ACCENTED = ["é", "à", "è", "ù", "â", "ê", "î", "ô", "û", "ë", "ï", "ü", "ç"];
/** 规范字形总数：print 26+26+13 / cursive 26+26+13 */
const TOTAL = 130;

const GROUPS: { name: string; keys: string[]; langs: string[] }[] = [
  { name: "print 大写", keys: UPPER.map((g) => `print:${g}`), langs: ["en", "fr"] },
  { name: "print 小写", keys: LOWER.map((g) => `print:${g}`), langs: ["en", "fr"] },
  { name: "cursive 大写", keys: UPPER.map((g) => `cursive:${g}`), langs: ["fr"] },
  { name: "cursive 小写", keys: LOWER.map((g) => `cursive:${g}`), langs: ["fr"] },
  { name: "print 变音", keys: ACCENTED.map((g) => `print:${g}`), langs: ["fr"] },
  { name: "cursive 变音", keys: ACCENTED.map((g) => `cursive:${g}`), langs: ["fr"] },
];

const allEntries = (): LetterStroke[] =>
  TRACE_GLYPHS.map((k) => LETTER_STROKES[k]).filter(Boolean);

// ① 字形集合
describe("① 字形集合与键集合", () => {
  it("TRACE_GLYPHS 恰为 130 个且无重复", () => {
    expect(TRACE_GLYPHS).toHaveLength(TOTAL);
    expect(new Set(TRACE_GLYPHS).size).toBe(TOTAL);
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
describe("② 六批次分组数量", () => {
  it("print 大写 26 / print 小写 26 / cursive 大写 26 / cursive 小写 26 / 两风格变音各 13", () => {
    expect(GROUPS.map((g) => g.keys.length)).toEqual([26, 26, 26, 26, 13, 13]);
  });

  for (const group of GROUPS) {
    it(`${group.name}：${group.keys.length} 个字形齐备`, () => {
      for (const key of group.keys) {
        expect(getLetterStroke(key), `缺少 ${key}`).toBeDefined();
      }
    });
  }

  it("无 130 键之外的多余字形", () => {
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

  it("130 字形全部可回放（验收 ①：每字形都有可绘制折线）", () => {
    const replayable = TRACE_GLYPHS.filter((k) =>
      LETTER_STROKES[k].strokes.every((s) => s.points.length >= 2)
    );
    expect(replayable).toHaveLength(TOTAL);
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
    // v1.8：入参收窄为 TraceGuides（渲染层不再需要整个 LetterStroke）
    const lines = guideLines(LETTER_STROKES["print:A"].guides);
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

  it("print 与 cursive 变音各 13 个，共 26 个（全量纳入）", () => {
    expect(listTraceGlyphs("fr").filter((k) => ACCENTED.includes(k.split(":")[1]))).toHaveLength(26);
  });

  it("每个字形至少 1 笔 base（130/130，不变量）", () => {
    // 2026-09-27 管线重建后：主体笔画不再被误标 diacritic（历史 8+1 例已修复），
    // 展示层 strokeDisplayRoles() 的归一化分支相应地不再被数据触发 —— 此处锁死不变量
    for (const key of TRACE_GLYPHS) {
      const kinds = LETTER_STROKES[key].strokes.map((s) => s.kind);
      expect(kinds.includes("base"), `${key} 缺 base`).toBe(true);
    }
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

  it("entry/exit 与 base 首/末点一致（±2）；且每个 cursive 字形必含 base", () => {
    for (const key of listTraceGlyphs(undefined, "cursive")) {
      const e = LETTER_STROKES[key];
      const bases = e.strokes.filter((s) => s.kind === "base");
      // 2026-09-27 管线重建后已无「以音符标注主体」的历史数据（实测 130/130 均含 base），不再豁免
      expect(bases.length, `${key} 缺 base`).toBeGreaterThan(0);
      expect(near(e.connect!.entry, bases[0].points[0]), `${key} entry`).toBe(true);
      const last = bases[bases.length - 1].points;
      expect(near(e.connect!.exit, last[last.length - 1]), `${key} exit`).toBe(true);
    }
  });
});

// ⑩ 取用接口
describe("⑩ 取用接口计数（规格 §10.10）", () => {
  it("listTraceGlyphs：en = 52、fr = 130、fr+cursive = 65、print = 65", () => {
    expect(listTraceGlyphs("en")).toHaveLength(52);
    expect(listTraceGlyphs("fr")).toHaveLength(TOTAL);
    expect(listTraceGlyphs("fr", "cursive")).toHaveLength(65);
    expect(listTraceGlyphs(undefined, "print")).toHaveLength(65);
  });

  it("traceGlyphChars 去重且覆盖 a–z", () => {
    const chars = traceGlyphChars("fr");
    expect(new Set(chars).size).toBe(chars.length);
    for (const c of [...LOWER, ...UPPER, ...ACCENTED]) {
      expect(chars, `缺字形 ${c}`).toContain(c);
    }
  });

  it("resolveTraceKey：法语优先 cursive（含大写），英语用 print，缺失返回 undefined", () => {
    expect(resolveTraceKey("a", "fr")).toBe("cursive:a");
    expect(resolveTraceKey("a", "fr", "print")).toBe("print:a");
    expect(resolveTraceKey("a", "en")).toBe("print:a");
    // frcursive 入库后手写体覆盖 A–Z：法语大写同样优先 cursive
    expect(resolveTraceKey("A", "fr")).toBe("cursive:A");
    expect(resolveTraceKey("A", "fr", "print")).toBe("print:A");
    expect(resolveTraceKey("A", "en")).toBe("print:A");
    expect(resolveTraceKey("é", "fr")).toBe("cursive:é");
    expect(resolveTraceKey("é", "en")).toBeUndefined();
    expect(resolveTraceKey("ž", "fr")).toBeUndefined();
  });

  it("拼词提示盘键位（ACCENT_KEYS）与变音字形清单完全一致（漂移保护）", () => {
    // 提示盘需覆盖全部 13 个变音（2026-09-27 裁决）；此处锁死「拼词键位 = 描红字形」不再分叉
    expect([...ACCENT_KEYS].sort()).toEqual(accentGlyphChars("fr").sort());
  });

  it("accentGlyphChars：法语 13 个变音（教学顺序）、英语为空", () => {
    // 变音字形须能从数据清单直接列出（不依赖内容侧是否建了变音卡；T6-08 验收 ①⑤）
    expect(accentGlyphChars("fr")).toEqual(ACCENTED);
    expect(accentGlyphChars("en")).toEqual([]);
    // 不掺入 A–Z / a–z
    expect(accentGlyphChars("fr").every((g) => !/^[A-Za-z]$/.test(g))).toBe(true);
  });

  it("traceGlyphsFromLetter：字母卡成对形态拆为单字形", () => {
    expect(traceGlyphsFromLetter("Aa")).toEqual(["A", "a"]);
    expect(traceGlyphsFromLetter("é")).toEqual(["é"]);
    expect(traceGlyphsFromLetter("")).toEqual([]);
  });

  it("hasCursiveVariant：大小写与变音均为 true（frcursive 已覆盖 A–Z）", () => {
    expect(hasCursiveVariant("a")).toBe(true);
    expect(hasCursiveVariant("é")).toBe(true);
    expect(hasCursiveVariant("A")).toBe(true);
    expect(hasCursiveVariant("Ž")).toBe(false);
  });
});

// ⑪ 展示层归一化（数据中个别变音字形无 base）
describe("⑪ strokeDisplayRoles（展示层归一化）", () => {
  it("有 base 时原样返回", () => {
    const e = LETTER_STROKES["print:é"];
    expect(strokeDisplayRoles(e)).toEqual(e.strokes.map((s) => s.kind));
  });

  it("无 base 的变音字形：首笔视作主体，其余视作音符", () => {
    // 展示层归一化针对历史数据（如旧 cursive:é 全标 diacritic）；此处用合成条目锁定行为
    const synthetic: LetterStroke = {
      key: "cursive:é",
      glyph: "é",
      style: "cursive",
      langs: ["fr"],
      viewBox: { w: 100, h: 100 },
      guides: { ascender: 2, capHeight: 2, xHeight: 39.2, baseline: 61.8, descender: 98, slant: 15.7 },
      strokes: [
        { kind: "diacritic", points: [[10, 10], [20, 20]] },
        { kind: "diacritic", points: [[30, 30], [40, 40]] },
      ],
      connect: { entry: [10, 10], exit: [40, 40] },
      source: { by: "test", date: "2026-09-27" },
    };
    const roles = strokeDisplayRoles(synthetic);
    expect(roles[0]).toBe("base");
    expect(roles.slice(1).every((r) => r === "diacritic")).toBe(true);
  });

  it("组合生成的变音字形自带 base（构建期产出），角色原样保留", () => {
    const e = LETTER_STROKES["cursive:é"];
    expect(e.strokes.some((s) => s.kind === "base")).toBe(true);
    expect(e.strokes.some((s) => s.kind === "diacritic")).toBe(true);
    expect(strokeDisplayRoles(e)).toEqual(e.strokes.map((s) => s.kind));
  });
});
