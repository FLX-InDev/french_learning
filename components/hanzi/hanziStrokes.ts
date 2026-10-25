/**
 * 汉字描红数据取用层（MVP-H3 / 中文描红）
 *
 * - 数据来源：`data/trace/hanzi/<档>.json`（由 `data/trace/hanzi/sync-from-cn-writing.cjs`
 *   从 `data/trace/cn-writing/output/` 同步；骨架源自 hanzi-writer-data（ARPHIC PL 1.1），
 *   笔顺按 GF 0023-2020 逐笔审计，人工校订走 `cn-writing/overrides/`）；
 * - 边界：本文件**只读数据、只做取用与换算**，不含判定逻辑——中文描红同样
 *   本文件只负责取数与换算，判定阈值与文案见 `strokeJudge.ts`（契约 H：判笔顺、不打分）；
 * - 渲染：米字格由 `InkTrace` 的 `board` 通道承担（`toTraceBoard` 负责换算）。
 *
 * MVP 只装载 **3-4 岁启蒙档**（21 个 1–2 画独体字）；换档/加档=在 `BAND_SOURCES` 里补一条。
 */

import type { TraceBoard } from "@/components/alphabets/InkTrace";
import type { StrokeKind, TraceGuides, TracePoint } from "@/components/alphabets/letterStrokes";
import rawBand34 from "@/data/trace/hanzi/3-4.json";

/** 字形键 = `hanzi:<字>` */
export type HanziKey = string;

export type HanziStroke = { kind: StrokeKind; points: TracePoint[] };

/** 米字格数据仍沿用 `TraceGuides` 的数值字段（外沿 2 / 基线 98），另带 grid、em 说明 */
export type HanziGuides = TraceGuides & { grid?: string; em?: number };

export type HanziGlyph = {
  key: HanziKey;
  glyph: string;
  style: "hanzi";
  langs: "zh"[];
  viewBox: { w: number; h: number };
  guides: HanziGuides;
  /** 顺序 = 书写顺序（GF 0023-2020 笔顺） */
  strokes: HanziStroke[];
  source: {
    by: string;
    date: string;
    derivedFrom?: string;
    changes?: string;
    note?: string;
  };
};

export type HanziBandMeta = {
  band: string;
  label: string;
  coordinate?: string;
  source?: string;
  standard?: string;
  attribution?: string;
  audit?: { built?: number; ok?: number; hint?: number; review?: number; error?: number; note?: string };
  selection?: { method?: string; ready?: boolean; readyNote?: string };
};

const META_KEY = "_meta";

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPoint(v: unknown): v is TracePoint {
  return Array.isArray(v) && v.length === 2 && isFiniteNum(v[0]) && isFiniteNum(v[1]);
}

/** 结构守卫：只放行完整可渲染的字形（缺字段条目被忽略而非崩溃） */
function isHanziGlyph(v: unknown): v is HanziGlyph {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  if (typeof e.key !== "string" || typeof e.glyph !== "string") return false;
  if (e.style !== "hanzi") return false;
  if (!Array.isArray(e.strokes) || e.strokes.length === 0) return false;
  return e.strokes.every((s) => {
    if (!s || typeof s !== "object") return false;
    const st = s as Record<string, unknown>;
    if (st.kind !== "base" && st.kind !== "diacritic") return false;
    return Array.isArray(st.points) && st.points.length >= 2 && st.points.every(isPoint);
  });
}

function loadBand(raw: unknown): { meta: HanziBandMeta | null; glyphs: Record<HanziKey, HanziGlyph> } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const m = obj[META_KEY];
  const meta = m && typeof m === "object" ? (m as HanziBandMeta) : null;
  const glyphs: Record<HanziKey, HanziGlyph> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === META_KEY) continue;
    if (isHanziGlyph(value)) glyphs[key] = value;
  }
  return { meta, glyphs };
}

/** 装载批次（MVP：启蒙档）。加档=在此追加上一个 `<档>.json` */
const BANDS = [loadBand(rawBand34)];

/** 档元信息（取第 1 档；用于致谢/审计口径展示） */
export const HANZI_BAND_META: HanziBandMeta | null = BANDS[0].meta;

/** 全部可用汉字字形（键 = `hanzi:<字>`） */
export const HANZI_GLYPHS: Record<HanziKey, HanziGlyph> = Object.assign(
  {},
  ...BANDS.map((b) => b.glyphs)
);

/** 字形字符清单（保持数据侧顺序 = 字表笔画序） */
export const HANZI_CHARS: string[] = Object.values(HANZI_GLYPHS).map((g) => g.glyph);

export function getHanziGlyph(ch: string): HanziGlyph | undefined {
  return HANZI_GLYPHS[`hanzi:${ch}`];
}

/** 该字是否有可描红的骨架数据 */
export function hasHanziTrace(ch: string): boolean {
  return Boolean(getHanziGlyph(ch));
}

/** 笔画数（用于 UI 标注「共 n 笔」；数据即书写顺序） */
export function hanziStrokeCount(ch: string): number {
  return getHanziGlyph(ch)?.strokes.length ?? 0;
}

/**
 * 汉字字形 → `InkTrace` 的米字格渲染模型。
 * 只映射渲染需要的字段；`grid: "rice"` 时画布不读四线格参考线，
 * 但 `guides` 仍原样带上，便于切回四线格或做调试叠加。
 */
export function toTraceBoard(entry: HanziGlyph): TraceBoard {
  return {
    glyph: entry.glyph,
    strokes: entry.strokes.map((s) => ({ kind: s.kind, points: s.points })),
    grid: "rice",
    guides: {
      ascender: entry.guides.ascender,
      capHeight: entry.guides.capHeight,
      xHeight: entry.guides.xHeight,
      baseline: entry.guides.baseline,
      descender: entry.guides.descender,
    },
    variantLabel: "hanzi",
  };
}
