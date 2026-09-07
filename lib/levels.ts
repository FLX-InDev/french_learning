/**
 * 分龄学习体系配置中枢（PRD §6 / §9.1，Dev-Plan T1.1）
 *
 * 全站唯一真源：`AppState.profile.level` 保存当前学段，
 * 出题池过滤、选项数、跟读及格线、限时、重试次数、每日挑战配比
 * 一律从本文件的 LEVELS 读取，禁止在业务代码里硬编码（对应 BUG-4 关闭）。
 */

// ─── 基础类型 ────────────────────────────────────────────────────

export type Level = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

/** 学科（用于每日挑战配比与错题分组） */
export type Subject = "language" | "math" | "logic" | "life";

/** 题型开关（与 lib/workspace.ts 共用同一枚举） */
export type QuizMode = "choice" | "listen" | "speak";

export type LevelConfig = {
  id: Level;
  ageRange: string; // "3-4"
  cnName: string; // 小班
  frName: string; // Petite section
  emoji: string;
  /** 选择题/听力题选项数 */
  optionCount: number;
  /** 跟读及格线（null = 不评分，只鼓励） */
  passScore: number | null;
  /** 每日挑战总题数 */
  dailyQuizCount: number;
  /** 每日挑战学科配比（和应等于 dailyQuizCount） */
  dailyMix: Record<Subject, number>;
  /** 口算限时（秒），null = 不限时（限时赛为 P2，L4 的 120s 本期不启用） */
  timeLimitSec: number | null;
  /** 答错可重试次数（Infinity = 无限） */
  retryAllowed: number;
  /** 该学段启用的题型 */
  enabledQuizModes: QuizMode[];
};

// ─── 六学段配置（依据 PRD §6.2–§6.7）────────────────────────────

export const LEVELS: Record<Level, LevelConfig> = {
  L1: {
    id: "L1",
    ageRange: "3-4",
    cnName: "小班",
    frName: "Petite section",
    emoji: "🐣",
    optionCount: 2,
    passScore: null, // §6.2 跟读不计分，点亮星星即鼓励
    dailyQuizCount: 4,
    dailyMix: { language: 4, math: 0, logic: 0, life: 0 },
    timeLimitSec: null,
    retryAllowed: Infinity, // §6.2 每题可无限重试
    enabledQuizModes: ["choice", "listen", "speak"],
  },
  L2: {
    id: "L2",
    ageRange: "4-5",
    cnName: "中班",
    frName: "Moyenne section",
    emoji: "🐰",
    optionCount: 3,
    passScore: 50,
    dailyQuizCount: 6,
    dailyMix: { language: 3, math: 2, logic: 1, life: 0 },
    timeLimitSec: null,
    retryAllowed: 1, // §6.3 答错可重试 1 次
    enabledQuizModes: ["choice", "listen", "speak"],
  },
  L3: {
    id: "L3",
    ageRange: "5-6",
    cnName: "大班",
    frName: "Grande section",
    emoji: "🦊",
    optionCount: 4,
    passScore: 60,
    dailyQuizCount: 8,
    dailyMix: { language: 4, math: 2, logic: 2, life: 0 },
    timeLimitSec: null, // §6.4 口算不限时
    retryAllowed: 2,
    enabledQuizModes: ["choice", "listen", "speak"],
  },
  L4: {
    id: "L4",
    ageRange: "6-7",
    cnName: "一年级",
    frName: "CP",
    emoji: "🎒",
    optionCount: 4,
    passScore: 65,
    dailyQuizCount: 10,
    dailyMix: { language: 5, math: 3, logic: 2, life: 0 },
    timeLimitSec: null, // §6.5：120s 属 P2 限时赛，P2 前不限时
    retryAllowed: 2,
    enabledQuizModes: ["choice", "listen", "speak"],
  },
  L5: {
    id: "L5",
    ageRange: "7-8",
    cnName: "二年级",
    frName: "CE1",
    emoji: "🚀",
    optionCount: 4,
    passScore: 70,
    dailyQuizCount: 10,
    dailyMix: { language: 4, math: 4, logic: 2, life: 0 },
    timeLimitSec: 60, // §6.6 乘法闯关 60 秒/10 题
    retryAllowed: 1,
    enabledQuizModes: ["choice", "listen", "speak"],
  },
  L6: {
    id: "L6",
    ageRange: "8+",
    cnName: "三年级",
    frName: "CE2",
    emoji: "🏆",
    optionCount: 4,
    passScore: 75,
    dailyQuizCount: 12,
    dailyMix: { language: 5, math: 4, logic: 3, life: 0 },
    timeLimitSec: 60,
    retryAllowed: 1,
    enabledQuizModes: ["choice", "listen", "speak"],
  },
};

/** 学段顺序（选择器与升降段判断用） */
export const LEVEL_ORDER: Level[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

/** 缺省学段：v1 用户迁移与非法值兜底（PRD §9.4：v1 内容池主体适配段） */
export const DEFAULT_LEVEL: Level = "L3";

// ─── 读取函数 ────────────────────────────────────────────────────

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVEL_ORDER as string[]).includes(v);
}

/** 取学段配置；非法值回落到 DEFAULT_LEVEL（永不抛错） */
export function getLevelConfig(level: unknown): LevelConfig {
  return LEVELS[isLevel(level) ? level : DEFAULT_LEVEL];
}

/** BUG-4：跟读及格线唯一读取入口。返回 null 表示该学段不评分 */
export function getPassScore(level: unknown): number | null {
  return getLevelConfig(level).passScore;
}

/**
 * 跟读是否通过（BUG-4 的作用域：仅影响通过判定，不改变 score 计算方式）。
 * passScore 为 null（L1）时恒定通过——只鼓励不评判。
 */
export function isPronunciationPass(score: number, level: unknown): boolean {
  const pass = getPassScore(level);
  return pass === null ? true : score >= pass;
}

export function getOptionCount(level: unknown): number {
  return getLevelConfig(level).optionCount;
}

/** 徽标文案：L2 · 4-5 岁（中班 / Moyenne section） */
export function levelLabel(level: unknown): string {
  const c = getLevelConfig(level);
  return `${c.id} · ${c.ageRange.replace("-", "-")} 岁（${c.cnName} / ${c.frName}）`;
}

/** 每日挑战学科配比展开为题数列表，如 ["language"×3, "math"×2, ...] */
export function expandDailyMix(level: unknown): Subject[] {
  const { dailyMix, dailyQuizCount } = getLevelConfig(level);
  const out: Subject[] = [];
  (Object.keys(dailyMix) as Subject[]).forEach((s) => {
    for (let i = 0; i < dailyMix[s]; i++) out.push(s);
  });
  return out.slice(0, dailyQuizCount);
}
