#!/usr/bin/env node
/**
 * print（印刷体）描红笔顺数据生成器 —— **路径 A：中心线描摹**（Phase 6 T6-08）
 *
 * 背景：旧版 `generate-trace-data.cjs` 用 opentype `getPath()` 取的是字形**轮廓**（闭合描边），
 *       导致点列沿轮廓绕行、起笔落在右下（顺序错误）。按 `cursive-authoring-guide.md §8`，
 *       正确的做法是**沿中心线**（书写轨迹）采样 —— 即路径 A。
 *
 * 本脚本即路径 A 的数字化实现：
 *   1. 下方 `UPPER_STROKES` / `LOWER_STROKES` 是**逐字手工定义的中心线**（真书写顺序、真落笔点）；
 *   2. 生成时按弧长把每条笔画重采样为 6–24 点（曲线用 Catmull-Rom 平滑，直线/折线保持棱角）；
 *   3. 变音字形 = 基础字母 base 笔画 + 音符 diacritic（音符排在末尾）。
 *
 * 用法：
 *   node scripts/generate-print-trace.cjs          # 写入 data/trace/letter-strokes.json（保留 cursive 等）
 *   node scripts/generate-print-trace.cjs --dry     # 只打印统计，不写文件
 *
 * 说明：坐标全部落在 0–100 归一化网格（原点左上）；参考线见 PRINT_GUIDES。
 *       产出仍需内容轨 / 法语母语者目视复核（T6-08 验收 ④）。
 */

"use strict";

const fs = require("fs");
const path = require("path");

const OUT_FILE = path.join(__dirname, "..", "data", "trace", "letter-strokes.json");
const dry = process.argv.includes("--dry");

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];
const TODAY = new Date().toISOString().slice(0, 10);

/** print 参考线（全字形统一）：大写/上伸 12、主体顶 40、基线 78、下伸 96 */
const PRINT_GUIDES = { ascender: 12, capHeight: 12, xHeight: 40, baseline: 78, descender: 96 };

// ── 手工中心线定义 ──────────────────────────────────────────────
// 笔画两种写法：
//   [[x,y], ...]                        → base 直线/折线（保持棱角）
//   { pts:[[x,y],...], smooth:true }    → base 平滑曲线（Catmull-Rom）
//   { pts:[[x,y],...], kind:"diacritic"}→ 音符（排末尾）
const UPPER_STROKES = {
  A: [[[50, 12], [28, 78]], [[50, 12], [72, 78]], [[37, 58], [63, 58]]],
  B: [
    [[30, 12], [30, 78]],
    { pts: [[30, 12], [52, 13], [61, 22], [61, 35], [51, 44], [30, 45]], smooth: true },
    { pts: [[30, 45], [55, 46], [64, 55], [64, 69], [53, 77], [30, 78]], smooth: true },
  ],
  C: [{ pts: [[68, 20], [56, 12], [40, 15], [31, 30], [29, 50], [33, 68], [45, 78], [60, 76], [68, 69]], smooth: true }],
  D: [
    [[30, 12], [30, 78]],
    { pts: [[30, 12], [48, 13], [61, 23], [66, 45], [61, 67], [48, 77], [30, 78]], smooth: true },
  ],
  E: [[[70, 12], [32, 12], [32, 78]], [[32, 45], [64, 45]], [[32, 78], [70, 78]]],
  F: [[[70, 12], [32, 12], [32, 78]], [[32, 45], [64, 45]]],
  G: [
    { pts: [[68, 22], [57, 13], [42, 14], [32, 25], [29, 48], [33, 68], [46, 78], [62, 76], [70, 66]], smooth: true },
    [[70, 66], [70, 50], [54, 50]],
  ],
  H: [[[32, 12], [32, 78]], [[68, 12], [68, 78]], [[32, 46], [68, 46]]],
  I: [[[30, 12], [70, 12]], [[50, 12], [50, 78]], [[30, 78], [70, 78]]],
  J: [
    { pts: [[58, 12], [58, 64], [55, 73], [46, 78], [35, 74], [31, 66]], smooth: true },
    [[46, 12], [70, 12]],
  ],
  K: [[[32, 12], [32, 78]], [[66, 12], [34, 45]], [[40, 45], [68, 78]]],
  L: [[[32, 12], [32, 78]], [[32, 78], [70, 78]]],
  M: [[[30, 12], [30, 78]], [[70, 12], [70, 78]], [[30, 12], [50, 60], [70, 12]]],
  N: [[[30, 12], [30, 78]], [[30, 12], [70, 78]], [[70, 12], [70, 78]]],
  O: [{ pts: [[50, 12], [64, 17], [70, 32], [70, 55], [64, 72], [50, 78], [36, 72], [30, 55], [30, 32], [36, 17], [50, 12]], smooth: true }],
  P: [
    [[30, 12], [30, 78]],
    { pts: [[30, 12], [50, 13], [61, 22], [61, 36], [50, 45], [30, 45]], smooth: true },
  ],
  Q: [
    { pts: [[50, 12], [64, 17], [70, 32], [70, 55], [64, 72], [50, 78], [36, 72], [30, 55], [30, 32], [36, 17], [50, 12]], smooth: true },
    [[58, 62], [74, 82]],
  ],
  R: [
    [[30, 12], [30, 78]],
    { pts: [[30, 12], [50, 13], [61, 22], [61, 36], [50, 45], [30, 45]], smooth: true },
    [[42, 45], [70, 78]],
  ],
  S: [{ pts: [[66, 20], [55, 13], [41, 14], [32, 23], [34, 35], [46, 43], [58, 47], [66, 56], [66, 68], [55, 77], [41, 77], [32, 69]], smooth: true }],
  T: [[[28, 12], [72, 12]], [[50, 12], [50, 78]]],
  U: [{ pts: [[30, 12], [30, 55], [34, 69], [44, 77], [56, 77], [66, 69], [70, 55], [70, 12]], smooth: true }],
  V: [[[30, 12], [50, 78], [70, 12]]],
  W: [[[26, 12], [38, 78], [50, 34], [62, 78], [74, 12]]],
  X: [[[30, 12], [70, 78]], [[70, 12], [30, 78]]],
  Y: [[[30, 12], [50, 46]], [[70, 12], [50, 46]], [[50, 46], [50, 78]]],
  Z: [[[30, 12], [70, 12]], [[70, 12], [30, 78]], [[30, 78], [70, 78]]],
};

const LOWER_STROKES = {
  a: [
    { pts: [[62, 45], [50, 41], [38, 47], [34, 60], [40, 74], [52, 77], [61, 70], [62, 56]], smooth: true },
    [[62, 40], [62, 78]],
  ],
  b: [
    [[34, 12], [34, 78]],
    { pts: [[34, 56], [44, 42], [57, 43], [65, 54], [64, 71], [53, 78], [41, 76], [34, 64]], smooth: true },
  ],
  c: [{ pts: [[64, 48], [53, 42], [41, 44], [35, 55], [36, 67], [45, 76], [56, 77], [64, 70]], smooth: true }],
  d: [
    { pts: [[64, 56], [54, 42], [42, 43], [35, 54], [36, 68], [46, 77], [58, 76], [64, 63]], smooth: true },
    [[66, 12], [66, 78]],
  ],
  e: [{ pts: [[36, 60], [48, 59], [62, 56], [63, 46], [53, 41], [41, 45], [35, 56], [36, 68], [45, 77], [57, 77], [64, 70]], smooth: true }],
  f: [
    { pts: [[46, 78], [49, 58], [49, 26], [53, 15], [61, 15], [64, 21]], smooth: true },
    [[40, 50], [64, 50]],
  ],
  g: [
    { pts: [[64, 56], [54, 42], [42, 43], [35, 54], [36, 68], [46, 77], [58, 76], [64, 63]], smooth: true },
    { pts: [[64, 42], [64, 82], [59, 92], [48, 95], [38, 92], [33, 85]], smooth: true },
  ],
  h: [
    [[34, 12], [34, 78]],
    { pts: [[34, 56], [41, 45], [53, 42], [63, 47], [66, 58], [66, 78]], smooth: true },
  ],
  i: [[[50, 40], [50, 78]], { pts: [[50, 21], [50, 25]], kind: "diacritic" }],
  j: [
    { pts: [[56, 40], [56, 84], [52, 92], [43, 95], [35, 90]], smooth: true },
    { pts: [[56, 21], [56, 25]], kind: "diacritic" },
  ],
  k: [[[34, 12], [34, 78]], [[60, 42], [37, 58], [62, 78]]],
  l: [[[50, 12], [50, 78]]],
  m: [
    { pts: [[32, 78], [32, 45], [41, 41], [49, 46], [49, 78]], smooth: true },
    { pts: [[49, 46], [58, 41], [66, 46], [66, 78]], smooth: true },
  ],
  n: [{ pts: [[34, 78], [34, 46], [42, 41], [52, 46], [54, 57], [54, 78]], smooth: true }],
  o: [{ pts: [[50, 40], [62, 44], [64, 58], [57, 73], [45, 77], [35, 72], [33, 58], [41, 44], [50, 40]], smooth: true }],
  p: [
    [[34, 40], [34, 96]],
    { pts: [[34, 56], [46, 43], [58, 45], [65, 56], [63, 72], [52, 77], [40, 75], [34, 64]], smooth: true },
  ],
  q: [
    { pts: [[64, 56], [54, 42], [42, 43], [35, 54], [36, 68], [46, 77], [58, 76], [64, 63]], smooth: true },
    [[66, 40], [66, 96]],
  ],
  r: [
    [[36, 40], [36, 78]],
    { pts: [[36, 52], [45, 43], [55, 43], [60, 48]], smooth: true },
  ],
  s: [{ pts: [[62, 47], [52, 42], [42, 44], [39, 52], [46, 57], [56, 60], [61, 68], [56, 75], [44, 77], [36, 73]], smooth: true }],
  t: [
    { pts: [[50, 20], [50, 66], [53, 75], [61, 77]], smooth: true },
    [[38, 44], [64, 44]],
  ],
  u: [
    { pts: [[34, 40], [34, 64], [38, 74], [47, 78], [54, 75], [56, 66]], smooth: true },
    [[56, 40], [56, 78]],
  ],
  v: [[[34, 40], [50, 78], [66, 40]]],
  w: [[[30, 40], [40, 78], [50, 50], [60, 78], [70, 40]]],
  x: [[[34, 40], [66, 78]], [[66, 40], [34, 78]]],
  y: [[[34, 40], [50, 74]], { pts: [[66, 40], [50, 74], [44, 86], [40, 94]], smooth: true }],
  z: [[[36, 40], [64, 40], [36, 78], [64, 78]]],
};

/** 变音字形：base = 对应 print 小写字母的 base 笔画（不含点/音符），dia = 音符 */
const ACCENT_DEFS = {
  "é": { base: "e", dia: { pts: [[42, 28], [56, 16]] } }, // acute：左下 → 右上
  "è": { base: "e", dia: { pts: [[42, 16], [56, 28]] } }, // grave：左上 → 右下
  "ê": { base: "e", dia: { pts: [[41, 16], [49, 28], [57, 16]] } }, // circumflex：V 形
  "à": { base: "a", dia: { pts: [[41, 14], [57, 26]] } },
  "ù": { base: "u", dia: { pts: [[37, 14], [53, 26]] } },
  "î": { base: "i", dia: { pts: [[41, 14], [49, 26], [57, 14]] } }, // base 不含 i 的点
  "ô": { base: "o", dia: { pts: [[41, 14], [49, 26], [57, 14]] } },
  "ç": { base: "c", dia: { pts: [[50, 79], [50, 86], [47, 92], [41, 94]], smooth: true } }, // cedilla：基线下方
};

// ── 采样 / 几何工具 ─────────────────────────────────────────────
const round1 = (n) => Math.round(n * 10) / 10;

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.01) out.push([p[0], p[1]]);
  }
  return out;
}

/** Catmull-Rom 插值（端点重复以穿过首末点） */
function catmullRom(pts) {
  if (pts.length < 3) return pts.slice();
  const n = pts.length;
  const dense = [pts[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 1; s <= 16; s++) {
      const t = s / 16;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return dense;
}

/** 按弧长均匀重采样为 6–24 点（保形、保端点） */
function resample(rawPts, smooth) {
  const pts = dedupe(rawPts);
  if (pts.length < 2) return pts;
  const dense = smooth ? catmullRom(pts) : pts.slice();

  const cum = [0];
  let total = 0;
  for (let i = 1; i < dense.length; i++) {
    total += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    cum.push(total);
  }
  const N = Math.max(6, Math.min(24, Math.round(total / 3.5) || 6));

  const out = [];
  for (let k = 0; k < N; k++) {
    const target = total * (k / (N - 1));
    let j = 1;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const d0 = cum[j - 1];
    const d1 = cum[j] || d0 + 1e-6;
    const r = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const a = dense[j - 1];
    const b = dense[j];
    out.push([round1(a[0] + (b[0] - a[0]) * r), round1(a[1] + (b[1] - a[1]) * r)]);
  }
  return dedupe(out);
}

function normalize(def) {
  if (Array.isArray(def)) return { kind: "base", smooth: false, pts: def };
  return { kind: def.kind || "base", smooth: !!def.smooth, pts: def.pts };
}

function buildStroke(def) {
  const s = normalize(def);
  return { kind: s.kind, points: resample(s.pts, s.smooth) };
}

// ── 组装字形 ────────────────────────────────────────────────────
function buildEntry(glyph) {
  const isAccented = ACCENTED.includes(glyph);
  let strokes;

  if (isAccented) {
    const def = ACCENT_DEFS[glyph];
    const baseDefs = LOWER_STROKES[def.base].map(normalize).filter((s) => s.kind !== "diacritic");
    strokes = [
      ...baseDefs.map(buildStroke),
      buildStroke({ ...def.dia, kind: "diacritic" }),
    ];
  } else {
    const table = /^[A-Z]$/.test(glyph) ? UPPER_STROKES : LOWER_STROKES;
    strokes = table[glyph].map(buildStroke);
  }

  const baseCount = strokes.filter((s) => s.kind === "base").length;
  const diaCount = strokes.length - baseCount;

  return {
    key: `print:${glyph}`,
    glyph,
    style: "print",
    langs: isAccented ? ["fr"] : ["en", "fr"],
    viewBox: { w: 100, h: 100 },
    guides: { ...PRINT_GUIDES },
    strokes,
    source: {
      by: "内容轨（路径A·中心线）",
      date: TODAY,
      note: `路径A 中心线描摹（scripts/generate-print-trace.cjs）：${baseCount} 笔${diaCount ? ` + 音符 ${diaCount}` : ""}；待母语者复核`,
    },
  };
}

// ── 主流程 ──────────────────────────────────────────────────────
let out = {};
if (fs.existsSync(OUT_FILE)) {
  try {
    out = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  } catch {
    out = {};
  }
}
delete out._meta;

const stats = [];
for (const glyph of [...UPPER, ...LOWER, ...ACCENTED]) {
  const entry = buildEntry(glyph);
  out[`print:${glyph}`] = entry;
  const pts = entry.strokes.reduce((n, s) => n + s.points.length, 0);
  stats.push(`${glyph}: ${entry.strokes.length} 笔 / ${pts} 点`);
}

out._meta = {
  generator: "scripts/generate-print-trace.cjs（print·路径A 中心线）+ scripts/generate-cursive-trace.cjs（cursive 待重做）",
  fonts: {
    print: "手工中心线定义（路径A；配合 scripts/trace-authoring.cjs 校正）",
    cursive: "BelleAllureCE-Gros.otf（骨架化，待人工校正）",
  },
  note: "print 已按路径A 重做中心线（真书写顺序、真落笔点）；仍需人工 / 法语母语者复核并留档（T6-08 验收④）。",
  updatedAt: TODAY,
};

console.log("—— print 路径A 中心线生成 ——");
console.log(stats.join("\n"));

if (dry) {
  console.log("\n[dry-run] 未写文件。");
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");

const filled = Object.entries(out).filter(([k, v]) => k !== "_meta" && v).length;
console.log(`\n✅ 已写入 ${path.relative(process.cwd(), OUT_FILE)}　已填 ${filled}/94`);
console.log("   下一步：npm run check:trace（自检）→ node scripts/preview-trace-data.cjs（目视复核）");
