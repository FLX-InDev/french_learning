/**
 * 每日挑战出题引擎（PRD §7.10.7，Dev-Plan T3.4）
 *
 * - 跨学科混合卷：学科配比来自 levels.ts 的 dailyMix（expandDailyMix）；
 * - 幂等：以「日期 + 学段」为种子，同一天重复进入不出新卷（PRD 验收项）；
 * - 拼词优先重现：misspelled 队列中的词（存在于当前拼词池）替换一道语言题
 *   （PRD §7.5.5「拼错的词在下一次每日挑战中优先重现」）；
 * - 语言题 choice/listen 交替；跟读题不进每日挑战（依赖 ASR，走自主测验入口）；
 * - 逻辑题取 pattern / oddOne（选项型，无需拖拽；classify/sort 属题组玩法）。
 */

import type { Rng } from "./mathGenerator";
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
import { expandDailyMix, type Level, type Subject } from "./levels";
import { stageKindsForLevel } from "./mathCurriculum";
import { matchesLevel, type AlphabetCard, type Word } from "./contentTypes";
import type { Sentence } from "./parser";
import { buildSpellingPool, type SpellingWord } from "./spelling";
import type { QuizQuestion } from "./workspace";

export type DailyItem =
  | { subject: "language"; mode: "lang"; q: QuizQuestion }
  | { subject: "language"; mode: "spell"; word: SpellingWord }
  | { subject: "math"; mode: "math"; q: MathQuestion }
  | { subject: "logic"; mode: "logic"; q: LogicQuestion };

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

/** 语言题（choice/listen 交替，选项 = 正确中文 + 3 干扰，种子化可重放） */
function generateLangQuestion(
  pool: Sentence[],
  mode: "choice" | "listen",
  rng: Rng
): QuizQuestion | null {
  if (pool.length === 0) return null;
  const s = pool[rngInt(rng, pool.length)];
  const distractPool = pool.filter((x) => x.zh !== s.zh);
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

export function generateDailyChallenge(params: {
  level: Level;
  date: string;
  pool: Sentence[];
  words: Word[];
  alphabets: AlphabetCard[];
  misspelled?: string[];
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
  for (let i = 0; i < langTotal; i++) {
    const mode = i % 2 === 0 ? "choice" : "listen";
    queues.language.push(() => {
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
  const logicKinds: LogicKind[] = ["pattern", "oddOne"];
  mix
    .filter((s) => s === "logic")
    .forEach(() => {
      queues.logic.push(() => {
        const kind = logicKinds[rngInt(rng, logicKinds.length)];
        const q = generateLogicQuestion({ level, kind, rng });
        return { subject: "logic", mode: "logic", q };
      });
    });

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
  }
}
