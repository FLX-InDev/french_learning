import type { Sentence, Story } from "./parser";

// ─── Types ───────────────────────────────────────────────────────

export type QuizMode = "choice" | "listen" | "speak";

/** 跟读打分的目标语言 */
export type SpeakLang = "fr" | "en";

/** 跟读及格线：达到即视为通过（并用于是否计入错题本） */
export const PASS_SCORE = 60;

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
