/**
 * 逻辑推理引擎（PRD §7.8 / §6.9，Dev-Plan T2.3）
 *
 * P0 交付四个能力域：pattern（找规律）/ classify（分类）/ sort（排序）/ oddOne（找不同）。
 * 全部纯函数 + Rng 注入（复用 mulberry32），同种子同卷；
 * 盘面合法性（答案存在且唯一）由单测锁定。
 */

import { mulberry32, seedFromString, type Rng } from "./mathGenerator";
import { generateSudoku9Emoji, SUDOKU9_EMOJIS } from "./logicPuzzles";
import { getOptionCount, type Level } from "./levels";
import type { LogicItem, Tri } from "./contentTypes";
import type { QuizQuestion } from "./workspace";

// ─── 类型 ────────────────────────────────────────────────────────

export type LogicKind = "pattern" | "classify" | "sort" | "oddOne" | "sudoku9";

export type LogicQuestion = {
  id: string;
  subject: "logic";
  level: Level;
  kind: LogicKind;
  /** 能力域（§6.9）：observe / classify / pattern / spatial / number / deduce */
  domain: string;
  source: "generated" | "fixed";
  fixedId?: string;
  stem: Tri;
  /** 标准答案（pattern=接续项；classify=分组映射 JSON；sort=正确顺序；oddOne=多余项） */
  answer: string;
  explanation?: Tri;
  payload: PatternPayload | ClassifyPayload | SortPayload | OddOnePayload | Sudoku9Payload;
};

/** 找规律：序列 + 候选（点选接续项） */
export type PatternPayload = {
  type: "pattern";
  items: string[];
  options: string[];
};

/** 分类：把 items 分入 2–3 个篮子 */
export type ClassifyPayload = {
  type: "classify";
  baskets: { id: string; label: Tri; emoji: string }[];
  items: { id: string; emoji: string; basketId: string }[];
};

/** 排序（sériation）：按 size 从小到大排列 */
export type SortPayload = {
  type: "sort";
  items: { id: string; emoji: string; size: number }[];
};

/** 找不同 / intrus：4 个中 1 个不属于 */
export type OddOnePayload = {
  type: "oddOne";
  items: string[];
  answerIndex: number;
};

/** 9 宫数独（emoji 版）：9×9 盘面 + 给定格标记 + 可选符号集 */
export type Sudoku9Payload = {
  type: "sudoku9";
  board: string[][]; // 9×9，"" = 空格
  givens: boolean[][]; // true = 给定格
  symbolSet: string[]; // 9 个可选符号
  answer: string; // 完整解（行优先拼接，判分用）
};

// ─── 分类素材（同域多篮子）───────────────────────────────────────

/** 分类素材（导出供校验脚本/单测核对类别归属） */
export const LOGIC_CATEGORIES = [
  {
    basket: { id: "fruit", label: { zh: "水果", en: "Fruits", fr: "Fruits" }, emoji: "🧺" },
    members: ["🍎", "🍌", "🍇", "🍓", "🍊", "🍉"],
  },
  {
    basket: { id: "animal", label: { zh: "动物", en: "Animals", fr: "Animaux" }, emoji: "🧺" },
    members: ["🐱", "🐶", "🐰", "🐦", "🐟", "🦊"],
  },
  {
    basket: { id: "vehicle", label: { zh: "交通工具", en: "Vehicles", fr: "Véhicules" }, emoji: "🧺" },
    members: ["🚗", "🚌", "🚂", "✈️", "🚲", "🚁"],
  },
];

const CATEGORIES = LOGIC_CATEGORIES;

const SIZES = ["🟢", "🟡", "🟠", "🔴", "🟣", "🔵"] as const;

// ─── 各 kind 生成器 ──────────────────────────────────────────────

function generatePattern(level: Level, rng: Rng): LogicQuestion {
  // 难度随学段：L1 AB → L2 AAB/ABB → L3 ABC → L4+ 数字等差数列
  let items: string[];
  let answer: string;
  const domain = "pattern";
  let numeric = false;

  if (level === "L4" || level === "L5" || level === "L6") {
    // 数字等差数列（步长 1–5，答案唯一）
    const step = 1 + Math.floor(rng() * 5);
    const start = 1 + Math.floor(rng() * 10);
    const seq = [start, start + step, start + step * 2, start + step * 3];
    answer = String(start + step * 4);
    items = [...seq.map(String), "?"];
    numeric = true;
  } else {
    const mode =
      level === "L1" ? "AB" : level === "L2" ? (rng() < 0.5 ? "AAB" : "ABB") : "ABC";
    const palette = ["🔴", "🔵", "🟡", "🟢", "🟣", "🟠"];
    const shuffledPalette = [...palette].sort(() => rng() - 0.5);
    const a = shuffledPalette[0];
    const b = shuffledPalette[1];
    const c = shuffledPalette[2];
    let core: string[];
    if (mode === "AB") core = [a, b];
    else if (mode === "AAB") core = [a, a, b];
    else if (mode === "ABB") core = [a, b, b];
    else core = [a, b, c];
    // 循环重复至 6 项后挖去最后一项
    items = [];
    while (items.length < 6) items.push(...core);
    items = items.slice(0, 6);
    answer = items[items.length - 1];
    items[items.length - 1] = "?";
  }

  const optionCount = Math.max(2, getOptionCount(level));
  let finalOptions: string[];
  if (numeric) {
    const num = Number(answer);
    const deltas = [-2, -1, 1, 2, 3].sort(() => rng() - 0.5);
    const others: string[] = [];
    for (const d of deltas) {
      const v = num + d;
      if (v > 0 && !others.includes(String(v))) others.push(String(v));
      if (others.length >= optionCount - 1) break;
    }
    finalOptions = [answer, ...others];
  } else {
    const others = ["🔴", "🔵", "🟡", "🟢", "🟣", "🟠", "⭐", "🐱", "🐶"].filter(
      (x) => x !== answer
    );
    finalOptions = [answer, ...others.sort(() => rng() - 0.5)];
  }
  finalOptions = finalOptions.slice(0, optionCount);
  if (!finalOptions.includes(answer)) finalOptions[0] = answer;

  return {
    id: `pattern_${Math.floor(rng() * 1e9)}`,
    subject: "logic",
    level,
    kind: "pattern",
    domain,
    source: "generated",
    stem: {
      zh: "找规律：? 处应该是什么？",
      en: "Find the pattern: what comes next?",
      fr: "Trouve la suite : que met-on au « ? » ?",
    },
    answer,
    payload: { type: "pattern", items, options: finalOptions },
  };
}

function generateClassify(level: Level, rng: Rng): LogicQuestion {
  const basketCount = level === "L1" ? 2 : Math.min(3, 2 + Math.floor(rng() * 2));
  const cats = [...CATEGORIES].sort(() => rng() - 0.5).slice(0, basketCount);
  const perBasket = level === "L1" ? 2 : 3;
  const items: ClassifyPayload["items"] = [];
  cats.forEach((cat, ci) => {
    const members = [...cat.members].sort(() => rng() - 0.5).slice(0, perBasket);
    members.forEach((emoji, i) => {
      items.push({ id: `it_${ci}_${i}`, emoji, basketId: cat.basket.id });
    });
  });
  // 打乱呈现顺序；答案 = 每个物品应归入的篮子（item.id → basketId）
  const shuffledItems = [...items].sort(() => rng() - 0.5);
  const correct = JSON.stringify(
    Object.fromEntries(items.map((it) => [it.id, it.basketId]))
  );

  return {
    id: `classify_${Math.floor(rng() * 1e9)}`,
    subject: "logic",
    level,
    kind: "classify",
    domain: "classify",
    source: "generated",
    stem: {
      zh: "把东西分到对应的篮子里",
      en: "Put each thing into the right basket",
      fr: "Range chaque chose dans le bon panier",
    },
    answer: correct,
    payload: {
      type: "classify",
      baskets: cats.map((c) => c.basket),
      items: shuffledItems,
    },
  };
}

function generateSort(level: Level, rng: Rng): LogicQuestion {
  const n = level === "L1" ? 3 : level === "L2" ? 4 : 5;
  const items: SortPayload["items"] = [];
  const sizes = [...Array(n)].map((_, i) => i + 1);
  // 呈现顺序打乱（答案 = 按 size 升序）
  const order = [...sizes].sort(() => rng() - 0.5);
  order.forEach((size, i) => {
    items.push({
      id: `s_${i}`,
      emoji: SIZES[(i + Math.floor(rng() * 6)) % SIZES.length],
      size,
    });
  });
  const correct = JSON.stringify(
    [...items].sort((x, y) => x.size - y.size).map((it) => it.id)
  );
  return {
    id: `sort_${Math.floor(rng() * 1e9)}`,
    subject: "logic",
    level,
    kind: "sort",
    domain: "classify",
    source: "generated",
    stem: {
      zh: "按从小到大的顺序排一排",
      en: "Sort them from smallest to biggest",
      fr: "Range du plus petit au plus grand",
    },
    answer: correct,
    payload: { type: "sort", items },
  };
}

function generateOddOne(level: Level, rng: Rng): LogicQuestion {
  void level;
  const cat = CATEGORIES[Math.floor(rng() * CATEGORIES.length)];
  const members = [...cat.members].sort(() => rng() - 0.5).slice(0, 3);
  const others = CATEGORIES.filter((c) => c !== cat);
  const intruder = others[Math.floor(rng() * others.length)].members[
    Math.floor(rng() * 6)
  ];
  const items = [...members, intruder].sort(() => rng() - 0.5);
  const answerIndex = items.indexOf(intruder);
  return {
    id: `oddOne_${Math.floor(rng() * 1e9)}`,
    subject: "logic",
    level,
    kind: "oddOne",
    domain: "observe",
    source: "generated",
    stem: {
      zh: "哪一个和其他的不一样？",
      en: "Which one does not belong?",
      fr: "Lequel n'est pas comme les autres ?",
    },
    answer: intruder,
    payload: { type: "oddOne", items, answerIndex },
  };
}

/** 9 宫数独（emoji 版）：L6 专属 */
function generateSudoku9(level: Level, rng: Rng): LogicQuestion {
  const { puzzle, solution, givens } = generateSudoku9Emoji(rng);
  return {
    id: `sudoku9_${Math.floor(rng() * 1e9)}`,
    subject: "logic",
    level,
    kind: "sudoku9",
    domain: "number",
    source: "generated",
    stem: {
      zh: "在空格里填上水果，让每行、每列、每个九宫格都各有一种水果",
      en: "Fill each empty cell so every row, column, and 3×3 box has each fruit once",
      fr: "Place un fruit dans chaque case vide : chaque ligne, colonne et carré de 9 doit contenir chaque fruit une fois",
    },
    answer: solution.map((r) => r.join("")).join(""),
    payload: {
      type: "sudoku9",
      board: puzzle,
      givens,
      symbolSet: SUDOKU9_EMOJIS.slice() as string[],
      answer: solution.map((r) => r.join("")).join(""),
    },
  };
}

// ─── dispatcher / 成卷 ───────────────────────────────────────────

export function generateLogicQuestion(params: {
  level: Level;
  kind: LogicKind;
  rng: Rng;
}): LogicQuestion {
  switch (params.kind) {
    case "pattern":
      return generatePattern(params.level, params.rng);
    case "classify":
      return generateClassify(params.level, params.rng);
    case "sort":
      return generateSort(params.level, params.rng);
    case "oddOne":
      return generateOddOne(params.level, params.rng);
    case "sudoku9":
      return generateSudoku9(params.level, params.rng);
  }
}

/** 生成一组逻辑题（同 seed 同组）；默认每组 5 题 */
export function generateLogicQuiz(params: {
  level: Level;
  kinds: LogicKind[];
  count?: number;
  seed: string;
  fixedItems?: LogicItem[];
}): LogicQuestion[] {
  const count = params.count ?? 5;
  const rng: Rng = mulberry32(seedFromString(params.seed));
  const out: LogicQuestion[] = [];

  for (const item of (params.fixedItems ?? []).slice(0, count)) {
    out.push(logicQuestionFromFixedItem(item, params.level));
  }

  let i = 0;
  let guard = 0;
  while (out.length < count && guard < count * 10) {
    guard++;
    const kind = params.kinds[i % params.kinds.length];
    const q = generateLogicQuestion({ level: params.level, kind, rng });
    if (out.some((x) => x.kind === q.kind && x.answer === q.answer)) continue;
    out.push(q);
    i++;
  }
  return out.slice(0, count);
}

/** logic-bank.md 固定题 → LogicQuestion（同管线渲染） */
export function logicQuestionFromFixedItem(
  item: LogicItem,
  level?: Level
): LogicQuestion {
  const kind = (item.kind as LogicKind) || "oddOne";
  const payload = buildFixedPayload(kind, item);
  return {
    id: `fixed_${item.id}`,
    subject: "logic",
    level: level ?? item.level ?? "L3",
    kind,
    domain: item.domain || "observe",
    source: "fixed",
    fixedId: item.id,
    stem: item.stem,
    answer: item.answer,
    explanation: item.explanation,
    payload,
  };
}

function buildFixedPayload(kind: LogicKind, item: LogicItem): LogicQuestion["payload"] {
  if (kind === "pattern") {
    return {
      type: "pattern",
      items: ["?", "?"],
      options: [item.answer, "🔴", "🔵", "🟡", "🟢"].slice(0, 4),
    };
  }
  if (kind === "classify") {
    return {
      type: "classify",
      baskets: [
        { id: "a", label: { zh: item.answer, en: item.answer, fr: item.answer }, emoji: "🧺" },
      ],
      items: [],
    };
  }
  if (kind === "sort") {
    return { type: "sort", items: [] };
  }
  // oddOne 及其它：默认展示 4 个候选（从 clue/stem 提取的简单回退）
  return {
    type: "oddOne",
    items: [item.answer, item.answer, item.answer, item.answer],
    answerIndex: 0,
  };
}

// ─── 判分 ────────────────────────────────────────────────────────

/**
 * 校验逻辑题作答：
 * - pattern / oddOne：比较字符串；
 * - sort：比较 id 顺序 JSON；
 * - classify：比较 basketId 映射 JSON（与答案同构）。
 */
export function checkLogicAnswer(q: LogicQuestion, userAnswer: string): boolean {
  if (q.kind === "classify") {
    try {
      const user = JSON.parse(userAnswer) as Record<string, string>;
      const expected = JSON.parse(q.answer) as Record<string, string> | string[];
      const payload = q.payload as ClassifyPayload;
      const expectedMap: Record<string, string> = {};
      if (Array.isArray(expected)) {
        payload.items.forEach((it, i) => {
          expectedMap[it.id] = expected[i] ?? "";
        });
      } else {
        Object.assign(expectedMap, expected);
      }
      return payload.items.every((it) => user[it.id] === expectedMap[it.id]);
    } catch {
      return false;
    }
  }
  if (q.kind === "sort") {
    try {
      const user = JSON.parse(userAnswer) as string[];
      const expected = JSON.parse(q.answer) as string[];
      return (
        user.length === expected.length && user.every((id, i) => id === expected[i])
      );
    } catch {
      return false;
    }
  }
  if (q.kind === "sudoku9") {
    // 用户答案 = 行优先拼接的 81 字符字符串（与 q.answer 同构）
    return userAnswer === q.answer;
  }
  return userAnswer === q.answer;
}

/** LogicQuestion → QuizQuestion（进统一错题本，T2.5；Phase 3 回填 kind + subject） */
export function toQuizQuestion(
  lq: LogicQuestion,
  correct: boolean
): QuizQuestion {
  return {
    fr: lq.stem.fr,
    en: lq.stem.en,
    zh: lq.stem.zh,
    options: [lq.answer],
    correctIndex: 0,
    userIndex: correct ? 0 : null,
    explanation: lq.stem.zh,
    mode: "choice",
    subject: "logic",
    kind: lq.kind,
  };
}

/**
 * 选项型逻辑题 → 4 选项 QuizQuestion（Phase 3 每日挑战 / 错题复习用）。
 * 仅 pattern / oddOne 天然带候选；classify / sort 需要拖拽交互，返回 null
 * （调用方回退到 toQuizQuestion 的单选项重放）。
 */
export function logicToChoiceQuestion(
  lq: LogicQuestion
): QuizQuestion | null {
  if (lq.kind === "pattern") {
    const p = lq.payload as PatternPayload;
    if (!p.options || p.options.length === 0) return null;
    const correctIndex = Math.max(
      0,
      p.options.findIndex((o) => o === lq.answer)
    );
    return {
      fr: lq.stem.fr,
      en: lq.stem.en,
      zh: lq.stem.zh,
      options: p.options,
      correctIndex,
      userIndex: null,
      explanation: lq.stem.zh,
      mode: "choice",
      subject: "logic",
      kind: lq.kind,
    };
  }
  if (lq.kind === "oddOne") {
    const p = lq.payload as OddOnePayload;
    if (!p.items || p.items.length === 0) return null;
    return {
      fr: lq.stem.fr,
      en: lq.stem.en,
      zh: lq.stem.zh,
      options: p.items,
      correctIndex: Math.max(0, p.answerIndex),
      userIndex: null,
      explanation: lq.stem.zh,
      mode: "choice",
      subject: "logic",
      kind: lq.kind,
    };
  }
  // sudoku9：整盘作答，无候选选项 → null（调用方回退到单选项重放）
  return null;
}
