/**
 * 数学课程表（PRD §7.7 关卡地图：学段 → 知识点分组 → 关卡）
 *
 * - 每关 8–10 题，由 lib/mathGenerator.ts 按学段参数生成；
 * - cnProgress = 中国体系知识点（§6.8：以中国排期为基准），
 *   frBenchmark = 法国对标标签（关卡详情展示「本关 ≈ CP」等）。
 */

import type { MathKind } from "./mathGenerator";
import type { Level } from "./levels";

export type MathStage = {
  /** 关卡 id（全局唯一，用于星级存储 `rewards.levelStars`） */
  id: string;
  kind: MathKind;
  title: { zh: string; en: string; fr: string };
  /** 每关题数（8–10） */
  count: number;
  /** mul 口诀限定模式（如「6 的口诀」） */
  fixedFactor?: number;
};

export type MathGroup = {
  id: string;
  title: { zh: string; en: string; fr: string };
  emoji: string;
  cnProgress: string;
  frBenchmark: string;
  stages: MathStage[];
};

export type LevelCurriculum = { level: Level; groups: MathGroup[] };

const g = (
  id: string,
  emoji: string,
  title: [string, string, string],
  cnProgress: string,
  frBenchmark: string,
  stages: MathStage[]
): MathGroup => ({
  id,
  emoji,
  title: { zh: title[0], en: title[1], fr: title[2] },
  cnProgress,
  frBenchmark,
  stages,
});

const s = (
  id: string,
  kind: MathKind,
  title: [string, string, string],
  count = 10,
  fixedFactor?: number
): MathStage => ({
  id,
  kind,
  count,
  fixedFactor,
  title: { zh: title[0], en: title[1], fr: title[2] },
});

export const MATH_CURRICULUM: Record<Level, MathGroup[]> = {
  L1: [
    g("l1-count", "🔢", ["数与量", "Numbers", "Nombres"], "点数 1–5", "≈ PS", [
      s("l1-count-1", "count", ["手口一致点数", "Counting", "Compter"], 8),
      s("l1-count-2", "countWrite", ["看图写数", "Write the number", "Écrire le nombre"], 8),
    ]),
    g("l1-compare", "⚖️", ["比一比", "Compare", "Comparer"], "比较大小、多少", "≈ PS", [
      s("l1-compare-1", "compare", ["谁多谁少", "More or less", "Plus ou moins"], 8),
    ]),
    g("l1-arith", "➕", ["加减启蒙", "First sums", "Premières sommes"], "5 以内加减（不进退位）", "≈ PS", [
      s("l1-add", "add", ["5 以内加法", "Addition to 5", "Addition jusqu'à 5"], 8),
      s("l1-sub", "sub", ["5 以内减法", "Subtraction to 5", "Soustraction jusqu'à 5"], 8),
    ]),
  ],
  L2: [
    g("l2-count", "🔢", ["数与量", "Numbers", "Nombres"], "点数与认读 1–10", "≈ MS", [
      s("l2-count-1", "count", ["点数 1–10", "Counting 1–10", "Compter 1–10"], 10),
      s("l2-count-2", "countWrite", ["数物对应写数", "Count and write", "Compter et écrire"], 10),
    ]),
    g("l2-compare", "⚖️", ["比一比", "Compare", "Comparer"], "5 以内比多少", "≈ MS", [
      s("l2-compare-1", "compare", ["10 以内比大小", "Compare to 10", "Comparer jusqu'à 10"], 10),
    ]),
    g("l2-arith", "➕", ["10 以内加减", "Sums to 10", "Sommes jusqu'à 10"], "10 以内加减", "≈ MS", [
      s("l2-add", "add", ["10 以内加法", "Addition to 10", "Addition jusqu'à 10"], 10),
      s("l2-sub", "sub", ["10 以内减法", "Subtraction to 10", "Soustraction jusqu'à 10"], 10),
    ]),
  ],
  L3: [
    g("l3-arith", "➕", ["10 以内口算", "Mental sums to 10", "Calcul jusqu'à 10"], "10 以内加减口算", "≈ GS", [
      s("l3-add", "add", ["10 以内加法", "Addition to 10", "Addition jusqu'à 10"], 10),
      s("l3-sub", "sub", ["10 以内减法", "Subtraction to 10", "Soustraction jusqu'à 10"], 10),
    ]),
    g("l3-compare", "⚖️", ["比大小", "Compare", "Comparer"], "比大小 >、<、=", "≈ GS", [
      s("l3-compare-1", "compare", ["20 以内比大小", "Compare to 20", "Comparer jusqu'à 20"], 10),
    ]),
    g("l3-clock", "🕒", ["认识时钟", "Clock", "L'heure"], "认识整点时钟", "≈ GS", [
      s("l3-clock-1", "clock", ["整点", "On the hour", "Heures pleines"], 8),
    ]),
    g("l3-money", "💰", ["认识人民币", "Money", "La monnaie"], "人民币面值", "≈ GS", [
      s("l3-money-1", "money", ["认面值与数钱", "Notes and coins", "Billets et pièces"], 8),
    ]),
  ],
  L4: [
    g("l4-arith", "➕", ["20 以内加减", "Sums to 20", "Sommes jusqu'à 20"], "20 以内加减法", "≈ CP", [
      s("l4-add", "add", ["20 以内加法", "Addition to 20", "Addition jusqu'à 20"], 10),
      s("l4-sub", "sub", ["20 以内减法", "Subtraction to 20", "Soustraction jusqu'à 20"], 10),
    ]),
    g("l4-carry", "🧮", ["进位加法", "Carrying", "Retenue"], "20 以内进位加法（凑十法）", "≈ CP", [
      s("l4-addCarry", "addCarry", ["凑十法", "Make a ten", "Faire une dizaine"], 10),
    ]),
    g("l4-borrow", "➖", ["退位减法", "Borrowing", "Emprunt"], "20 以内退位减法（破十法）", "≈ CP", [
      s("l4-subBorrow", "subBorrow", ["破十法", "Split the ten", "Défaire la dizaine"], 10),
    ]),
    g("l4-place", "🏗️", ["位值", "Place value", "Valeur de position"], "数位（个位/十位）与位值", "≈ CP", [
      s("l4-placeValue", "placeValue", ["两位数的位值", "Tens and ones", "Dizaines et unités"], 10),
      s("l4-sequence", "sequence", ["数列找规律", "Number patterns", "Suites de nombres"], 10),
    ]),
  ],
  L5: [
    g("l5-arith", "➕", ["100 以内口算", "Mental sums to 100", "Calcul jusqu'à 100"], "100 以内加减法", "≈ CE1", [
      s("l5-add", "add", ["100 以内加法", "Addition to 100", "Addition jusqu'à 100"], 10),
      s("l5-sub", "sub", ["100 以内减法", "Subtraction to 100", "Soustraction jusqu'à 100"], 10),
    ]),
    g("l5-mul", "✖️", ["表内乘法", "Times tables", "Tables de multiplication"], "表内乘法（九九口诀全表）", "≈ CE1", [
      s("l5-mul-all", "mul", ["口诀全覆盖", "All tables", "Toutes les tables"], 10),
      s("l5-mul-6", "mul", ["6 的口诀", "Table of 6", "Table de 6"], 10, 6),
      s("l5-mul-7", "mul", ["7 的口诀", "Table of 7", "Table de 7"], 10, 7),
    ]),
    g("l5-place", "🏗️", ["位值拓展", "Place value", "Valeur de position"], "万以内数的认识（三位数）", "≈ CE1", [
      s("l5-placeValue", "placeValue", ["三位数的位值", "Hundreds", "Centaines"], 10),
    ]),
    g("l5-measure", "📏", ["测量基础", "Measurement", "Mesure"], "长度与质量单位（PRD §6.6 L5）", "≈ CE1", [
      s("l5-lengthUnit", "lengthUnit", ["长度单位换算", "Length units", "Unités de longueur"], 10),
      s("l5-massUnit", "massUnit", ["质量单位换算", "Mass units", "Unités de masse"], 10),
    ]),
    g("l5-shapes", "🔷", ["图形性质", "Shapes", "Formes"], "轴对称图形（PRD §6.6 L5）", "≈ CE1", [
      s("l5-axisSymmetry", "axisSymmetry", ["轴对称判断", "Axis symmetry", "Symétrie axiale"], 10),
    ]),
  ],
  L6: [
    g("l6-mul", "✖️", ["乘法进阶", "Advanced tables", "Tables avancées"], "乘除法竖式（感知）", "≈ CE2", [
      s("l6-mul-8", "mul", ["8 的口诀", "Table of 8", "Table de 8"], 10, 8),
      s("l6-mul-9", "mul", ["9 的口诀", "Table of 9", "Table de 9"], 10, 9),
    ]),
    g("l6-columnar", "➗", ["乘除竖式", "Column method", "Posé"], "乘除法竖式（感知）", "≈ CE2", [
      s("l6-mulDiv", "mulDiv", ["两位数乘一位数 / 除法竖式", "Multiply & divide", "Multiplication / division posée"], 10),
    ]),
    g("l6-fraction", "🍕", ["分数初步", "Fractions", "Fractions"], "分数初步（几分之一）", "≈ CE2", [
      s("l6-fraction", "fraction", ["几分之一 / 分数比较", "Fractions & compare", "Fractions et comparaison"], 10),
    ]),
    g("l6-sequence", "🔢", ["数列", "Sequences", "Suites"], "万以内数与规律", "≈ CE2", [
      s("l6-sequence", "sequence", ["等差数列", "Number patterns", "Suites arithmétiques"], 10),
    ]),
  ],
};

/** 关卡 id → 所在学段与配置（SSG 全量枚举用） */
export function allStageIds(): string[] {
  const ids: string[] = [];
  for (const groups of Object.values(MATH_CURRICULUM)) {
    for (const grp of groups) {
      for (const st of grp.stages) ids.push(st.id);
    }
  }
  return ids;
}

export function findStage(
  stageId: string
): { level: Level; group: MathGroup; stage: MathStage } | undefined {
  for (const [level, groups] of Object.entries(MATH_CURRICULUM) as [
    Level,
    MathGroup[]
  ][]) {
    for (const grp of groups) {
      const stage = grp.stages.find((st) => st.id === stageId);
      if (stage) return { level, group: grp, stage };
    }
  }
  return undefined;
}

/** 逻辑题组定义（P0 四域；spatial/deduce 为 P1 占位） */
export const LOGIC_DOMAINS: {
  id: string;
  title: { zh: string; en: string; fr: string };
  emoji: string;
  kinds: ("pattern" | "classify" | "sort" | "oddOne" | "sudoku9")[];
  ready: boolean;
}[] = [
  {
    id: "pattern",
    title: { zh: "模式与规律", en: "Patterns", fr: "Suites logiques" },
    emoji: "🔮",
    kinds: ["pattern"],
    ready: true,
  },
  {
    id: "classify",
    title: { zh: "分类与排序", en: "Classify & sort", fr: "Classement & sériation" },
    emoji: "🧺",
    kinds: ["classify", "sort"],
    ready: true,
  },
  {
    id: "observe",
    title: { zh: "观察与比较", en: "Observe", fr: "Observation" },
    emoji: "🔍",
    kinds: ["oddOne"],
    ready: true,
  },
  {
    id: "spatial",
    title: { zh: "空间与视觉", en: "Spatial", fr: "Espace" },
    emoji: "🧭",
    kinds: [],
    ready: false,
  },
  {
    id: "number",
    title: { zh: "数理推理", en: "Numbers", fr: "Raisonnement" },
    emoji: "🧮",
    kinds: ["sudoku9"],
    ready: true,
  },
  {
    id: "deduce",
    title: { zh: "演绎与策略", en: "Deduction", fr: "Déduction" },
    emoji: "🕵️",
    kinds: [],
    ready: false,
  },
];

/** 该学段可用的数学题型集合（每日挑战按此抽取 kind，Dev-Plan T3.4） */
export function stageKindsForLevel(level: Level): MathKind[] {
  const kinds: MathKind[] = [];
  for (const group of MATH_CURRICULUM[level] ?? []) {
    for (const stage of group.stages) {
      if (!kinds.includes(stage.kind)) kinds.push(stage.kind);
    }
  }
  return kinds;
}
