import { describe, expect, it } from "vitest";
import {
  DAILY_LIMIT_OPTIONS,
  REWARDS,
  accColor,
  addDays,
  addPoints,
  addUsedTime,
  buildPool,
  computeLongestStreak,
  computeStreak,
  createInitialState,
  exportBackup,
  fmt,
  generateQuiz,
  generateSpeakQuiz,
  importBackup,
  isTimeUp,
  mdLabel,
  migrateV1toV2,
  quizResult,
  remainingSec,
  sessionDurationMin,
  settleLevelStars,
  starsForAccuracy,
  shuffle,
  todayStr,
  type AppState,
  type QuizQuestion,
  type Sentence,
  type StudySession,
  type WorkspaceState,
} from "./workspace";
import type { Story } from "./parser";

// ─── 测试夹具 ────────────────────────────────────────────────────

function sentence(fr: string, zh: string, en: string): Sentence {
  return { fr, zh, en } as Sentence;
}

function makePool(n: number): Sentence[] {
  const out: Sentence[] = [];
  for (let i = 0; i < n; i++) {
    out.push(sentence(`fr${i}`, `中${i}`, `en${i}`));
  }
  return out;
}

function makeSession(questions: QuizQuestion[]): StudySession {
  return {
    id: "s1",
    date: "2026-09-07",
    durationMin: 8,
    contentRef: { type: "mixed", title: "t" },
    quiz: { title: "q", questions },
    reviewed: false,
  };
}

function q(correctIndex: number, userIndex: number | null): QuizQuestion {
  return {
    fr: "fr",
    en: "en",
    zh: "zh",
    options: ["a", "b", "c", "d"],
    correctIndex,
    userIndex,
    explanation: "e",
    mode: "choice",
  };
}

const emptyPoints: WorkspaceState["points"] = {
  total: 0,
  history: [],
};

// ─── 出题 ────────────────────────────────────────────────────────

describe("shuffle", () => {
  it("不修改原数组且元素与长度不变", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect(out).toHaveLength(5);
    expect(out.slice().sort()).toEqual(src.slice().sort());
  });
});

describe("buildPool", () => {
  it("合并故事句子与独立句子并按三元组去重", () => {
    const stories: Story[] = [
      {
        id: "st1",
        title: "t",
        sentences: [
          sentence("Bonjour", "你好", "Hello"),
          sentence("Merci", "谢谢", "Thanks"),
        ],
      },
    ];
    const sentences = [
      sentence("Bonjour", "你好", "Hello"), // 与故事句重复
      sentence("Oui", "是", "Yes"),
    ];
    const pool = buildPool(stories, sentences);
    expect(pool).toHaveLength(3);
    expect(pool.map((s) => s.fr)).toEqual(["Bonjour", "Merci", "Oui"]);
  });

  it("法语相同但中文不同视为不同句子（不做去重）", () => {
    const pool = buildPool([], [sentence("Oui", "是", "Yes"), sentence("Oui", "对", "Yeah")]);
    expect(pool).toHaveLength(2);
  });

  it("空输入返回空池", () => {
    expect(buildPool([], [])).toEqual([]);
  });
});

describe("generateQuiz（出题去重）", () => {
  it("默认 4 题，且同一卷内不出现重复句子", () => {
    const pool = makePool(20);
    const qs = generateQuiz(pool, 4);
    expect(qs).toHaveLength(4);
    expect(new Set(qs.map((x) => x.fr)).size).toBe(4);
    expect(new Set(qs.map((x) => x.zh)).size).toBe(4);
  });

  it("题数不超过池大小（池只有 2 句时只出 2 题）", () => {
    const qs = generateQuiz(makePool(2), 4);
    expect(qs).toHaveLength(2);
  });

  it("空池返回空数组", () => {
    expect(generateQuiz([], 4)).toEqual([]);
  });

  it("每题 4 个选项，且 correctIndex 指向正确中文", () => {
    const qs = generateQuiz(makePool(10), 4);
    for (const item of qs) {
      expect(item.options).toHaveLength(4);
      expect(item.options[item.correctIndex]).toBe(item.zh);
    }
  });

  it("干扰项去重且不含正确答案；池不足时用「—」补齐", () => {
    const qs = generateQuiz(makePool(4), 4);
    for (const item of qs) {
      const distract = item.options.filter((o) => o !== item.zh);
      expect(distract).toHaveLength(3);
      expect(new Set(distract).size).toBe(3);
    }
    // 池只有 1 句 → 无干扰项，用「—」补满 3 个
    const only = generateQuiz(makePool(1), 4);
    expect(only[0].options).toHaveLength(4);
    expect(only[0].options.filter((o) => o === "—")).toHaveLength(3);
    expect(only[0].options[only[0].correctIndex]).toBe("中0");
  });

  it("题目未作答时 userIndex 为 null，并带上 mode 与三语释义", () => {
    const qs = generateQuiz(makePool(10), 4, "listen");
    for (const item of qs) {
      expect(item.userIndex).toBeNull();
      expect(item.mode).toBe("listen");
      expect(item.explanation).toContain(item.fr);
      expect(item.explanation).toContain(item.zh);
      expect(item.explanation).toContain(item.en);
    }
  });
});

describe("generateSpeakQuiz", () => {
  it("跟读题无选项，correctIndex 固定 0，得分初始为 null", () => {
    const qs = generateSpeakQuiz(makePool(20), 4);
    expect(qs).toHaveLength(4);
    for (const item of qs) {
      expect(item.mode).toBe("speak");
      expect(item.options).toEqual([]);
      expect(item.correctIndex).toBe(0);
      expect(item.userIndex).toBeNull();
      expect(item.score).toBeNull();
      expect(item.transcript).toBe("");
    }
  });

  it("targetText 与 targetLang 一致（fr 取法语，en 取英语）", () => {
    const qs = generateSpeakQuiz(makePool(20), 4);
    for (const item of qs) {
      expect(item.targetLang === "fr" || item.targetLang === "en").toBe(true);
      expect(item.targetText).toBe(item.targetLang === "fr" ? item.fr : item.en);
    }
  });

  it("4 题时法/英各 2 题（语言均衡）", () => {
    const qs = generateSpeakQuiz(makePool(20), 4);
    const fr = qs.filter((x) => x.targetLang === "fr").length;
    const en = qs.filter((x) => x.targetLang === "en").length;
    expect(fr).toBe(2);
    expect(en).toBe(2);
  });

  it("空池返回空数组", () => {
    expect(generateSpeakQuiz([], 4)).toEqual([]);
  });
});

// ─── 统计 / 日期 ─────────────────────────────────────────────────

describe("quizResult", () => {
  it("统计答对题数与正确率", () => {
    const r = quizResult(makeSession([q(0, 0), q(1, 0), q(1, 1), q(0, null)]));
    expect(r.score).toBe(2);
    expect(r.total).toBe(4);
    expect(r.acc).toBe(50);
  });

  it("空题组正确率为 0（不除零）", () => {
    expect(quizResult(makeSession([])).acc).toBe(0);
  });
});

describe("accColor", () => {
  it("≥80 绿 / ≥60 橙 / <60 红", () => {
    expect(accColor(100)).toBe("#16A34A");
    expect(accColor(80)).toBe("#16A34A");
    expect(accColor(79)).toBe("#D97706");
    expect(accColor(60)).toBe("#D97706");
    expect(accColor(59)).toBe("#EF4444");
  });
});

describe("日期工具", () => {
  it("fmt 补零为 YYYY-MM-DD", () => {
    expect(fmt(new Date(2026, 8, 7))).toBe("2026-09-07");
    expect(fmt(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("todayStr 与 fmt(new Date()) 一致", () => {
    expect(todayStr()).toBe(fmt(new Date()));
  });

  it("mdLabel 取月日", () => {
    expect(mdLabel("2026-09-07")).toBe("09月07日");
  });

  it("addDays 不修改传入日期", () => {
    const d = new Date(2026, 8, 7);
    expect(fmt(addDays(d, -1))).toBe("2026-09-06");
    expect(fmt(addDays(d, 30))).toBe("2026-10-07");
    expect(fmt(d)).toBe("2026-09-07");
  });
});

describe("computeStreak / computeLongestStreak", () => {
  const d = (offset: number) => fmt(addDays(new Date(), offset));

  it("今天已打卡：从今天往前连续计数", () => {
    expect(computeStreak([d(0), d(-1), d(-2)])).toBe(3);
  });

  it("今天未打卡：从昨天起算（不中断当前连续）", () => {
    expect(computeStreak([d(-1), d(-2)])).toBe(2);
  });

  it("出现断档即停止", () => {
    expect(computeStreak([d(0), d(-1), d(-3)])).toBe(2);
  });

  it("无打卡记录为 0", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("最长连续取历史最大值，且不重复计数", () => {
    expect(computeLongestStreak([d(-10), d(-9), d(-8), d(-3), d(-2)])).toBe(3);
  });

  it("重复打卡不影响最长连续（去重后计算）", () => {
    expect(computeLongestStreak([d(-1), d(-1), d(0), d(0)])).toBe(2);
  });

  it("空记录最长连续为 0", () => {
    expect(computeLongestStreak([])).toBe(0);
  });
});

// ─── 积分 ────────────────────────────────────────────────────────

describe("addPoints（积分加减规则）", () => {
  it("加分：累加总额并追加当天流水", () => {
    const next = addPoints(emptyPoints, 10, "每日打卡");
    expect(next.total).toBe(10);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toEqual({
      date: todayStr(),
      delta: 10,
      reason: "每日打卡",
    });
  });

  it("减分：兑换扣减总额", () => {
    const after = addPoints({ total: 100, history: [] }, -30, "兑换 专属贴纸包");
    expect(after.total).toBe(70);
    expect(after.history[0].delta).toBe(-30);
  });

  it("链式叠加：打卡 +10 后高正确率 +5", () => {
    const next = addPoints(addPoints(emptyPoints, 10, "完成新测验"), 5, "高正确率奖励");
    expect(next.total).toBe(15);
    expect(next.history.map((h) => h.delta)).toEqual([10, 5]);
  });

  it("不修改传入的积分对象（不可变更新）", () => {
    const before: WorkspaceState["points"] = { total: 5, history: [] };
    addPoints(before, 10, "x");
    expect(before.total).toBe(5);
    expect(before.history).toHaveLength(0);
  });

  it("兑换表成本为正且积分不足时不可兑换", () => {
    for (const r of REWARDS) expect(r.cost).toBeGreaterThan(0);
    const poor: WorkspaceState["points"] = { total: 1, history: [] };
    for (const r of REWARDS) expect(poor.total >= r.cost).toBe(false);
  });
});

// ─── 状态树 v2 与迁移（T1.3）────────────────────────────────────

const V1_STATE = {
  sessions: [makeSession([q(0, 0)])],
  checkins: ["2026-09-06", "2026-09-07"],
  points: { total: 130, history: [{ date: "2026-09-07", delta: 10, reason: "每日打卡" }] },
  redeemed: [{ id: "sticker", date: "2026-09-05", cost: 30 }],
};

describe("createInitialState", () => {
  it("只造 profile + 空进度，不造演示 session", () => {
    const s = createInitialState("L2");
    expect(s.v).toBe(2);
    expect(s.profile.level).toBe("L2");
    expect(s.sessions).toEqual([]);
    expect(s.checkins).toEqual([]);
    expect(s.points.total).toBe(0);
    expect(s.mascot).toEqual({ stage: "egg", fedCount: 0 });
    expect(s.wordProgress).toEqual({});
  });

  it("默认设置：语速 0.9 / 音效开 / 背景乐关 / 点按音效关 / 每日 20 分钟", () => {
    const s = createInitialState();
    expect(s.settings).toEqual({
      speechRate: 0.9,
      sfxOn: true,
      bgmOn: false,
      tapSfxOn: false,
      dailyLimitMin: 20,
      hiddenContent: [],
    });
    expect(DAILY_LIMIT_OPTIONS).toContain(20);
  });
});

describe("migrateV1toV2", () => {
  it("v1 输入：四个字段无损迁入，其余补默认值", () => {
    const out = migrateV1toV2(V1_STATE) as AppState;
    expect(out.v).toBe(2);
    expect(out.sessions).toHaveLength(1);
    expect(out.checkins).toEqual(["2026-09-06", "2026-09-07"]);
    expect(out.points.total).toBe(130);
    expect(out.redeemed).toHaveLength(1);
    // 默认值
    expect(out.profile.level).toBe("L3");
    expect(out.profile.onboarded).toBe(false);
    expect(out.settings.dailyLimitMin).toBe(20);
    expect(out.rewards).toEqual({
      stars: 0,
      stickers: [],
      badges: [],
      levelStars: {},
    });
    expect(out.mascot).toEqual({ stage: "egg", fedCount: 0 });
  });

  it("v1 历史 session 补 subject: language，且不改写原 durationMin", () => {
    const out = migrateV1toV2(V1_STATE) as AppState;
    expect(out.sessions[0].subject).toBe("language");
    expect(out.sessions[0].durationMin).toBe(8);
  });

  it("v2 输入：幂等（原样规范化返回，字段不丢失）", () => {
    const v2 = createInitialState("L5");
    v2.rewards.stars = 7;
    v2.wordProgress = { "w-1": "spoken" };
    const out = migrateV1toV2(JSON.parse(JSON.stringify(v2))) as AppState;
    expect(out).toEqual(v2);
    expect(out.profile.level).toBe("L5");
    expect(out.rewards.stars).toBe(7);
    expect(out.wordProgress["w-1"]).toBe("spoken");
  });

  it("非法输入返回 null（不抛错，调用方走初始状态）", () => {
    for (const bad of [null, undefined, "x", 42, [], {}, { sessions: 1 }]) {
      expect(migrateV1toV2(bad)).toBeNull();
    }
  });

  it("v2 结构缺字段时补默认值而非判非法", () => {
    const out = migrateV1toV2({ v: 2, sessions: [], checkins: [] }) as AppState;
    expect(out.profile.level).toBe("L3");
    expect(out.points.total).toBe(0);
    expect(out.settings.speechRate).toBe(0.9);
  });
});

describe("备份导出导入（v1/v2 兼容）", () => {
  it("v2 备份往返一致", () => {
    const state = createInitialState("L4");
    state.points.total = 55;
    const round = importBackup(exportBackup(state)) as AppState;
    expect(round).toEqual(state);
  });

  it("v1 备份可导入并自动补默认字段", () => {
    const round = importBackup(JSON.stringify(V1_STATE)) as AppState;
    expect(round.v).toBe(2);
    expect(round.points.total).toBe(130);
    expect(round.profile.level).toBe("L3");
  });

  it("格式错误返回 null，不破坏现有状态", () => {
    expect(importBackup("not json")).toBeNull();
    expect(importBackup("{\"a\":1}")).toBeNull();
  });
});

// ─── 关卡星级结算（Phase 2，PRD §7.7.6）─────────────────────────

describe("settleLevelStars（重刷不重复计星）", () => {
  it("首刷按星数累计入 rewards.stars", () => {
    const base = createInitialState().rewards;
    const { rewards, gained } = settleLevelStars(base, "l4-addCarry", 3);
    expect(gained).toBe(3);
    expect(rewards.stars).toBe(3);
    expect(rewards.levelStars["l4-addCarry"]).toBe(3);
  });

  it("重刷更低/相同星数：不重复计星", () => {
    let rewards = createInitialState().rewards;
    rewards = settleLevelStars(rewards, "st", 3).rewards;
    const again = settleLevelStars(rewards, "st", 2);
    expect(again.gained).toBe(0);
    expect(again.rewards.stars).toBe(3);
    expect(again.rewards.levelStars["st"]).toBe(3); // 保留历史最佳
  });

  it("重刷更高星数：只补差额", () => {
    let rewards = createInitialState().rewards;
    rewards = settleLevelStars(rewards, "st", 1).rewards;
    const better = settleLevelStars(rewards, "st", 3);
    expect(better.gained).toBe(2);
    expect(better.rewards.stars).toBe(3);
    expect(better.rewards.levelStars["st"]).toBe(3);
  });

  it("三星判定：≥90 三星 / ≥70 两星 / 完成一星", () => {
    expect(starsForAccuracy(100)).toBe(3);
    expect(starsForAccuracy(90)).toBe(3);
    expect(starsForAccuracy(89)).toBe(2);
    expect(starsForAccuracy(70)).toBe(2);
    expect(starsForAccuracy(10)).toBe(1);
  });
});

describe("时长控制（F46）", () => {
  it("同日累加，跨日重置", () => {
    const today = { date: todayStr(), usedSec: 100 };
    expect(addUsedTime(today, 20).usedSec).toBe(120);
    expect(addUsedTime({ date: "2000-01-01", usedSec: 9999 }, 5).usedSec).toBe(5);
  });

  it("不限时（limit ≤ 0）永不触发护眼", () => {
    expect(isTimeUp({ date: todayStr(), usedSec: 99999 }, 0)).toBe(false);
    expect(remainingSec({ date: todayStr(), usedSec: 10 }, 0)).toBe(Infinity);
  });

  it("到达上限触发护眼，剩余秒数正确", () => {
    const st = { date: todayStr(), usedSec: 20 * 60 };
    expect(isTimeUp(st, 20)).toBe(true);
    expect(remainingSec(st, 20)).toBe(0);
    expect(remainingSec({ date: todayStr(), usedSec: 0 }, 20)).toBe(1200);
  });
});

// ── Phase 3：misspelled / taskFlags 增量字段（T3.2/T3.4）─────────
describe("Phase 3 状态字段", () => {
  it("createInitialState 含 misspelled=[] 与 taskFlags={}", () => {
    const s = createInitialState("L3");
    expect(s.misspelled).toEqual([]);
    expect(s.taskFlags).toEqual({});
  });

  it("migrateV1toV2 对缺失新字段的 v2 输入补默认值（幂等兜底）", () => {
    const s = createInitialState("L2");
    const stripped = JSON.parse(JSON.stringify(s));
    delete stripped.misspelled;
    delete stripped.taskFlags;
    const migrated = migrateV1toV2(stripped);
    expect(migrated).not.toBeNull();
    expect(migrated?.misspelled).toEqual([]);
    expect(migrated?.taskFlags).toEqual({});
    expect(migrated?.profile.level).toBe("L2");
  });

  it("misspelled 超限时截断至 20 条", () => {
    const s = createInitialState("L3");
    const bloated = { ...s, misspelled: Array.from({ length: 30 }, (_, i) => `w${i}`) };
    const migrated = migrateV1toV2(bloated);
    expect(migrated?.misspelled).toHaveLength(20);
  });
});

// ── Phase 5A：词卡 500 内容校验（C3）───────────────────────────────
import { getAllWords } from "./parser";
import type { Word } from "./contentTypes";

describe("C3 词卡内容（500 词 + 学段分布）", () => {
  it("总词数 = 500，学段分布符合 §6.10 规划", () => {
    const words = getAllWords();
    expect(words).toHaveLength(500);
    const counts: Record<string, number> = {};
    words.forEach((w) => {
      const lvl = w.level ?? "unknown";
      counts[lvl] = (counts[lvl] || 0) + 1;
    });
    expect(counts.L1 ?? 0).toBe(40);
    expect(counts.L2 ?? 0).toBe(80);
    expect(counts.L3 ?? 0).toBe(100);
    expect(counts.L4 ?? 0).toBe(100);
    expect(counts.L5 ?? 0).toBe(120);
    expect(counts.L6 ?? 0).toBe(60);
  });

  it("每个词三语齐全、有 emoji 与分类", () => {
    const words = getAllWords();
    words.forEach((w) => {
      expect(w.zh).toBeTruthy();
      expect(w.en).toBeTruthy();
      expect(w.fr).toBeTruthy();
      expect(w.emoji).toBeTruthy();
      expect(w.category).toBeTruthy();
    });
  });
});

// ── Phase 5B：sessionDurationMin（BUG-3 真实计时）───────────────
describe("sessionDurationMin", () => {
  it("≥ 1 分钟，≤ 60 分钟", () => {
    expect(sessionDurationMin(Date.now() - 30000)).toBe(1);
    expect(sessionDurationMin(Date.now() - 3600000)).toBe(60);
    expect(sessionDurationMin(Date.now() - 7200000)).toBe(60);
  });
  it("非法值返回 1", () => {
    expect(sessionDurationMin(Infinity)).toBe(1);
    expect(sessionDurationMin(Date.now() + 10000)).toBe(1);
  });
});
