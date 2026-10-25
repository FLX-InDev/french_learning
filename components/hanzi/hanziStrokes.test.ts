import { describe, expect, it } from "vitest";
import {
  HANZI_BAND_META,
  HANZI_CHARS,
  HANZI_GLYPHS,
  getHanziGlyph,
  hanziStrokeCount,
  hasHanziTrace,
  toTraceBoard,
} from "./hanziStrokes";

/**
 * 汉字描红取数层单测（中文 MVP）
 *
 * 覆盖：装载完整性（启蒙档 21 字）、坐标合法性（[0,100]）、
 * 米字格换算（`toTraceBoard` 只交出渲染需要的字段）、缺数据时的降级。
 */

/** 启蒙档 = 一级字表 1–2 画独体字（`charlist-3-10.json` 的 3-4 档，21 字） */
const BAND_34 = ["一", "乙", "二", "十", "丁", "厂", "七", "卜", "八", "人", "入", "儿", "匕", "几", "九", "刁", "了", "刀", "力", "乃", "又"];

describe("汉字字形装载", () => {
  it("启蒙档 21 字全部装载，键为 hanzi:<字>", () => {
    expect(HANZI_CHARS).toHaveLength(21);
    expect([...HANZI_CHARS].sort()).toEqual([...BAND_34].sort());
    expect(HANZI_CHARS).toContain("乃");
    for (const ch of HANZI_CHARS) {
      expect(HANZI_GLYPHS[`hanzi:${ch}`]).toBeTruthy();
      expect(hasHanziTrace(ch)).toBe(true);
    }
  });

  it("每个字形：style=hanzi、langs 含 zh、笔画 ≥2 点且坐标在 [0,100]", () => {
    for (const entry of Object.values(HANZI_GLYPHS)) {
      expect(entry.style, entry.key).toBe("hanzi");
      expect(entry.langs, entry.key).toContain("zh");
      expect(entry.strokes.length, entry.key).toBeGreaterThan(0);
      for (const s of entry.strokes) {
        expect(s.points.length, entry.key).toBeGreaterThanOrEqual(2);
        for (const [x, y] of s.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
      }
      // 授权留痕（ARPHIC PL 1.1 §2(a) 修改记录）
      expect(entry.source.by, entry.key).toBeTruthy();
      expect(entry.source.derivedFrom ?? entry.source.note, entry.key).toBeTruthy();
    }
  });

  it("米字格数值参考线单调（ascender ≤ capHeight ≤ xHeight ≤ baseline ≤ descender）", () => {
    for (const entry of Object.values(HANZI_GLYPHS)) {
      const g = entry.guides;
      expect(g.ascender, entry.key).toBeLessThanOrEqual(g.capHeight);
      expect(g.capHeight, entry.key).toBeLessThanOrEqual(g.xHeight);
      expect(g.xHeight, entry.key).toBeLessThanOrEqual(g.baseline);
      expect(g.baseline, entry.key).toBeLessThanOrEqual(g.descender);
      expect(g.grid, entry.key).toBe("米字格");
    }
  });

  it("档元信息带来源 / 标准 / 审计计数", () => {
    expect(HANZI_BAND_META?.band).toBe("3-4");
    expect(HANZI_BAND_META?.standard).toContain("GF 0023-2020");
    expect(HANZI_BAND_META?.attribution).toContain("ARPHIC");
    expect(HANZI_BAND_META?.audit?.built).toBe(21);
    expect(HANZI_BAND_META?.audit?.error).toBe(0);
  });
});

describe("toTraceBoard 换算", () => {
  it("交出 rice 网格 + hanzi 形态标注，且不含 cursive 连笔", () => {
    const entry = getHanziGlyph("二");
    expect(entry).toBeTruthy();
    const board = toTraceBoard(entry!);
    expect(board.glyph).toBe("二");
    expect(board.grid).toBe("rice");
    expect(board.variantLabel).toBe("hanzi");
    expect(board.connect).toBeUndefined();
    expect(board.strokes).toHaveLength(entry!.strokes.length);
    expect(board.strokes[0].points.length).toBe(entry!.strokes[0].points.length);
    expect(board.guides).toEqual({
      ascender: entry!.guides.ascender,
      capHeight: entry!.guides.capHeight,
      xHeight: entry!.guides.xHeight,
      baseline: entry!.guides.baseline,
      descender: entry!.guides.descender,
    });
    // grid / em 属于数据侧说明，不进入渲染模型
    expect(board.guides).not.toHaveProperty("grid");
  });

  it("笔画数与数据一致；未装载的字返回 0", () => {
    expect(hanziStrokeCount("一")).toBe(1);
    expect(hanziStrokeCount("乃")).toBe(2);
    expect(hanziStrokeCount("永")).toBe(0);
    expect(getHanziGlyph("永")).toBeUndefined();
  });
});
