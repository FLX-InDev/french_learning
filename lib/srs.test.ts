import { describe, it, expect } from "vitest";
import {
  SRS_INITIAL_INTERVAL,
  SRS_EASE_DEFAULT,
  SRS_EASE_MIN,
  SRS_MAX_INTERVAL,
  SRS_DAILY_LIMIT,
  addDaysStr,
  hashKey,
  langItemKey,
  spellItemKey,
  mathItemKey,
  logicItemKey,
  srsKeyFor,
  parseSrsKey,
  newCard,
  review,
  isDue,
  dueItems,
} from "./srs";
import type { SrsCard, SrsState } from "./workspace";
import type { DailyItem } from "./dailyChallenge";

const TODAY = "2026-09-10";

// ── 日期工具 ──────────────────────────────────────────────────────
describe("addDaysStr（UTC 日期推进）", () => {
  it("同日 / 次日 / 跨月 / 跨年", () => {
    expect(addDaysStr("2026-09-10", 0)).toBe("2026-09-10");
    expect(addDaysStr("2026-09-10", 1)).toBe("2026-09-11");
    expect(addDaysStr("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysStr("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("跨闰年 2 月：2028-02-28 + 1 = 2028-02-29", () => {
    expect(addDaysStr("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysStr("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("非法输入原样返回（不抛错）", () => {
    expect(addDaysStr("", 1)).toBe("");
    expect(addDaysStr("bad", 1)).toBe("bad");
  });
});

describe("hashKey（稳定内容指纹）", () => {
  it("同输入同结果、不同输入大概率不同", () => {
    expect(hashKey("chat|猫|cat")).toBe(hashKey("chat|猫|cat"));
    expect(hashKey("a")).not.toBe(hashKey("b"));
  });
});

// ── 题键 ──────────────────────────────────────────────────────────
describe("题键构造与反解", () => {
  it("lang / spell / math / logic 前缀正确", () => {
    expect(langItemKey("chat", "猫", "cat")).toMatch(/^srs:lang:/);
    expect(spellItemKey("w_test0")).toBe("srs:spell:w_test0");
    expect(mathItemKey("addCarry", "8+5")).toBe("srs:math:addCarry:8+5");
    expect(logicItemKey("pattern", "AB")).toBe("srs:logic:pattern:AB");
  });

  it("parseSrsKey 四类往返一致", () => {
    expect(parseSrsKey(spellItemKey("w_1"))).toEqual({ kind: "spell", id: "w_1" });
    expect(parseSrsKey(mathItemKey("addCarry", "8+5"))).toEqual({
      kind: "math",
      kindName: "addCarry",
      kindKey: "8+5",
    });
    expect(parseSrsKey(logicItemKey("pattern", "AB"))).toEqual({
      kind: "logic",
      kindName: "pattern",
      kindKey: "AB",
    });
    const lk = langItemKey("chat", "猫", "cat");
    expect(parseSrsKey(lk)).toEqual({ kind: "lang", id: hashKey("chat|猫|cat") });
  });

  it("parseSrsKey 非法输入返回 null", () => {
    expect(parseSrsKey("")).toBeNull();
    expect(parseSrsKey("srs:")).toBeNull();
    expect(parseSrsKey("srs:lang")).toBeNull();
    expect(parseSrsKey("srs:math:addCarry")).toBeNull();
    expect(parseSrsKey("other:lang:x")).toBeNull();
  });

  it("srsKeyFor：四类题型映射，listenPick 不入 SRS", () => {
    const lang: DailyItem = {
      subject: "language",
      mode: "lang",
      q: {
        fr: "chat",
        en: "cat",
        zh: "猫",
        options: [],
        correctIndex: 0,
        userIndex: null,
        explanation: "",
        mode: "choice",
      },
    };
    expect(srsKeyFor(lang)).toBe(langItemKey("chat", "猫", "cat"));

    const spell: DailyItem = {
      subject: "language",
      mode: "spell",
      word: { id: "w_1", fr: "chat", zh: "猫", en: "cat", emoji: "🐱", source: "word" },
    };
    expect(srsKeyFor(spell)).toBe("srs:spell:w_1");

    const math = {
      subject: "math",
      mode: "math",
      q: { kind: "addCarry", answer: "13" },
    } as unknown as DailyItem;
    expect(srsKeyFor(math)).toBe("srs:math:addCarry:13");

    const logic = {
      subject: "logic",
      mode: "logic",
      q: { kind: "pattern", answer: "AB" },
    } as unknown as DailyItem;
    expect(srsKeyFor(logic)).toBe("srs:logic:pattern:AB");

    const listenPick = { subject: "language", mode: "listenPick" } as unknown as DailyItem;
    expect(srsKeyFor(listenPick)).toBeNull();
  });

  it("srsKeyFor：答案含 ':' 时被净化，键仍可反解", () => {
    const math = {
      subject: "math",
      mode: "math",
      q: { kind: "clock", answer: "3:30" },
    } as unknown as DailyItem;
    const key = srsKeyFor(math);
    expect(key).toBe("srs:math:clock:3-30");
    expect(parseSrsKey(key as string)).toEqual({
      kind: "math",
      kindName: "clock",
      kindKey: "3-30",
    });
  });
});

// ── 调度 ──────────────────────────────────────────────────────────
describe("newCard（首次出现）", () => {
  it("默认值符合契约：reps0 / interval1 / ease2.5 / due 次日 / lapses0", () => {
    const c = newCard(TODAY);
    expect(c).toEqual({
      reps: 0,
      interval: SRS_INITIAL_INTERVAL,
      ease: SRS_EASE_DEFAULT,
      due: "2026-09-11",
      lapses: 0,
    });
    expect("lastGrade" in c).toBe(false);
  });
});

describe("review（调度规则）", () => {
  it("首次答对（无卡）：reps1 / interval1 / ease2.5 / due 次日", () => {
    const c = review(undefined, 2, TODAY);
    expect(c.reps).toBe(1);
    expect(c.interval).toBe(1);
    expect(c.ease).toBe(2.5);
    expect(c.due).toBe("2026-09-11");
    expect(c.lastGrade).toBe(2);
  });

  it("第二次答对：interval 固定为 3 天", () => {
    const c1 = review(undefined, 2, TODAY);
    const c2 = review(c1, 2, "2026-09-11");
    expect(c2.reps).toBe(2);
    expect(c2.interval).toBe(3);
    expect(c2.due).toBe("2026-09-14");
    expect(c2.ease).toBe(2.5);
  });

  it("第三次答对：interval = round(3 × 2.5) = 8 天", () => {
    let c = review(undefined, 2, TODAY);
    c = review(c, 2, "2026-09-11"); // interval 3
    c = review(c, 2, "2026-09-14"); // 3 × 2.5 = 7.5 → 8
    expect(c.reps).toBe(3);
    expect(c.interval).toBe(8);
    expect(c.due).toBe("2026-09-22");
  });

  it("答错：reps 归零 / interval 1 / ease -0.2 / lapses+1", () => {
    let c = review(undefined, 2, TODAY);
    c = review(c, 2, "2026-09-11"); // ease 仍 2.5
    const wrong = review(c, 0, "2026-09-14");
    expect(wrong.reps).toBe(0);
    expect(wrong.interval).toBe(1);
    expect(wrong.ease).toBe(2.3);
    expect(wrong.lapses).toBe(1);
    expect(wrong.due).toBe("2026-09-15");
    expect(wrong.lastGrade).toBe(0);
  });

  it("连续答错时 ease 有下限 1.3", () => {
    let c: SrsCard = newCard(TODAY);
    for (let i = 0; i < 10; i++) c = review(c, 0, TODAY);
    expect(c.ease).toBe(SRS_EASE_MIN);
    expect(c.lapses).toBe(10);
  });

  it("interval 有上限 365 天", () => {
    let c = review(undefined, 2, TODAY); // reps1 interval1
    c = review(c, 2, TODAY); // reps2 interval3
    for (let i = 0; i < 30; i++) c = review(c, 2, TODAY);
    expect(c.interval).toBeLessThanOrEqual(SRS_MAX_INTERVAL);
    expect(c.interval).toBe(365);
  });

  it("幂等：同一 prev + 同一 today + 同一 grade → 结果深度相等", () => {
    const prev = newCard(TODAY);
    expect(JSON.stringify(review(prev, 2, TODAY))).toBe(
      JSON.stringify(review(prev, 2, TODAY))
    );
    expect(JSON.stringify(review(prev, 0, TODAY))).toBe(
      JSON.stringify(review(prev, 0, TODAY))
    );
  });

  it("纯函数：不修改入参卡片", () => {
    const prev = newCard(TODAY);
    const snapshot = JSON.stringify(prev);
    review(prev, 2, TODAY);
    review(prev, 0, TODAY);
    expect(JSON.stringify(prev)).toBe(snapshot);
  });

  it("答错后再答对：从 interval 1 重新爬坡", () => {
    let c = review(undefined, 2, TODAY);
    c = review(c, 0, TODAY); // reset
    c = review(c, 2, TODAY); // reps1 interval1
    expect(c.reps).toBe(1);
    expect(c.interval).toBe(1);
  });
});

describe("isDue（到期判定）", () => {
  const card: SrsCard = {
    reps: 0,
    interval: 1,
    ease: 2.5,
    due: "2026-09-10",
    lapses: 0,
  };

  it("due === today 视为到期", () => {
    expect(isDue(card, "2026-09-10")).toBe(true);
  });

  it("due < today 视为到期（逾期）", () => {
    expect(isDue(card, "2026-09-12")).toBe(true);
  });

  it("due > today 未到期", () => {
    expect(isDue(card, "2026-09-09")).toBe(false);
  });

  it("null / undefined / 结构破损 → false（老数据安全）", () => {
    expect(isDue(null, TODAY)).toBe(false);
    expect(isDue(undefined, TODAY)).toBe(false);
    expect(isDue({} as SrsCard, TODAY)).toBe(false);
  });
});

describe("dueItems（取到期题键）", () => {
  const state: SrsState = {
    "srs:math:add:5+3": { reps: 0, interval: 1, ease: 2.5, due: "2026-09-12", lapses: 0 },
    "srs:lang:aaa": { reps: 1, interval: 3, ease: 2.5, due: "2026-09-09", lapses: 0 },
    "srs:spell:w_1": { reps: 0, interval: 1, ease: 2.5, due: "2026-09-10", lapses: 0 },
    "srs:logic:pattern:AB": { reps: 2, interval: 8, ease: 2.5, due: "2026-09-20", lapses: 0 },
  };

  it("只返回到期项，按 due 升序（最该复习在前）", () => {
    expect(dueItems(state, TODAY)).toEqual(["srs:lang:aaa", "srs:spell:w_1"]);
  });

  it("默认上限 = SRS_DAILY_LIMIT（2 道）", () => {
    const many: SrsState = {};
    for (let i = 0; i < 5; i++) {
      many[`srs:spell:w_${i}`] = {
        reps: 0,
        interval: 1,
        ease: 2.5,
        due: `2026-09-0${i + 1}`,
        lapses: 0,
      };
    }
    expect(dueItems(many, TODAY)).toHaveLength(SRS_DAILY_LIMIT);
    expect(dueItems(many, TODAY, 3)).toHaveLength(3);
    expect(dueItems(many, TODAY, 0)).toHaveLength(0);
  });

  it("无到期项 → 空数组", () => {
    expect(dueItems({}, TODAY)).toEqual([]);
    expect(dueItems(state, "2026-09-01")).toEqual([]);
  });

  it("老数据破损结构不抛错", () => {
    const broken = {
      "srs:lang:x": null,
      "srs:lang:y": { due: 123 } as unknown as SrsCard,
    } as unknown as SrsState;
    expect(() => dueItems(broken, TODAY)).not.toThrow();
    expect(dueItems(broken, TODAY)).toEqual([]);
  });
});
