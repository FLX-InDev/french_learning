import type { Sentence, Story } from "./parser";
import type { ContentType } from "./contentTypes";
import { DEFAULT_LEVEL, isLevel, type Level, type QuizMode, type Subject } from "./levels";

// ─── Types ───────────────────────────────────────────────────────

/** 题型枚举真源在 lib/levels.ts（学段配置中的 enabledQuizModes 复用） */
export type { QuizMode };

/** 跟读打分的目标语言 */
export type SpeakLang = "fr" | "en";

/**
 * 跟读及格线一律从 lib/levels.ts 按学段读取（BUG-4 关闭）：
 * 见 getPassScore(level) / isPronunciationPass(score, level)。
 */

export type QuizQuestion = {
  fr: string;
  en: string;
  zh: string;
  options: string[]; // 4 个 zh 候选（跟读题为空数组）
  correctIndex: number;
  userIndex: number | null;
  explanation: string; // «fr» 意思是「zh」（EN: en）
  mode: QuizMode; // 出题方式：选择题 / 听力题 / 跟读题
  // ── 仅跟读题（mode === "speak"）使用 ──
  targetLang?: SpeakLang; // 本句要求跟读的语言
  targetText?: string; // 跟读的目标文本（= fr 或 en）
  score?: number | null; // 0-100 发音得分
  transcript?: string; // 语音识别出的文本
  feedback?: string[]; // 发音建议
  // ── v2.0 Phase 3 新增（只增字段，向后兼容）──
  /** 题目真实学科：跨学科混合卷（每日挑战）的错题按此归组，缺省回退 session.subject */
  subject?: Subject;
  /** 数学/逻辑题知识点（kind）：错题复习时用于「同知识点重生成」（PRD §7.10.8） */
  kind?: string;
};

export type ContentRef = {
  type: "story" | "sentence" | "mixed";
  id?: string;
  title: string;
};

export type StudySession = {
  id: string;
  date: string; // YYYY-MM-DD
  durationMin: number;
  contentRef: ContentRef;
  quiz: { title: string; questions: QuizQuestion[] };
  reviewed: boolean;
  /** v2 新增：学科（v1 历史记录迁移时统一补 "language"） */
  subject?: Subject;
};

export type PointRecord = { date: string; delta: number; reason: string };

export type RewardItem = {
  id: string;
  icon: string;
  name: string;
  cost: number;
};

export const REWARDS: RewardItem[] = [
  { id: "sticker", icon: "🎨", name: "专属贴纸包", cost: 30 },
  { id: "story", icon: "📚", name: "额外故事解锁", cost: 50 },
  { id: "song", icon: "🎵", name: "儿歌音频集", cost: 80 },
  { id: "medal", icon: "🏆", name: "月度学霸勋章", cost: 150 },
];

// ─── Helpers ─────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 合并故事句子与独立句子，按三元组去重，得到真实出题池 */
export function buildPool(stories: Story[], sentences: Sentence[]): Sentence[] {
  const seen = new Set<string>();
  const pool: Sentence[] = [];
  const add = (s: Sentence) => {
    const key = s.fr + "|" + s.zh + "|" + s.en;
    if (!seen.has(key)) {
      seen.add(key);
      pool.push(s);
    }
  };
  stories.forEach((st) => st.sentences.forEach(add));
  sentences.forEach(add);
  return pool;
}

/**
 * 从真实内容池自动出题：展示法语，要求选出正确中文。
 * 候选 = 正确中文 + 3 个其它句子的中文（去重）；解析含完整三语三元组。
 * mode 标记出题方式（choice=选择题，listen=听力题），数据本身一致，仅 UI 表现不同。
 */
export function generateQuiz(
  pool: Sentence[],
  count = 4,
  mode: QuizMode = "choice"
): QuizQuestion[] {
  if (pool.length === 0) return [];
  const n = Math.min(count, pool.length);
  const picked = shuffle(pool).slice(0, n);
  return picked.map((s) => {
    const distractSet = new Set(
      shuffle(pool.filter((x) => x.zh !== s.zh).map((x) => x.zh))
    );
    const distract = Array.from(distractSet).slice(0, 3);
    while (distract.length < 3) distract.push("—");
    const options = shuffle([s.zh, ...distract]);
    return {
      fr: s.fr,
      en: s.en,
      zh: s.zh,
      options,
      correctIndex: options.indexOf(s.zh),
      userIndex: null,
      explanation: `« ${s.fr} » 意思是「${s.zh}」（EN: ${s.en}）`,
      mode,
    };
  });
}

/**
 * 跟读打分出题：从真实内容池随机抽句，随机指定跟读法语或英语。
 * 语言做均衡打乱（fr/en 交替后 shuffle），避免整卷恰好同为一种语言。
 * 跟读题没有选项：options 为空、correctIndex 固定 0；
 * userIndex 在打分后回填（及格记 0，不及格记 null —— 后者不会进入错题本）。
 */
export function generateSpeakQuiz(
  pool: Sentence[],
  count = 4
): QuizQuestion[] {
  if (pool.length === 0) return [];
  const n = Math.min(count, pool.length);
  const picked = shuffle(pool).slice(0, n);

  // 均衡语言：fr/en 交替铺满后打乱，保证尽量混合
  const langs: SpeakLang[] = [];
  for (let i = 0; i < n; i++) langs.push(i % 2 === 0 ? "fr" : "en");
  const shuffledLangs = shuffle(langs);

  return picked.map((s, i) => {
    const lang = shuffledLangs[i];
    const targetText = lang === "fr" ? s.fr : s.en;
    return {
      fr: s.fr,
      en: s.en,
      zh: s.zh,
      options: [],
      correctIndex: 0,
      userIndex: null,
      explanation: `« ${s.fr} » 意思是「${s.zh}」（EN: ${s.en}）`,
      mode: "speak" as QuizMode,
      targetLang: lang,
      targetText,
      score: null,
      transcript: "",
      feedback: [],
    };
  });
}

// ─── 日期 / 统计 / 积分（原 WorkspaceView 内部工具，下沉为纯函数便于单测）───

export function fmt(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function todayStr(): string {
  return fmt(new Date());
}

/** "2026-09-07" → "09月07日" */
export function mdLabel(s: string): string {
  const p = s.split("-");
  return p[1] + "月" + p[2] + "日";
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function quizResult(s: StudySession) {
  const qs = s.quiz.questions;
  let c = 0;
  for (const q of qs) if (q.userIndex === q.correctIndex) c++;
  return {
    score: c,
    total: qs.length,
    acc: qs.length ? Math.round((c / qs.length) * 100) : 0,
  };
}

export function accColor(a: number): string {
  return a >= 80 ? "#16A34A" : a >= 60 ? "#D97706" : "#EF4444";
}

/** 当前连续打卡天数：今天未打卡则从昨天起算 */
export function computeStreak(checkins: string[]): number {
  let d = new Date();
  if (!checkins.includes(todayStr())) d = addDays(d, -1);
  let s = 0;
  while (checkins.includes(fmt(d))) {
    s++;
    d = addDays(d, -1);
  }
  return s;
}

export function computeLongestStreak(checkins: string[]): number {
  if (checkins.length === 0) return 0;
  const uniq = checkins.filter((c, i) => checkins.indexOf(c) === i).sort();
  let best = 1;
  let cur = 1;
  let prev: string | null = null;
  for (const ds of uniq) {
    if (prev) {
      const diff = Math.round(
        (new Date(ds).getTime() - new Date(prev).getTime()) / 86400000
      );
      cur = diff === 1 ? cur + 1 : 1;
      best = Math.max(best, cur);
    }
    prev = ds;
  }
  return best;
}

/** 积分加减：累加总额并追加一条流水（日期取当天） */
export function addPoints(
  p: WorkspaceState["points"],
  delta: number,
  reason: string
): WorkspaceState["points"] {
  return {
    total: p.total + delta,
    history: [...p.history, { date: todayStr(), delta, reason }],
  };
}

// ─── 应用状态树 v2（PRD §9.4，Dev-Plan T1.3）─────────────────────

export const STATE_KEY = "wb_frws_state";

export type SpeechRate = 0.75 | 0.9;
export type MascotStage = "egg" | "baby" | "teen" | "adult";
export type WordStatus = "heard" | "flipped" | "correct" | "spoken";
export type WordProgress = Record<string, WordStatus>;

export type Profile = {
  level: Level; // 学段唯一真源
  mascotName?: string;
  createdAt: string;
  /** 首次启动引导是否已完成 */
  onboarded: boolean;
};

export type Settings = {
  speechRate: SpeechRate;
  sfxOn: boolean;
  bgmOn: boolean;
  /** 点按音效（tap）单独开关，默认关（PRD §7.3 音效触发矩阵） */
  tapSfxOn: boolean;
  /** 每日时长上限（分钟），0 = 不限 */
  dailyLimitMin: number;
  /** 家长中心隐藏的内容类型（运行时过滤，叠加在 manifest 之上） */
  hiddenContent: ContentType[];
};

export type ScreenTime = { date: string; usedSec: number };
export type Rewards = {
  stars: number;
  stickers: string[];
  badges: string[];
  /** 数学关卡 id → 历史最佳星数（0–3），用于「重刷不重复计星」 */
  levelStars: Record<string, number>;
};
export type Mascot = { stage: MascotStage; fedCount: number };

export type AppState = {
  v: 2;
  profile: Profile;
  settings: Settings;
  screenTime: ScreenTime;
  sessions: StudySession[];
  checkins: string[];
  points: { total: number; history: PointRecord[] };
  redeemed: { id: string; date: string; cost: number }[];
  rewards: Rewards;
  mascot: Mascot;
  wordProgress: WordProgress;
  /** Phase 3：拼错的词 id 队列（最新在前，上限 20）——每日挑战优先重现（PRD §7.5.5） */
  misspelled: string[];
  /** Phase 3：一次性任务标记（key → 完成日期），如 song_<id> 完听任务（F4.6）、每日挑战当日完成 */
  taskFlags: Record<string, string>;
};

/** v1 状态树（保留用于迁移与备份兼容） */
export type WorkspaceState = Pick<
  AppState,
  "sessions" | "checkins" | "points" | "redeemed"
>;

/** 每日时长可选档位（0 = 不限） */
export const DAILY_LIMIT_OPTIONS = [10, 15, 20, 30, 0] as const;
export const DEFAULT_DAILY_LIMIT_MIN = 20;

/**
 * 首屏无数据时的初始状态：只造 profile + 空进度，
 * 不再造演示 session（PRD §9.4，避免误导）。
 */
export function createInitialState(level: Level = DEFAULT_LEVEL): AppState {
  return {
    v: 2,
    profile: {
      level: isLevel(level) ? level : DEFAULT_LEVEL,
      createdAt: todayStr(),
      onboarded: false,
    },
    settings: {
      speechRate: 0.9,
      sfxOn: true,
      bgmOn: false,
      tapSfxOn: false,
      dailyLimitMin: DEFAULT_DAILY_LIMIT_MIN,
      hiddenContent: [],
    },
    screenTime: { date: todayStr(), usedSec: 0 },
    sessions: [],
    checkins: [],
    points: { total: 0, history: [] },
    redeemed: [],
    rewards: { stars: 0, stickers: [], badges: [], levelStars: {} },
    mascot: { stage: "egg", fedCount: 0 },
    wordProgress: {},
    misspelled: [],
    taskFlags: {},
  };
}

/** 补齐 v2 结构中缺失的字段（幂等，非法值回落默认） */
function normalizeV2(raw: Record<string, unknown>): AppState {
  const base = createInitialState();
  const profile = (raw.profile ?? {}) as Partial<Profile>;
  const settings = (raw.settings ?? {}) as Partial<Settings>;
  const screenTime = (raw.screenTime ?? {}) as Partial<ScreenTime>;
  const rewards = (raw.rewards ?? {}) as Partial<Rewards>;
  const mascot = (raw.mascot ?? {}) as Partial<Mascot>;
  const points = (raw.points ?? {}) as Partial<AppState["points"]>;

  return {
    v: 2,
    profile: {
      level: isLevel(profile.level) ? (profile.level as Level) : base.profile.level,
      mascotName: profile.mascotName,
      createdAt: profile.createdAt || base.profile.createdAt,
      onboarded: profile.onboarded !== false,
    },
    settings: {
      speechRate: settings.speechRate === 0.75 ? 0.75 : 0.9,
      sfxOn: settings.sfxOn !== false,
      bgmOn: settings.bgmOn === true,
      tapSfxOn: settings.tapSfxOn === true,
      dailyLimitMin:
        typeof settings.dailyLimitMin === "number" && settings.dailyLimitMin >= 0
          ? settings.dailyLimitMin
          : base.settings.dailyLimitMin,
      hiddenContent: Array.isArray(settings.hiddenContent)
        ? (settings.hiddenContent as ContentType[])
        : [],
    },
    screenTime: {
      date: screenTime.date || base.screenTime.date,
      usedSec:
        typeof screenTime.usedSec === "number" && screenTime.usedSec >= 0
          ? screenTime.usedSec
          : 0,
    },
    sessions: Array.isArray(raw.sessions)
      ? (raw.sessions as StudySession[]).map((s) => ({
          ...s,
          subject: s.subject ?? "language",
        }))
      : [],
    checkins: Array.isArray(raw.checkins)
      ? (raw.checkins as string[]).filter((c) => typeof c === "string")
      : [],
    points: {
      total: typeof points.total === "number" ? points.total : 0,
      history: Array.isArray(points.history) ? points.history : [],
    },
    redeemed: Array.isArray(raw.redeemed)
      ? (raw.redeemed as AppState["redeemed"])
      : [],
    rewards: {
      stars: typeof rewards.stars === "number" ? rewards.stars : 0,
      stickers: Array.isArray(rewards.stickers) ? rewards.stickers : [],
      badges: Array.isArray(rewards.badges) ? rewards.badges : [],
      levelStars:
        raw && typeof raw === "object" && rewards.levelStars &&
        typeof rewards.levelStars === "object"
          ? (rewards.levelStars as Record<string, number>)
          : {},
    },
    mascot: {
      stage: (["egg", "baby", "teen", "adult"] as MascotStage[]).includes(
        mascot.stage as MascotStage
      )
        ? (mascot.stage as MascotStage)
        : "egg",
      fedCount: typeof mascot.fedCount === "number" ? mascot.fedCount : 0,
    },
    wordProgress:
      raw.wordProgress && typeof raw.wordProgress === "object"
        ? (raw.wordProgress as WordProgress)
        : {},
    misspelled: Array.isArray(raw.misspelled)
      ? (raw.misspelled as string[]).filter((x) => typeof x === "string").slice(0, 20)
      : [],
    taskFlags:
      raw.taskFlags && typeof raw.taskFlags === "object"
        ? (raw.taskFlags as Record<string, string>)
        : {},
  };
}

/**
 * v1 → v2 状态迁移（PRD §9.4，评审 P1-6）
 * - 输入未知结构的 JSON（localStorage / 备份文件）；
 * - 已是 v2 结构时原样规范化返回（幂等）；
 * - 结构不符或关键字段缺失返回 null（调用方走 createInitialState）。
 */
export function migrateV1toV2(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.v === 2) return normalizeV2(o);

  // v1：以 sessions / checkins / points 三项为关键字段
  const sessions = Array.isArray(o.sessions) ? (o.sessions as StudySession[]) : null;
  const checkins = Array.isArray(o.checkins)
    ? (o.checkins as string[]).filter((c) => typeof c === "string")
    : null;
  const points = o.points && typeof o.points === "object"
    ? (o.points as Partial<AppState["points"]>)
    : null;
  if (!sessions || !checkins || !points) return null;

  const state = createInitialState(DEFAULT_LEVEL);
  return {
    ...state,
    profile: { ...state.profile, level: DEFAULT_LEVEL, onboarded: false },
    sessions: sessions.map((s) => ({ ...s, subject: s.subject ?? "language" })),
    checkins,
    points: {
      total: typeof points.total === "number" ? points.total : 0,
      history: Array.isArray(points.history) ? points.history : [],
    },
    redeemed: Array.isArray(o.redeemed)
      ? (o.redeemed as AppState["redeemed"])
      : [],
  };
}

// ─── 持久化与备份 ────────────────────────────────────────────────

/** 读取本地状态：无数据或结构非法时回落初始状态 */
export function loadState(): AppState {
  if (typeof window === "undefined") return createInitialState();
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return createInitialState();
    return migrateV1toV2(JSON.parse(raw)) ?? createInitialState();
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用（隐私模式/配额）时静默失败，不影响使用
  }
}

/** 导出备份（统一 v2 格式） */
export function exportBackup(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** 导入备份：同时接受 v1 与 v2；解析失败返回 null，不破坏现有状态 */
export function importBackup(text: string): AppState | null {
  try {
    return migrateV1toV2(JSON.parse(text));
  } catch {
    return null;
  }
}

// ─── 时长控制（F46 辅助纯函数）───────────────────────────────────

/** 累加使用时长；跨天自动重置 */
export function addUsedTime(st: ScreenTime, sec: number): ScreenTime {
  const today = todayStr();
  if (st.date !== today) return { date: today, usedSec: Math.max(0, Math.round(sec)) };
  return { date: today, usedSec: st.usedSec + Math.max(0, Math.round(sec)) };
}

/** 每日时长是否用尽（limitMin ≤ 0 表示不限） */
export function isTimeUp(st: ScreenTime, limitMin: number): boolean {
  if (!limitMin || limitMin <= 0) return false;
  const today = todayStr();
  if (st.date !== today) return false;
  return st.usedSec >= limitMin * 60;
}

/** 剩余可用秒数（不限时为 Infinity） */
export function remainingSec(st: ScreenTime, limitMin: number): number {
  if (!limitMin || limitMin <= 0) return Infinity;
  const today = todayStr();
  if (st.date !== today) return limitMin * 60;
  return Math.max(0, limitMin * 60 - st.usedSec);
}

// ─── 关卡星级结算（PRD §7.7.6，Phase 2）──────────────────────────

/**
 * 星级结算：≥90% 三星 / ≥70% 两星 / 完成一星；
 * 只累加「超过历史最佳」的部分——重刷不重复计星。
 */
export function settleLevelStars(
  rewards: Rewards,
  stageId: string,
  stars: number
): { rewards: Rewards; gained: number } {
  const best = rewards.levelStars[stageId] ?? 0;
  const next = Math.max(0, Math.min(3, Math.round(stars)));
  const gained = Math.max(0, next - best);
  if (gained === 0) return { rewards, gained: 0 };
  return {
    rewards: {
      ...rewards,
      stars: rewards.stars + gained,
      levelStars: { ...rewards.levelStars, [stageId]: Math.max(best, next) },
    },
    gained,
  };
}

export function starsForAccuracy(acc: number): 1 | 2 | 3 {
  return acc >= 90 ? 3 : acc >= 70 ? 2 : 1;
}

/** 学科中文名（错题本分组 / 统计展示） */
export const SUBJECT_LABELS: Record<Subject, string> = {
  language: "语言",
  math: "数学",
  logic: "逻辑",
  life: "生活",
};
