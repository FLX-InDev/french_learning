/**
 * 数学生成器内核（PRD §9.5 / §7.7，Dev-Plan T2.1）
 *
 * 全部为纯函数：输入 { level, kind, rng } → 输出 MathQuestion，
 * 同种子同卷（Rng 用 mulberry32，seed 可来自日期/关卡 id，支持重放）。
 * 各 kind 的硬约束见 §9.5 表，由 lib/mathGenerator.test.ts 逐条锁定。
 */

import type { Tri } from "./contentTypes";
import { getOptionCount, type Level } from "./levels";
import type { MathItem } from "./contentTypes";
import type { QuizQuestion } from "./workspace";

// ─── 类型 ────────────────────────────────────────────────────────

export type Rng = () => number;

export type MathKind =
  | "count"
  | "countWrite"
  | "compare"
  | "add"
  | "sub"
  | "addCarry"
  | "subBorrow"
  | "placeValue"
  | "sequence"
  | "clock"
  | "money"
  | "wordProblem"
  | "mul"
  | "lengthUnit"
  | "massUnit"
  | "axisSymmetry";

export type CountVisual = { emoji: string; count: number };
export type CompareVisual = {
  left: { emoji: string; count: number };
  right: { emoji: string; count: number };
};
export type ArithVisual = {
  a: number;
  b: number;
  op: "+" | "-";
  decomposition?: { label: Tri; text: string }[];
};
export type PlaceValueVisual = { tens: number; ones: number; hundreds?: number };
export type SequenceVisual = { items: (number | "?")[]; step: number };
export type ClockVisual = { hour: number; minute: 0 | 15 | 30 | 45 };
export type MoneyVisual = {
  mode: "count" | "pay";
  currency: "CNY" | "EUR";
  notes: number[];
  price?: number;
};
export type WordProblemVisual = {
  emoji: string;
  a: number;
  b: number;
  op: "+" | "-" | "×";
};

export type LengthUnitVisual = {
  type: "length";
  value: number;
  fromUnit: "km" | "m" | "cm" | "mm";
  toUnit: "km" | "m" | "cm" | "mm";
};

export type MassUnitVisual = {
  type: "mass";
  value: number;
  fromUnit: "t" | "kg" | "g" | "mg";
  toUnit: "t" | "kg" | "g" | "mg";
};

export type AxisSymmetryVisual = {
  type: "symmetry";
  shape: string;
  hasAxis: boolean;
};

export type MathVisual =
  | CountVisual
  | CompareVisual
  | ArithVisual
  | PlaceValueVisual
  | SequenceVisual
  | ClockVisual
  | MoneyVisual
  | WordProblemVisual
  | LengthUnitVisual
  | MassUnitVisual
  | AxisSymmetryVisual;

export type MathQuestion = {
  id: string; // `${kind}_${seed}_${index}`，同种子同卷（确定性）
  subject: "math";
  level: Level;
  kind: MathKind;
  source: "generated" | "fixed";
  fixedId?: string; // source = "fixed" 时指向 math-bank.md 条目 id
  prompt: Tri;
  /** 判等前规范化；数字 / ">"|"<"|"=" / "h:mm" 统一字符串 */
  answer: string;
  unit?: string; // 计量单位，仅展示
  image?: string; // 预留 emoji / 图片路径
  inputMode: "keypad" | "choice";
  options?: string[]; // inputMode = "choice" 时必填
  explanation?: Tri;
  /** 固定题没有程序化 visual，可缺省（按题干文本渲染） */
  visual?: MathVisual;
};

// ─── 随机源 ──────────────────────────────────────────────────────

/** mulberry32：可注入伪随机源，保证同种子同卷 */
export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串种子（日期 / 关卡 id）→ 32 位种子 */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffled<T>(rng: Rng, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── 学段数值范围（PRD §9.5 硬约束）─────────────────────────────

/** add/sub 上限：L1 5 内不进退位 → L3 10 内 → L4 20 内 → L5 100 内口算 */
const ARITH_MAX: Record<Level, number> = {
  L1: 5,
  L2: 10,
  L3: 10,
  L4: 20,
  L5: 100,
  L6: 100,
};

/** count/countWrite：L1 1–5；L2 1–10；L3 1–20 */
const COUNT_MAX: Record<Level, number> = {
  L1: 5,
  L2: 10,
  L3: 20,
  L4: 20,
  L5: 20,
  L6: 20,
};

/** compare：L1 5 以内；L2 10 以内；L3 20 以内 */
const COMPARE_MAX: Record<Level, number> = {
  L1: 5,
  L2: 10,
  L3: 20,
  L4: 20,
  L5: 20,
  L6: 20,
};

const EMOJI_POOL = ["🍎", "🐦", "🐟", "🌸", "⭐", "🎈", "🍪", "🐞"] as const;

// ─── choice 干扰项（复用 workspace 数值邻近策略）─────────────────

function numericOptions(
  level: Level,
  answer: number,
  rng: Rng
): { options: string[]; correctIndex: number } {
  const n = getOptionCount(level);
  const set = new Set<number>([answer]);
  const deltas = shuffled(rng, [-2, -1, 1, 2, 3]);
  for (const d of deltas) {
    if (set.size >= n) break;
    const v = answer + d;
    if (v >= 0 && !set.has(v)) set.add(v);
  }
  let filler = answer + deltas.length + 1;
  while (set.size < n) set.add(filler++);
  const options = shuffled(rng, Array.from(set).map(String));
  return { options, correctIndex: options.indexOf(String(answer)) };
}

/** 选项不足 optionCount 时用占位符补齐（极端小池场景） */
function padOptions(options: string[], level: Level): string[] {
  const n = getOptionCount(level);
  const out = options.slice();
  while (out.length < n) out.push("—");
  return out;
}
void padOptions;

// ─── 各 kind 生成器（独立纯函数，便于逐条断言硬约束）────────────

function generateCount(level: Level, rng: Rng): CountVisual {
  const max = COUNT_MAX[level];
  return { emoji: pick(rng, EMOJI_POOL), count: randInt(rng, 1, max) };
}

function arithPair(
  level: Level,
  rng: Rng,
  op: "+" | "-",
  opts?: { carry?: boolean; borrow?: boolean }
): { a: number; b: number } {
  const max = ARITH_MAX[level];

  if (opts?.carry) {
    // addCarry：必进位（个位和 ≥ 10）且总和 ≤ 20（L4）
    const a = randInt(rng, 2, 9);
    const minB = Math.max(10 - a, 2);
    const b = randInt(rng, minB, Math.min(20 - a, 9));
    return { a, b };
  }

  if (opts?.borrow) {
    // subBorrow：被减数个位 < 减数个位，差 ≥ 0（L4）
    const onesA = randInt(rng, 1, 9);
    const b = randInt(rng, onesA + 1, 9);
    const a = 10 + onesA; // 11–19，个位必然小于 b
    return { a, b };
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    if (op === "-") {
      const a = randInt(rng, 1, max);
      const b = randInt(rng, 1, a); // b ≤ a → 差 ≥ 0
      return { a, b };
    }
    const a = randInt(rng, 0, max);
    const b = randInt(rng, 0, max - a); // 保证 a + b ≤ max（不进位到上学段范围）
    return { a, b };
  }
  return op === "-" ? { a: 4, b: 2 } : { a: 2, b: 3 };
}

function decompositionFor(a: number, b: number, op: "+" | "-") {
  if (op === "+") {
    // 凑十法：8 + 5 → 8 + 2 = 10 → 10 + 3 = 13
    const toTen = 10 - a;
    const rest = b - toTen;
    return [
      {
        label: { zh: "先凑十", en: "Make a ten", fr: "Faire une dizaine" } as Tri,
        text: `${a} + ${toTen} = 10`,
      },
      {
        label: { zh: "再加剩下的", en: "Add the rest", fr: "Ajouter le reste" } as Tri,
        text: `10 + ${rest} = ${10 + rest}`,
      },
    ];
  }
  // 破十法：13 − 5 → 13 = 10 + 3 → 10 − 5 = 5 → 5 + 3 = 8
  const ones = a % 10;
  return [
    {
      label: { zh: "先破十", en: "Split into ten", fr: "Défaire la dizaine" } as Tri,
      text: `${a} = 10 + ${ones}`,
    },
    {
      label: { zh: "十减减数", en: "Subtract from ten", fr: "10 moins" } as Tri,
      text: `10 - ${b} = ${10 - b}`,
    },
    {
      label: { zh: "再加个位", en: "Add the ones", fr: "Ajouter les unités" } as Tri,
      text: `${10 - b} + ${ones} = ${10 - b + ones}`,
    },
  ];
}

function timeStr(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

// ─── 统一 dispatcher ────────────────────────────────────────────

export type GenerateMathParams = {
  level: Level;
  kind: MathKind;
  rng: Rng;
  /** mul 口诀限定模式：固定乘数（如「6 的口诀」b = 6） */
  fixedFactor?: number;
  /** 题目 id 的 seed 段（默认用随机数，成卷时由 seed 字符串驱动） */
  seedTag?: string;
  index?: number;
};

export function generateMathQuestion(params: GenerateMathParams): MathQuestion {
  const { level, kind, rng } = params;
  const index = params.index ?? 0;
  const seedTag = params.seedTag ?? String(randInt(rng, 0, 1e9));
  const id = `${kind}_${seedTag}_${index}`;
  const optionCount = getOptionCount(level);
  const choiceMode = level === "L1" || level === "L2";

  // MathQuestion 不含 correctIndex（判等走 answer 字符串规范化比对），
  // choice 题保证 options 中含正确答案；渲染层比对 options[i] 与 answer。
  const mk = (
    prompt: Tri,
    answer: string,
    visual: MathVisual,
    extra?: Partial<MathQuestion>
  ): MathQuestion => {
    const q: MathQuestion = {
      id,
      subject: "math",
      level,
      kind,
      source: "generated",
      prompt,
      answer,
      visual,
      inputMode: choiceMode ? "choice" : "keypad",
      ...extra,
    };
    if (q.inputMode === "choice" && !Number.isNaN(Number(answer))) {
      q.options = numericOptions(level, Number(answer), rng).options;
    }
    return q;
  };

  switch (kind) {
    case "count":
    case "countWrite": {
      const visual = generateCount(level, rng);
      const prompt: Tri =
        kind === "count"
          ? {
              zh: "数一数，有几个？",
              en: "Count them. How many?",
              fr: "Compte. Combien il y en a ?",
            }
          : {
              zh: "看图写数",
              en: "Look and write the number",
              fr: "Regarde et écris le nombre",
            };
      return mk(prompt, String(visual.count), visual, { unit: "个" });
    }

    case "compare": {
      const max = COMPARE_MAX[level];
      const left = randInt(rng, 0, max);
      let right = randInt(rng, 0, max);
      if (left === right) right = (right + 1) % (max + 1);
      const answer = left > right ? ">" : left < right ? "<" : "=";
      const emoji = pick(rng, EMOJI_POOL);
      const visual: CompareVisual = {
        left: { emoji, count: left },
        right: { emoji, count: right },
      };
      const symbols = [">", "<", "="];
      const others = shuffled(rng, symbols.filter((s) => s !== answer));
      const opts = shuffled(
        rng,
        [answer, ...others.slice(0, Math.max(1, optionCount - 1))]
      );
      return {
        id,
        subject: "math",
        level,
        kind,
        source: "generated",
        prompt: {
          zh: "哪边多？填上 >、< 或 =",
          en: "Which side has more? Use >, < or =",
          fr: "Quel côté a le plus ? Mets >, < ou =",
        },
        answer,
        visual,
        inputMode: "choice", // 符号无法用数字键盘输入
        options: opts.slice(0, optionCount),
      };
    }

    case "add":
    case "sub": {
      const op: "+" | "-" = kind === "add" ? "+" : "-";
      const { a, b } = arithPair(level, rng, op);
      const answer = op === "+" ? a + b : a - b;
      const visual: ArithVisual = { a, b, op };
      return mk(
        { zh: `${a} ${op} ${b} = ?`, en: `${a} ${op} ${b} = ?`, fr: `${a} ${op} ${b} = ?` },
        String(answer),
        visual
      );
    }

    case "addCarry": {
      const { a, b } = arithPair(level, rng, "+", { carry: true });
      const visual: ArithVisual = {
        a,
        b,
        op: "+",
        decomposition: decompositionFor(a, b, "+"),
      };
      return mk(
        { zh: `${a} + ${b} = ?（用凑十法）`, en: `${a} + ${b} = ? (make a ten)`, fr: `${a} + ${b} = ? (dizaine)` },
        String(a + b),
        visual
      );
    }

    case "subBorrow": {
      const { a, b } = arithPair(level, rng, "-", { borrow: true });
      const visual: ArithVisual = {
        a,
        b,
        op: "-",
        decomposition: decompositionFor(a, b, "-"),
      };
      return mk(
        { zh: `${a} - ${b} = ?（用破十法）`, en: `${a} - ${b} = ? (split the ten)`, fr: `${a} - ${b} = ? (dizaine)` },
        String(a - b),
        visual
      );
    }

    case "placeValue": {
      const three = level === "L5" || level === "L6";
      const hundreds = three ? randInt(rng, 1, 9) : undefined;
      const tens = randInt(rng, 0, 9);
      const ones = randInt(rng, 0, 9);
      const value = three
        ? (hundreds as number) * 100 + tens * 10 + ones
        : tens * 10 + ones;
      const visual: PlaceValueVisual = { tens, ones, hundreds };
      return mk(
        {
          zh: "方块表示的数是多少？",
          en: "What number do the blocks show?",
          fr: "Quel nombre montrent les blocs ?",
        },
        String(value),
        visual
      );
    }

    case "sequence": {
      const maxStart = level === "L2" ? 4 : level === "L3" ? 10 : 60;
      const step = randInt(rng, 1, 5);
      const start = randInt(rng, 1, maxStart);
      const items: (number | "?")[] = [
        start,
        start + step,
        start + step * 2,
        "?",
        start + step * 4,
      ];
      const answer = start + step * 3;
      const visual: SequenceVisual = { items, step };
      return mk(
        {
          zh: "找规律，? 处填几？",
          en: "Find the pattern. What goes in place of ?",
          fr: "Trouve la suite. Que met-on à la place du ?",
        },
        String(answer),
        visual
      );
    }

    case "clock": {
      const hour = randInt(rng, 1, 12);
      const minutePool: (0 | 15 | 30 | 45)[] =
        level === "L3" ? [0] : level === "L4" ? [0, 30] : [0, 15, 30, 45];
      const minute = pick(rng, minutePool);
      const visual: ClockVisual = { hour, minute };
      const answer = timeStr(hour, minute);
      const others = shuffled(
        rng,
        [
          timeStr(((hour % 12) + 1) as number, minute),
          timeStr(hour, minute === 30 ? 0 : 30),
          timeStr(((hour + 1) % 12) + 1, minute === 0 ? 30 : 0),
        ]
      );
      const opts = shuffled(rng, [answer, ...others.slice(0, Math.max(1, optionCount - 1))]);
      return {
        id,
        subject: "math",
        level,
        kind,
        source: "generated",
        prompt: {
          zh: "钟面上是几点？",
          en: "What time is it?",
          fr: "Il est quelle heure ?",
        },
        answer,
        visual,
        inputMode: "choice",
        options: opts.slice(0, optionCount),
      };
    }

    case "money": {
      const currency: "CNY" | "EUR" = level === "L3" ? "CNY" : rng() < 0.7 ? "CNY" : "EUR";
      const notePool =
        currency === "CNY"
          ? level === "L3"
            ? [1, 5, 10]
            : [1, 5, 10, 20, 50]
          : [1, 2, 5, 10, 20];
      const notes: number[] = [];
      const n = randInt(rng, 1, level === "L3" ? 3 : 4);
      for (let i = 0; i < n; i++) notes.push(pick(rng, notePool));
      const total = notes.reduce((s, v) => s + v, 0);
      const visual: MoneyVisual = { mode: "count", currency, notes };
      return mk(
        {
          zh: "这些钱一共是多少元？",
          en: "How much money in total?",
          fr: "Combien d'argent en tout ?",
        },
        String(total),
        visual,
        { unit: currency === "CNY" ? "元" : "欧元" }
      );
    }

    case "wordProblem": {
      const scenes = [
        { emoji: "🐦", zh: "只小鸟", en: "birds", fr: "oiseaux", measure: "只" },
        { emoji: "🍎", zh: "个苹果", en: "apples", fr: "pommes", measure: "个" },
        { emoji: "🐟", zh: "条小鱼", en: "fish", fr: "poissons", measure: "条" },
      ] as const;
      const scene = pick(rng, scenes);
      const op: "+" | "-" = rng() < 0.5 ? "+" : "-";
      const { a, b } = arithPair(level, rng, op);
      const answer = op === "+" ? a + b : a - b;
      const prompt: Tri =
        op === "+"
          ? {
              zh: `树上有 ${a} ${scene.zh}，又飞来 ${b} ${scene.zh}，一共几 ${scene.measure}？`,
              en: `There are ${a} ${scene.en}, ${b} more come. How many in total?`,
              fr: `Il y a ${a} ${scene.fr}, ${b} arrivent. Combien en tout ?`,
            }
          : {
              zh: `一共有 ${a} ${scene.zh}，走了 ${b} ${scene.zh}，还剩几 ${scene.measure}？`,
              en: `There are ${a} ${scene.en}, ${b} leave. How many are left?`,
              fr: `Il y a ${a} ${scene.fr}, ${b} partent. Combien en reste-t-il ?`,
            };
      const visual: WordProblemVisual = { emoji: scene.emoji, a, b, op };
      return mk(prompt, String(answer), visual, {
        image: scene.emoji,
        unit: scene.measure,
      });
    }

    case "mul": {
      const b = params.fixedFactor ?? randInt(rng, 1, 9);
      const a = randInt(rng, 1, 9);
      const answer = a * b;
      const visual: WordProblemVisual = { emoji: "✖️", a, b, op: "×" };
      return mk(
        { zh: `${a} × ${b} = ?`, en: `${a} × ${b} = ?`, fr: `${a} × ${b} = ?` },
        String(answer),
        visual
      );
    }

    case "lengthUnit": {
      const conversions = [
        { from: "km" as const, to: "m" as const, rate: 1000, maxVal: 99 },
        { from: "m" as const, to: "cm" as const, rate: 100, maxVal: 99 },
        { from: "cm" as const, to: "mm" as const, rate: 10, maxVal: 99 },
        { from: "m" as const, to: "mm" as const, rate: 1000, maxVal: 9 },
      ];
      const conv = pick(rng, conversions);
      const value = randInt(rng, 1, conv.maxVal);
      const result = value * conv.rate;
      const visual: LengthUnitVisual = { type: "length", value, fromUnit: conv.from, toUnit: conv.to };
      return mk(
        {
          zh: `${value} ${conv.from} = ? ${conv.to}`,
          en: `${value} ${conv.from} = ? ${conv.to}`,
          fr: `${value} ${conv.from} = ? ${conv.to}`,
        },
        String(result),
        visual,
        { unit: conv.to }
      );
    }

    case "massUnit": {
      const conversions: Array<{ from: "t" | "kg" | "g"; to: "t" | "kg" | "g" | "mg"; rate: number; maxVal: number }> = [
        { from: "t", to: "kg", rate: 1000, maxVal: 99 },
        { from: "kg", to: "g", rate: 1000, maxVal: 99 },
        { from: "g", to: "mg", rate: 1000, maxVal: 99 },
      ];
      const conv = pick(rng, conversions);
      const value = randInt(rng, 1, conv.maxVal);
      const result = value * conv.rate;
      const visual: MassUnitVisual = { type: "mass", value, fromUnit: conv.from, toUnit: conv.to };
      return mk(
        {
          zh: `${value} ${conv.from} = ? ${conv.to}`,
          en: `${value} ${conv.from} = ? ${conv.to}`,
          fr: `${value} ${conv.from} = ? ${conv.to}`,
        },
        String(result),
        visual,
        { unit: conv.to }
      );
    }

    case "axisSymmetry": {
      const symShapes = [
        { shape: "⊞", hasAxis: true, name: "正方形" },
        { shape: "▬", hasAxis: true, name: "长方形" },
        { shape: "●", hasAxis: true, name: "圆" },
        { shape: "△", hasAxis: true, name: "等腰三角形" },
        { shape: "◇", hasAxis: true, name: "菱形" },
        { shape: "⧄", hasAxis: false, name: "平行四边形" },
        { shape: "⏛", hasAxis: false, name: "梯形" },
      ] as const;
      const { shape, hasAxis } = pick(rng, symShapes);
      const answer = hasAxis ? "是" : "不是";
      const visual: AxisSymmetryVisual = { type: "symmetry", shape, hasAxis };
      const opts = shuffled(rng, ["是", "不是"]);
      return {
        id,
        subject: "math",
        level,
        kind,
        source: "generated",
        prompt: {
          zh: `「${shape}」是轴对称图形吗？`,
          en: `Is "${shape}" an axis-symmetric shape?`,
          fr: `La forme "${shape}" est-elle symétrique ?`,
        },
        answer,
        visual,
        inputMode: "choice",
        options: opts.slice(0, optionCount),
      };
    }

    default: {
      const _never: never = kind;
      void _never;
      throw new Error(`Unknown math kind: ${kind}`);
    }
  }
}

// ─── 成卷 ────────────────────────────────────────────────────────

/**
 * 生成一卷题目（同 seed 同卷）：
 * - 同卷内禁止连续出现相同 (a, b)（§9.5）；
 * - 可混入固定题（source: "fixed"，优先放前面）。
 */
export function generateMathQuiz(params: {
  level: Level;
  kind: MathKind;
  count: number;
  seed: string;
  fixedFactor?: number;
  fixedItems?: MathItem[];
}): MathQuestion[] {
  const { level, kind, count, seed } = params;
  const rng = mulberry32(seedFromString(seed));
  const out: MathQuestion[] = [];

  const fixed = (params.fixedItems ?? []).filter(
    (it) => it.kind === kind || kind === "add" // 兜底：add 关卡可混入任意固定题
  );
  for (const item of fixed.slice(0, count)) {
    out.push(mathQuestionFromFixedItem(item, level));
  }

  let prevPair = "";
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard++;
    const q = generateMathQuestion({
      level,
      kind,
      rng,
      fixedFactor: params.fixedFactor,
      seedTag: seed,
      index: out.length,
    });
    const pair = arithKey(q);
    if (pair && pair === prevPair) continue; // 禁止连续重复
    prevPair = pair ?? prevPair;
    out.push(q);
  }
  return out.slice(0, count);
}

function arithKey(q: MathQuestion): string | null {
  const v = q.visual as ArithVisual | undefined;
  if (v && typeof v.a === "number" && typeof v.b === "number") {
    return `${q.kind}:${v.a},${v.b}`;
  }
  return null;
}

/** math-bank.md 固定题 → source:"fixed" 的 MathQuestion（同管线渲染） */
export function mathQuestionFromFixedItem(
  item: MathItem,
  level?: Level
): MathQuestion {
  const answer = item.answerTri?.zh ?? item.answer;
  const kind = (item.kind as MathKind) || "wordProblem";
  return {
    id: `fixed_${item.id}`,
    subject: "math",
    level: level ?? item.level ?? "L3",
    kind,
    source: "fixed",
    fixedId: item.id,
    prompt: item.prompt,
    answer,
    image: item.answerTri?.zh,
    inputMode: "keypad",
    explanation: item.explanation,
  };
}

// ─── 与统一错题本对接（T2.5）────────────────────────────────────

/**
 * MathQuestion → QuizQuestion：
 * 数学题进入统一错题本时复用 StudySession 机制——
 * choice 题保留 options/correctIndex；keypad 题退化为单选项，
 * 答对记 userIndex=0，答错记 null（不会误入错题本）。
 * Phase 3：回填 kind（同知识点重生成）与 subject（错题精准归组）。
 */
export function toQuizQuestion(
  mq: MathQuestion,
  answered: { userAnswer: string | null }
): QuizQuestion {
  const isChoice = mq.inputMode === "choice" && !!mq.options?.length;
  if (isChoice) {
    const options = mq.options as string[];
    const correctIndex = options.findIndex(
      (o) => normalizeAnswer(o) === normalizeAnswer(mq.answer)
    );
    const answeredIndex =
      answered.userAnswer === null
        ? null
        : options.findIndex(
            (o) =>
              normalizeAnswer(o) === normalizeAnswer(answered.userAnswer as string)
          );
    return {
      fr: mq.prompt.fr,
      en: mq.prompt.en,
      zh: mq.prompt.zh,
      options,
      correctIndex: Math.max(0, correctIndex),
      userIndex: answeredIndex !== null && answeredIndex >= 0 ? answeredIndex : null,
      explanation: `${mq.prompt.fr} = ${mq.answer}`,
      mode: "choice",
      subject: "math",
      kind: mq.kind,
    };
  }
  const correct =
    answered.userAnswer !== null &&
    normalizeAnswer(answered.userAnswer) === normalizeAnswer(mq.answer);
  return {
    fr: mq.prompt.fr,
    en: mq.prompt.en,
    zh: mq.prompt.zh,
    options: [mq.answer],
    correctIndex: 0,
    userIndex: correct ? 0 : null,
    explanation: `${mq.prompt.fr} = ${mq.answer}`,
    mode: "choice",
    subject: "math",
    kind: mq.kind,
  };
}

function seededShuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * MathQuestion → 4 选项选择题（Phase 3 错题复习/每日挑战用）：
 * keypad 题在弹窗里没有键盘，转为 4 选 1——干扰项按答案类型生成
 * （数值 ±1–10 / 比较符号 / 相邻整点）；非数值答案退化为单选项。
 * userAnswer（孩子的错误作答）会注入选项并在结果中定位 userIndex，
 * 保证错题本能显示「你的答案 / 正确答案」。
 */
export function toChoiceQuizQuestion(
  mq: MathQuestion,
  rng: Rng,
  userAnswer?: string | null
): QuizQuestion {
  const ans = mq.answer;
  let options: string[];
  let userIndex: number | null = null;
  if (ans === ">" || ans === "<" || ans === "=") {
    options = seededShuffle([">", "<", "="], rng);
  } else if (/^\d+$/.test(ans)) {
    const n = parseInt(ans, 10);
    const set = new Set<string>([ans]);
    const ua =
      userAnswer && userAnswer.trim() !== "" && /^\d+$/.test(userAnswer.trim())
        ? String(parseInt(userAnswer.trim(), 10))
        : null;
    if (ua) set.add(ua);
    let guard = 0;
    while (set.size < 4 && guard < 80) {
      guard++;
      const delta = 1 + Math.floor(rng() * 10);
      const cand = rng() < 0.5 ? n - delta : n + delta;
      if (cand >= 0) set.add(String(cand));
    }
    let pad = 1;
    while (set.size < 4) set.add(String(n + pad++));
    options = seededShuffle(Array.from(set), rng);
  } else if (/^\d{1,2}:\d{2}$/.test(ans)) {
    const parts = ans.split(":");
    const m = parts[1];
    const h = parseInt(parts[0], 10);
    const hours = new Set<string>([String(h)]);
    let step = 1;
    while (hours.size < 4 && step <= 6) {
      hours.add(String((h + step) % 24));
      if (h - step >= 0) hours.add(String(h - step));
      step++;
    }
    options = seededShuffle(
      Array.from(hours).map((x) => `${x}:${m}`),
      rng
    );
  } else {
    options = [ans];
  }
  const correctIndex = Math.max(
    0,
    options.findIndex((o) => normalizeAnswer(o) === normalizeAnswer(ans))
  );
  if (userAnswer) {
    const idx = options.findIndex(
      (o) => normalizeAnswer(o) === normalizeAnswer(userAnswer)
    );
    userIndex = idx >= 0 ? idx : null;
  }
  return {
    fr: mq.prompt.fr,
    en: mq.prompt.en,
    zh: mq.prompt.zh,
    options,
    correctIndex,
    userIndex,
    explanation: `${mq.prompt.fr} = ${mq.answer}`,
    mode: "choice",
    subject: "math",
    kind: mq.kind,
  };
}

export function normalizeAnswer(s: string): string {
  return s.trim().replace(/\s+/g, "").replace("：", ":");
}
