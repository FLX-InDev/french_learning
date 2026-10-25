import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  cumulativeArc,
  judgeAgainstAll,
  matchStroke,
  pathLength,
  resampleByArc,
} from "@/components/alphabets/strokeMatcher";
import { getHanziGlyph, HANZI_GLYPHS } from "./hanziStrokes";
import { HANZI_JUDGE, JUDGE_REASON_KEYS } from "./strokeJudge";
import type { TracePoint } from "@/components/alphabets/letterStrokes";

const stroke = (ch: string, i = 0): TracePoint[] => getHanziGlyph(ch)!.strokes[i].points;
const shift = (pts: TracePoint[], dx: number, dy: number): TracePoint[] =>
  pts.map(([x, y]) => [x + dx, y + dy]);
const partial = (pts: TracePoint[], ratio: number): TracePoint[] =>
  pts.slice(0, Math.max(2, Math.round(pts.length * ratio)));

/** 确定性伪随机（抖动回归需要可复现） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 合成「手抖」笔迹：整体起笔偏移 ≤6 单位 + 沿局部法线的 ±amp 抖动 */
function shaky(ref: TracePoint[], amp: number, startOff: number, rand: () => number): TracePoint[] {
  const ang = rand() * Math.PI * 2;
  const ox = Math.cos(ang) * startOff;
  const oy = Math.sin(ang) * startOff;
  return ref.map((p, i) => {
    const a = ref[Math.max(0, i - 1)];
    const b = ref[Math.min(ref.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = (rand() * 2 - 1) * amp;
    // 起笔与收笔处抖得轻（落笔那一刻是盯着参考点描的）
    const taper = i === 0 || i === ref.length - 1 ? 0.35 : 1;
    return [p[0] + ox + (-dy / len) * w * taper, p[1] + oy + (dx / len) * w * taper];
  });
}

describe("strokeMatcher 基础几何", () => {
  it("累计弧长与路径长度一致", () => {
    const pts = stroke("一");
    const acc = cumulativeArc(pts);
    expect(acc[0]).toBe(0);
    expect(acc[acc.length - 1]).toBeCloseTo(pathLength(pts), 6);
  });

  it("按弧长重采样保留首末点，且间距接近 spacing", () => {
    const src = stroke("一");
    const out = resampleByArc(src, 10);
    expect(out[0]).toEqual(src[0]);
    expect(out[out.length - 1]).toEqual(src[src.length - 1]);
    const acc = cumulativeArc(out);
    expect(Math.max(...acc.slice(1).map((v, i) => v - acc[i]))).toBeLessThanOrEqual(10.0001);
  });

  it("参考笔长度量级与数据侧一致（一 ≈ 80 单位）", () => {
    expect(pathLength(stroke("一"))).toBeGreaterThan(70);
    expect(pathLength(stroke("一"))).toBeLessThan(90);
  });
});

describe("matchStroke 三要素", () => {
  it("精确复制参考笔 → ok", () => {
    const m = matchStroke(stroke("一"), stroke("一"));
    expect(m.status).toBe("ok");
    expect(m.reasons).toEqual([]);
  });

  it("整体偏移 6 单位（描在虚线边上）→ ok", () => {
    expect(matchStroke(shift(stroke("一"), 0, 6), stroke("一")).status).toBe("ok");
  });

  it("整体偏移 14 单位 → retry，同时给出 offStart 与 offPath", () => {
    const m = matchStroke(shift(stroke("一"), 0, 14), stroke("一"));
    expect(m.status).toBe("retry");
    expect(m.reasons).toContain("offStart");
    expect(m.reasons).toContain("offPath");
  });

  it("只描前 60% → incomplete", () => {
    const m = matchStroke(partial(stroke("一"), 0.6), stroke("一"));
    expect(m.reasons).toEqual(["incomplete"]);
    expect(m.metrics.tailS).toBeLessThan(DEFAULT_THRESHOLDS.tailMin);
  });

  it("整笔倒着描 → 不通过（offStart 与 incomplete 至少命中一个）", () => {
    const rev = [...stroke("一")].reverse();
    const m = matchStroke(rev, stroke("一"));
    expect(m.status).toBe("retry");
    expect(m.reasons.length).toBeGreaterThan(0);
    expect(m.reasons).not.toContain("offPath");
  });

  it("两点快甩（只有首末点）→ ok", () => {
    const pts = stroke("一");
    expect(matchStroke([pts[0], pts[pts.length - 1]], pts).status).toBe("ok");
  });

  it("「卜」的点偏移 7 单位 → ok；偏移 12 单位 → 起笔就脱靶", () => {
    const dot = stroke("卜", 1);
    expect(pathLength(dot)).toBeLessThan(40);
    expect(matchStroke(shift(dot, 0, 7), dot).status).toBe("ok");
    const far = matchStroke(shift(dot, 0, 12), dot);
    expect(far.status).toBe("retry");
    expect(far.reasons).toContain("offStart");
  });

  it("4 单位轻点 → ignored，不出结论", () => {
    const m = matchStroke([
      [12, 62],
      [14, 62],
      [16, 62],
    ], stroke("一"));
    expect(m.status).toBe("ignored");
    expect(m.reasons).toEqual([]);
  });

  it("越界坐标不产生 NaN", () => {
    const wild: TracePoint[] = [
      [11.8, 61.6],
      [50, -40],
      [130, 110],
      [89.8, 60.8],
    ];
    const m = matchStroke(wild, stroke("一"));
    for (const v of Object.values(m.metrics)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("judgeAgainstAll 顺序提示", () => {
  const refsOf = (ch: string) => getHanziGlyph(ch)!.strokes.map((s) => s.points);

  it("该写「十」的横却写了竖 → retry 且 matchedIndex 指向第 2 笔", () => {
    const refs = refsOf("十");
    const r = judgeAgainstAll(refs[1], refs, 0);
    expect(r.status).toBe("retry");
    expect(r.matchedIndex).toBe(1);
  });

  it("写对第 1 笔 → ok 且不带 matchedIndex", () => {
    const refs = refsOf("十");
    const r = judgeAgainstAll(refs[0], refs, 0);
    expect(r.status).toBe("ok");
    expect(r.matchedIndex).toBeUndefined();
  });

  it("期望 index 越界时不抛错", () => {
    expect(() => judgeAgainstAll(refsOf("十")[0], refsOf("十"), 9)).not.toThrow();
  });

  it("每个失败原因与每条配置文案都指向 hanziJudge 模块 key", () => {
    expect(Object.keys(JUDGE_REASON_KEYS).sort()).toEqual(["incomplete", "offPath", "offStart"]);
    const keys = [...Object.values(JUDGE_REASON_KEYS), ...Object.values(HANZI_JUDGE.text)];
    for (const key of keys) {
      expect(key.startsWith("hanziJudge.")).toBe(true);
      // check-i18n-parity 的 keyShape 拒绝连字符段
      expect(key).not.toMatch(/-/);
    }
    expect(HANZI_JUDGE.failsForHint).toBe(3);
  });
});

describe("「手抖」合成笔迹回归（全 21 字 40 笔）", () => {
  const all = Object.values(HANZI_GLYPHS).flatMap((g) => g.strokes.map((s) => s.points));

  const rate = (amp: number, seed: number): number => {
    const rand = rng(seed);
    let ok = 0;
    for (const ref of all) {
      if (matchStroke(shaky(ref, amp, Math.min(6, amp * 0.75), rand), ref).status === "ok") ok += 1;
    }
    return ok / all.length;
  };

  it("±5 单位抖动（轻度手抖）ok 率 ≥ 95%", () => {
    const r = rate(5, 1);
    console.log("jitter±5 ok rate:", (r * 100).toFixed(1) + "%");
    expect(r).toBeGreaterThanOrEqual(0.95);
  });

  it("±8 单位抖动（明显手抖）ok 率 ≥ 85%", () => {
    const r = rate(8, 2);
    console.log("jitter±8 ok rate:", (r * 100).toFixed(1) + "%");
    expect(r).toBeGreaterThanOrEqual(0.85);
  });

  it("笔数与档位数据一致（21 字 40 笔）", () => {
    expect(all).toHaveLength(40);
  });
});
