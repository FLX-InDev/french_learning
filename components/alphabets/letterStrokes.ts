/**
 * 描红笔顺数据（T6-08 / S5）—— 类型化 + 取用接口
 *
 * - 契约：`docs/phase-6/CONTEXT.md §2.7`（契约 G，v1.6）
 * - 规格：`docs/phase-6/trace-data-spec.md`（字段 / cursive 规则 / 变音拆笔 / 校验）
 * - 数据源：`data/trace/letter-strokes.json`（内容轨产出，**94 字形**）
 * - 边界：本文件**只读数据、只做取用与归一化**，不含判定逻辑——描红**只回放不判分**（PRD §7.5.7）
 *
 * 校验：`npm run check:trace [--strict]`（结构化校验，脚本与本文件单测同源规则）。
 */

import rawData from "@/data/trace/letter-strokes.json";

// ─── 类型（契约 G §2.7）─────────────────────────────────────────

/** 归一化坐标 [x, y]，∈ [0,100]，原点左上 */
export type TracePoint = [number, number];
/** 印刷体 / Écriture cursive 手写连体 */
export type TraceStyle = "print" | "cursive";
/** 基础笔画 / 变音音符笔画 */
export type StrokeKind = "base" | "diacritic";

export type TraceStroke = { kind: StrokeKind; points: TracePoint[] };

/** 四线格参考线（y 向下）：ascender ≤ capHeight < xHeight < baseline < descender */
export type TraceGuides = {
  ascender: number;
  capHeight: number;
  xHeight: number;
  baseline: number;
  descender: number;
  /** 倾斜角（度）；cursive 建议 15–20 */
  slant?: number;
};

export type LetterStroke = {
  /** 字形键 = `${style}:${glyph}`，如 "print:A" / "cursive:é" */
  key: string;
  /** A–Z | a–z | é è ê à ù î ô ç */
  glyph: string;
  style: TraceStyle;
  langs: ("fr" | "en")[];
  viewBox: { w: 100; h: 100 };
  guides: TraceGuides;
  /** 顺序 = 书写顺序；diacritic 必在 base 之后 */
  strokes: TraceStroke[];
  /** cursive 必需：起笔钩 / 收笔连写点 */
  connect?: { entry: TracePoint; exit: TracePoint };
  source: { by: string; date: string; note?: string };
};

export type LetterStrokeMap = Record<string, LetterStroke>;

// ─── 数据装填（跳过 _meta 说明块）───────────────────────────────

const META_KEY = "_meta";

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPoint(v: unknown): v is TracePoint {
  return Array.isArray(v) && v.length === 2 && isFiniteNum(v[0]) && isFiniteNum(v[1]);
}

/** 结构守卫：只放行完整可渲染的字形（缺字段的数据被忽略而非崩溃） */
function isLetterStroke(v: unknown): v is LetterStroke {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  if (typeof e.key !== "string" || typeof e.glyph !== "string") return false;
  if (e.style !== "print" && e.style !== "cursive") return false;
  if (!Array.isArray(e.langs) || e.langs.length === 0) return false;
  if (!Array.isArray(e.strokes) || e.strokes.length === 0) return false;
  return e.strokes.every((s) => {
    if (!s || typeof s !== "object") return false;
    const st = s as Record<string, unknown>;
    if (st.kind !== "base" && st.kind !== "diacritic") return false;
    return Array.isArray(st.points) && st.points.length >= 2 && st.points.every(isPoint);
  });
}

function buildMap(): LetterStrokeMap {
  const raw = rawData as unknown as Record<string, unknown>;
  const out: LetterStrokeMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === META_KEY) continue;
    if (isLetterStroke(value)) out[key] = value;
  }
  return out;
}

/** 全部可用字形（键 = `${style}:${glyph}`）；不可渲染条目已被过滤 */
export const LETTER_STROKES: LetterStrokeMap = buildMap();

/** 94 个字形键（排序，稳定） */
export const TRACE_GLYPHS: string[] = Object.keys(LETTER_STROKES).sort();

// ─── 取用接口（契约 G 冻结签名）─────────────────────────────────

export function getLetterStroke(key: string): LetterStroke | undefined {
  return LETTER_STROKES[key];
}

/** 按语言 / 书写体筛选字形键；无参 = 全部（94） */
export function listTraceGlyphs(lang?: "fr" | "en", style?: TraceStyle): string[] {
  return TRACE_GLYPHS.filter((key) => {
    const e = LETTER_STROKES[key];
    if (!e) return false;
    if (lang && !e.langs.includes(lang)) return false;
    if (style && e.style !== style) return false;
    return true;
  });
}

/** 该语言 / 书写体下可用的字形字符（去重、保持 a–z A–Z、变音随后） */
export function traceGlyphChars(lang?: "fr" | "en", style?: TraceStyle): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of listTraceGlyphs(lang, style)) {
    const g = LETTER_STROKES[key]?.glyph;
    if (g && !seen.has(g)) {
      seen.add(g);
      out.push(g);
    }
  }
  return out;
}

/**
 * 解析要渲染的字形键：
 * - 指定 `style` 时按其取键；
 * - 未指定时，法语小写 / 变音**优先 cursive**（Écriture cursive 是法语手写教学主形态），
 *   其余情况回退 `print`；都缺则返回 `undefined`（调用方降级）。
 */
export function resolveTraceKey(
  glyph: string,
  lang: "fr" | "en",
  style?: TraceStyle
): string | undefined {
  const candidates: TraceStyle[] = style
    ? [style]
    : lang === "fr"
      ? ["cursive", "print"]
      : ["print"];
  for (const s of candidates) {
    const key = `${s}:${glyph}`;
    const e = LETTER_STROKES[key];
    if (e && e.langs.includes(lang)) return key;
  }
  return undefined;
}

/** 字母卡形态（`Aa`、`é` 等）→ 可描红字形列表（保持顺序、去重） */
export function traceGlyphsFromLetter(letter: string): string[] {
  const out: string[] = [];
  for (const ch of Array.from(letter)) {
    if (!ch.trim()) continue;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/** 存在 cursive 字形的字形字符（法语小写 / 变音）——供切换按钮显隐 */
export function hasCursiveVariant(glyph: string): boolean {
  return Boolean(LETTER_STROKES[`cursive:${glyph}`]);
}

// ─── 渲染辅助（只影响展示，不改数据语义）────────────────────────

/** 归一化 [0,100] → 画布像素 */
export function scalePoint(p: TracePoint, size: number): TracePoint {
  return [(p[0] / 100) * size, (p[1] / 100) * size];
}

/**
 * 各笔画的**展示角色**：数据中个别变音字形（如 `cursive:é` / `print:ç`）把主体笔画
 * 也标成了 `diacritic`（无 `base`）。此处做展示层归一化：
 * 若该字形完全没有 `base`，则把第 1 笔视作主体、其余视作音符，避免主体被当成音符着色。
 */
export function strokeDisplayRoles(entry: LetterStroke): StrokeKind[] {
  const hasBase = entry.strokes.some((s) => s.kind === "base");
  return entry.strokes.map((s, i) => {
    if (hasBase) return s.kind;
    return i === 0 ? "base" : "diacritic";
  });
}

/** 四线格参考线（含 baseline 加粗）；cursive 附加倾斜引导线端点 */
export function guideLines(entry: LetterStroke): {
  y: number;
  weight: "thin" | "base" | "thick";
  label: keyof Omit<TraceGuides, "slant">;
}[] {
  const g = entry.guides;
  return [
    { y: g.ascender, weight: "thin", label: "ascender" },
    { y: g.capHeight, weight: "thin", label: "capHeight" },
    { y: g.xHeight, weight: "base", label: "xHeight" },
    { y: g.baseline, weight: "thick", label: "baseline" },
    { y: g.descender, weight: "thin", label: "descender" },
  ];
}

export const TRACE_STYLES: TraceStyle[] = ["print", "cursive"];
