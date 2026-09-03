import type { Sentence, Story } from "./parser";

// ─── Types ───────────────────────────────────────────────────────

export type QuizMode = "choice" | "listen";

export type QuizQuestion = {
  fr: string;
  en: string;
  zh: string;
  options: string[]; // 4 个 zh 候选
  correctIndex: number;
  userIndex: number | null;
  explanation: string; // «fr» 意思是「zh」（EN: en）
  mode: QuizMode; // 出题方式：选择题 / 听力题
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
};

export type PointRecord = { date: string; delta: number; reason: string };

export type WorkspaceState = {
  sessions: StudySession[];
  checkins: string[]; // 日期串
  points: { total: number; history: PointRecord[] };
  redeemed: { id: string; date: string; cost: number }[];
};

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

/** 用真实内容生成首屏示例，保证非空且含 1 条逾期未点评 */
export function buildSeed(stories: Story[], sentences: Sentence[]): WorkspaceState {
  const pool = buildPool(stories, sentences);
  const fmt = (d: Date) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const y2 = new Date(today);
  y2.setDate(y2.getDate() - 2);
  const y3 = new Date(today);
  y3.setDate(y3.getDate() - 3);
  const y4 = new Date(today);
  y4.setDate(y4.getDate() - 4);
  const tStr = fmt(today);
  const yStr = fmt(y);
  const y2Str = fmt(y2);

  const mkSession = (
    story: Story | undefined,
    date: Date,
    durationMin: number,
    reviewed: boolean
  ): StudySession => {
    const src = story && story.sentences.length ? story.sentences : pool;
    const quiz = generateQuiz(src, 4);
    return {
      id: "s_" + fmt(date) + (story ? "_" + story.id : ""),
      date: fmt(date),
      durationMin,
      contentRef: story
        ? { type: "story", id: story.id, title: story.title }
        : { type: "sentence", title: "日常句子练习" },
      quiz: {
        title: (story ? story.title : "日常句子") + " · 小测验",
        questions: quiz,
      },
      reviewed,
    };
  };

  return {
    sessions: [
      mkSession(stories[0], today, 18, true),
      mkSession(stories[1], y, 12, false),
      mkSession(stories[2] ?? undefined, y2, 15, true),
    ],
    checkins: [tStr, yStr, y2Str, fmt(y3), fmt(y4)],
    points: {
      total: 130,
      history: [
        { date: y2Str, delta: 20, reason: "完成学习 + 打卡" },
        { date: yStr, delta: 10, reason: "每日打卡" },
        { date: tStr, delta: 100, reason: "连续学习奖励" },
      ],
    },
    redeemed: [],
  };
}
