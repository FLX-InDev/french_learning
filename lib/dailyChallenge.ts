/**
 * 每日挑战出题引擎（PRD §7.10.7，Dev-Plan T3.4）
 *
 * - 跨学科混合卷：学科配比来自 levels.ts 的 dailyMix（expandDailyMix）；
 * - 幂等：以「日期 + 学段」为种子，同一天重复进入不出新卷（PRD 验收项）；
 * - 拼词优先重现：misspelled 队列中的词（存在于当前拼词池）替换一道语言题
 *   （PRD §7.5.5「拼错的词在下一次每日挑战中优先重现」）；
 * - 语言题 choice/listen 交替；跟读题不进每日挑战（依赖 ASR，走自主测验入口）；
 * - 逻辑题取 pattern / oddOne（选项型，无需拖拽；classify/sort 属题组玩法）；
 * - SRS 到期题优先（Phase 6 T6-06，契约 §2.1）：`srs` 入参提供到期题键，
 *   至多 2 道（跨学科）占据同学科名额，学科配比与总题数保持不变；
 * - 拼读扩展点（Phase 6 T6-07 接线）：`phonics.provider` 可替换一道常规语言题，
 *   本文件只负责接线与名额替换，出题逻辑由 T6-07 提供。
 */

import type { MathKind, Rng } from "./mathGenerator";
import { mulberry32, seedFromString } from "./mathGenerator";
import {
  generateMathQuestion,
  normalizeAnswer,
  toChoiceQuizQuestion,
  type MathQuestion,
} from "./mathGenerator";
import {
  generateLogicQuestion,
  logicToChoiceQuestion,
  toQuizQuestion as logicToQuizQuestion,
  checkLogicAnswer,
  type LogicKind,
  type LogicQuestion,
} from "./logicEngine";
import { expandDailyMix, getOptionCount, type Level, type Subject } from "./levels";
import { stageKindsForLevel } from "./mathCurriculum";
import { matchesLevel, type AlphabetCard, type Word } from "./contentTypes";
import type { Sentence } from "./parser";
import { buildSpellingPool, type SpellingWord } from "./spelling";
import type { PhonicsCard } from "./phonics";
import type { QuizMode, QuizQuestion, SrsState } from "./workspace";
import {
  dueItems,
  hashKey,
  parseSrsKey,
  SRS_DAILY_LIMIT,
  type SrsKeyInfo,
} from "./srs";

export type DailyItem =
  | { subject: "language"; mode: "lang"; q: QuizQuestion }
  | { subject: "language"; mode: "spell"; word: SpellingWord }
  | {
      subject: "language";
      mode: "listenPick";
      word: Word;
      options: Word[];
      correctIndex: number;
    }
  | { subject: "math"; mode: "math"; q: MathQuestion }
  | { subject: "logic"; mode: "logic"; q: LogicQuestion }
  | { subject: "language"; mode: "phonics"; card: PhonicsCard };

/**
 * 听音选图（PRD §7.6.3 / F39，Phase 5A T5A.2）：
 * 播放法语词 → 从 optionCount（学段驱动 2/3/4）个 emoji 卡中选出；
 * 干扰项 emoji 互异且不同于正确项；词池不足时返回 null（回退语言题）。
 */
export function generateListenPick(
  wordPool: Word[],
  optionCount: number,
  rng: Rng
): { word: Word; options: Word[]; correctIndex: number } | null {
  if (wordPool.length < optionCount) return null;
  const word = wordPool[rngInt(rng, wordPool.length)];
  const candidates = wordPool.filter(
    (w) => w.id !== word.id && !!w.emoji && w.emoji !== word.emoji
  );
  const opts: Word[] = [word];
  const usedEmoji = new Set<string>([word.emoji]);
  const shuffled = seededShuffle(candidates, rng);
  for (const cand of shuffled) {
    if (opts.length >= optionCount) break;
    if (usedEmoji.has(cand.emoji)) continue;
    usedEmoji.add(cand.emoji);
    opts.push(cand);
  }
  if (opts.length < optionCount) return null;
  const options = seededShuffle(opts, rng);
  const correctIndex = Math.max(
    0,
    options.findIndex((w) => w.id === word.id)
  );
  return { word, options, correctIndex };
}

function rngInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

function seededShuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/** 每日挑战可用的逻辑题型（选项型；classify/sort/sudoku9 属题组玩法，不进每日挑战） */
const DAILY_LOGIC_KINDS: LogicKind[] = ["pattern", "oddOne"];

/**
 * 由**指定句子**生成语言题（选项 = 正确中文 + 3 干扰，种子化可重放）。
 * 抽出来供「常规出题」与「SRS 到期题重建」共用，保证两处口径一致。
 */
function langQuestionFor(
  s: Sentence,
  distractPool: Sentence[],
  mode: "choice" | "listen",
  rng: Rng
): QuizQuestion {
  const opts = new Set<string>([s.zh]);
  const shuffled = seededShuffle(distractPool, rng);
  for (const d of shuffled) {
    if (opts.size >= 4) break;
    opts.add(d.zh);
  }
  let pad = 1;
  while (opts.size < 4) opts.add("—" + pad++);
  const options = seededShuffle(Array.from(opts), rng);
  return {
    fr: s.fr,
    en: s.en,
    zh: s.zh,
    options,
    correctIndex: Math.max(
      0,
      options.findIndex((o) => o === s.zh)
    ),
    userIndex: null,
    explanation: `« ${s.fr} » 意思是「${s.zh}」（EN: ${s.en}）`,
    mode,
    subject: "language",
  };
}

/** 语言题（choice/listen 交替，选项 = 正确中文 + 3 干扰，种子化可重放） */
function generateLangQuestion(
  pool: Sentence[],
  mode: "choice" | "listen",
  rng: Rng
): QuizQuestion | null {
  if (pool.length === 0) return null;
  const s = pool[rngInt(rng, pool.length)];
  return langQuestionFor(s, pool.filter((x) => x.zh !== s.zh), mode, rng);
}

/** SRS 到期题接入参数（T6-06，契约 §2.1） */
export type DailySrsInput = {
  /** SRS 状态（AppState.srs） */
  state: SrsState;
  /** 今天 "YYYY-MM-DD"（由调用方按本地时区取，与打卡口径一致） */
  today: string;
  /** 至多安排几道到期题（默认 SRS_DAILY_LIMIT = 2） */
  limit?: number;
};

/**
 * 拼读扩展点（T6-07 接入，见 CONTEXT §2.3）：
 * T6-06 只负责接线与名额替换，具体出题逻辑由 T6-07 的 provider 提供。
 */
export type DailyPhonicsInput = {
  provider: (rng: Rng) => DailyItem | null;
};

export function generateDailyChallenge(params: {
  level: Level;
  date: string;
  pool: Sentence[];
  words: Word[];
  alphabets: AlphabetCard[];
  misspelled?: string[];
  /** T6-06：SRS 到期题优先（可选） */
  srs?: DailySrsInput;
  /** T6-07：拼读扩展点（可选） */
  phonics?: DailyPhonicsInput;
}): DailyItem[] {
  const { level, date, pool } = params;
  const rng = mulberry32(seedFromString(`daily_${date}_${level}`));

  // 1. 学科配比展开并乱序（每学科维护一个待发队列）
  const mix = seededShuffle(expandDailyMix(level), rng);
  const langPool = pool.filter((s) => matchesLevel(s.level, level));
  const spellingPool = buildSpellingPool(params.words, params.alphabets, level);

  const queues: Record<Subject, (() => DailyItem | null)[]> = {
    language: [],
    math: [],
    logic: [],
    life: [],
  };

  // 2. 语言题：拼错词优先重现（至多 1 道），其余 choice/listen 交替
  const spellWord = (params.misspelled ?? [])
    .map((id) => spellingPool.find((w) => w.id === id))
    .find((w): w is SpellingWord => !!w);
  if (spellWord) {
    queues.language.push(() => ({ subject: "language", mode: "spell", word: spellWord }));
  }
  const langTotal = mix.filter((s) => s === "language").length;
  const optionCount = getOptionCount(level);
  // 听音选图：L1–L3 占比更高（每 2 道语言题 1 道），L4+ 每 3 道 1 道（PRD §7.6.3）
  const listenPickEvery = level === "L1" || level === "L2" || level === "L3" ? 2 : 3;
  const wordPool = params.words.filter(
    (w) => matchesLevel(w.level, level) && !!w.emoji
  );
  for (let i = 0; i < langTotal; i++) {
    const useListenPick = wordPool.length >= optionCount && i % listenPickEvery === 1;
    queues.language.push(() => {
      if (useListenPick) {
        const lp = generateListenPick(wordPool, optionCount, rng);
        if (lp) return { subject: "language", mode: "listenPick", ...lp };
      }
      const mode = i % 2 === 0 ? "choice" : "listen";
      const q = generateLangQuestion(langPool, mode, rng);
      return q ? { subject: "language", mode: "lang", q } : null;
    });
  }
  // 3. 数学题：kind 从本学段课程表抽取
  const mathKinds = stageKindsForLevel(level);
  mix
    .filter((s) => s === "math")
    .forEach((_, i) => {
      queues.math.push(() => {
        if (mathKinds.length === 0) return null;
        const kind = mathKinds[rngInt(rng, mathKinds.length)];
        const q = generateMathQuestion({
          level,
          kind,
          rng,
          seedTag: `daily_${date}`,
          index: i,
        });
        return { subject: "math", mode: "math", q };
      });
    });

  // 4. 逻辑题：pattern / oddOne（选项型）
  mix
    .filter((s) => s === "logic")
    .forEach(() => {
      queues.logic.push(() => {
        const kind = DAILY_LOGIC_KINDS[rngInt(rng, DAILY_LOGIC_KINDS.length)];
        const q = generateLogicQuestion({ level, kind, rng });
        return { subject: "logic", mode: "logic", q };
      });
    });

  // 4.5 拼读扩展点（T6-07 接入）：替换一道常规语言题，学科名额不变
  if (params.phonics && queues.language.length > 0) {
    const provider = params.phonics.provider;
    // 独立 rng：不改变主出卷随机序列（保证既有题序稳定，不受拼读接入影响）
    const phonicsRng = mulberry32(seedFromString(`phonics_${date}_${level}`));
    const last = queues.language.length - 1;
    const original = queues.language[last];
    queues.language[last] = () => provider(phonicsRng) ?? original();
  }

  // 4.6 SRS 到期题优先（契约 §2.1）：至多 limit 道、跨学科，占据同学科名额，配比不变
  if (params.srs) {
    const due = dueItems(
      params.srs.state,
      params.srs.today,
      params.srs.limit ?? SRS_DAILY_LIMIT
    );
    for (const key of due) {
      const info = parseSrsKey(key);
      if (!info) continue;
      const factory = buildDueFactory(info, key, {
        level,
        today: params.srs.today,
        langPool,
        spellingPool,
        mathKinds,
      });
      if (!factory) continue;
      const subject: Subject =
        info.kind === "math"
          ? "math"
          : info.kind === "logic"
          ? "logic"
          : "language";
      const queue = queues[subject];
      if (queue.length === 0) continue; // 本卷该学科无名额 → 忽略该到期题
      queue.pop(); // 让出一个常规名额（配比总数不变）
      queue.unshift(factory); // 到期题占据该学科首个名额（优先出现）
    }
  }

  // 5. 按配比顺序组卷
  const items: DailyItem[] = [];
  for (const subject of mix) {
    const factory = queues[subject].shift();
    if (!factory) continue;
    const item = factory();
    if (item) items.push(item);
  }
  return items;
}

/** SRS 到期题重建上下文 */
type DueFactoryContext = {
  level: Level;
  today: string;
  langPool: Sentence[];
  spellingPool: SpellingWord[];
  mathKinds: MathKind[];
};

/**
 * 由题键重建一道到期题（返回工厂）。
 * - 用独立 rng（seed 含 today + 题键）→ 不打乱主出卷随机序列，且结果可复现；
 * - math/logic 按**同知识点重新生成**（防背答案，契约 §2.1）；
 * - lang/spell 需命中当前内容池，否则返回 null（该名额回退常规题）。
 */
function buildDueFactory(
  info: SrsKeyInfo,
  key: string,
  ctx: DueFactoryContext
): (() => DailyItem | null) | null {
  const dueRng = mulberry32(seedFromString(`srs_${ctx.today}_${key}`));

  switch (info.kind) {
    case "lang": {
      const s = ctx.langPool.find(
        (x) => hashKey(`${x.fr}|${x.zh}|${x.en}`) === info.id
      );
      if (!s) return null;
      const distract = ctx.langPool.filter((x) => x.zh !== s.zh);
      return () => ({
        subject: "language",
        mode: "lang",
        q: langQuestionFor(s, distract, "choice", dueRng),
      });
    }
    case "spell": {
      const w = ctx.spellingPool.find((x) => x.id === info.id);
      if (!w) return null;
      return () => ({ subject: "language", mode: "spell", word: w });
    }
    case "math": {
      if (!ctx.mathKinds.includes(info.kindName as MathKind)) return null;
      return () => ({
        subject: "math",
        mode: "math",
        q: generateMathQuestion({
          level: ctx.level,
          kind: info.kindName as MathKind,
          rng: dueRng,
          seedTag: `srs_${ctx.today}`,
          index: 0,
        }),
      });
    }
    case "logic": {
      if (!DAILY_LOGIC_KINDS.includes(info.kindName as LogicKind)) return null;
      return () => ({
        subject: "logic",
        mode: "logic",
        q: generateLogicQuestion({
          level: ctx.level,
          kind: info.kindName as LogicKind,
          rng: dueRng,
        }),
      });
    }
  }
}

/** 每题作答记录（提交时换算错题/积分） */
export type DailyAnswer = {
  /** lang：所选选项下标 */
  choice?: number | null;
  /** math：keypad/choice 的文本作答；logic：所选选项文本 */
  text?: string | null;
  /** spell：SpellingAttempt 的判定结果 */
  correct?: boolean;
};

export function isDailyCorrect(item: DailyItem, a: DailyAnswer): boolean {
  switch (item.mode) {
    case "lang":
      return a.choice !== null && a.choice !== undefined && a.choice === item.q.correctIndex;
    case "listenPick":
      return a.choice !== null && a.choice !== undefined && a.choice === item.correctIndex;
    case "math":
      return (
        a.text !== null &&
        a.text !== undefined &&
        normalizeAnswer(a.text) === normalizeAnswer(item.q.answer)
      );
    case "logic":
      // pattern/oddOne 走文本比对（classify/sort 不进每日挑战）
      return a.text != null && a.text !== "" && checkLogicAnswer(item.q, a.text);
    case "spell":
      return a.correct === true;
    case "phonics":
      // 拼读题：组合顺序是否正确由 UI（PhonicsCardView）判定后回传
      return a.correct === true;
  }
}

/**
 * DailyItem → QuizQuestion（session 存储 + 统一错题本）：
 * - 每题带 subject（错题本按题归组，混合卷不再共享 session.subject）；
 * - math：转 4 选项题并注入孩子的作答（错误答案也在选项中可见）；
 * - logic：pattern/oddOne 用其候选；其余退化单选项。
 */
export function dailyItemToQuizQuestion(
  item: DailyItem,
  a: DailyAnswer,
  rng: Rng
): QuizQuestion {
  switch (item.mode) {
    case "lang": {
      return { ...item.q, userIndex: a.choice ?? null, subject: "language" };
    }
    case "listenPick": {
      // 选项以中文标签进错题本（「你的答案/正确答案」可读），kind 标记听音选图
      const options = item.options.map((w) => w.zh);
      const choice = a.choice ?? null;
      return {
        fr: item.word.fr,
        en: item.word.en,
        zh: item.word.zh,
        options,
        correctIndex: item.correctIndex,
        userIndex: choice !== null && choice >= 0 ? choice : null,
        explanation: `听音选图：${item.word.zh}（${item.word.en} / ${item.word.fr}）`,
        mode: "listen" as QuizMode,
        subject: "language",
        kind: "listenPick",
      };
    }
    case "math": {
      return toChoiceQuizQuestion(item.q, rng, a.text ?? null);
    }
    case "logic": {
      const correct = isDailyCorrect(item, a);
      const choiceQ = logicToChoiceQuestion(item.q);
      if (choiceQ) {
        const ui =
          a.text != null
            ? choiceQ.options.findIndex((o) => o === a.text)
            : -1;
        return { ...choiceQ, userIndex: ui >= 0 ? ui : correct ? choiceQ.correctIndex : null };
      }
      return logicToQuizQuestion(item.q, correct);
    }
    case "spell": {
      const w = item.word;
      const correct = a.correct === true;
      return {
        fr: w.fr,
        en: w.en,
        zh: w.zh,
        options: [w.fr],
        correctIndex: 0,
        userIndex: correct ? 0 : null,
        explanation: `拼写：${w.zh}（${w.en}）→ ${w.fr}`,
        mode: "choice",
        subject: "language",
        kind: "spell",
      };
    }
    case "phonics": {
      const c = item.card;
      const correct = a.correct === true;
      return {
        fr: c.whole,
        en: c.whole,
        zh: c.whole,
        options: [c.parts.join("-")],
        correctIndex: 0,
        userIndex: correct ? 0 : null,
        explanation: `拼读：${c.parts.join(" - ")} → ${c.whole}`,
        mode: "choice",
        subject: "language",
        kind: "phonics",
      };
    }
  }
}
