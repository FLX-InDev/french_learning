#!/usr/bin/env node
/**
 * 描红笔顺数据生成器（Phase 6 T6-08）
 *
 * 数据源：Belle Allure **单线（stroke）字体**——路径本身就是书写中心线，无需骨架化。
 *   - print（印刷体）：`BelleAllureScript2i-Fin.otf`（"script" = 法语「印刷体」）
 *   - cursive（手写体）：待接入（见下方 CURSIVE 说明）
 *
 * 处理流程：字形路径 → 采样（贝塞尔细分）→ RDP 简化 → 归一化到 0–100 → 组装 JSON
 *
 * 用法：
 *   node scripts/generate-trace-data.cjs --print       # 生成 print 60 字形
 *   node scripts/generate-trace-data.cjs --print --dry # 只打印统计，不写文件
 *
 * 输出：data/trace/letter-strokes.json（未生成的字形保留 null 占位）
 */

const fs = require("fs");
const path = require("path");

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts", "belle-allure");
const PRINT_FONT = path.join(FONT_DIR, "BelleAllureScript2i-Fin.otf");
const OUT_FILE = path.join(__dirname, "..", "data", "trace", "letter-strokes.json");

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];

const argv = process.argv.slice(2);
const doPrint = argv.includes("--print") || argv.length === 0;
const dry = argv.includes("--dry");

// ── 几何工具 ────────────────────────────────────────────────────
const cubic = (p0, p1, p2, p3, t) => {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
};
const quad = (p0, p1, p2, t) => {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
};

/** opentype commands → contour 点列（贝塞尔细分） */
function pathToContours(cmds) {
  const contours = [];
  let cur = null;
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0;
  for (const c of cmds) {
    if (c.type === "M") {
      if (cur && cur.length > 1) contours.push(cur);
      cur = [[c.x, c.y]];
      cx = sx = c.x;
      cy = sy = c.y;
    } else if (!cur) {
      continue;
    } else if (c.type === "L") {
      cur.push([c.x, c.y]);
      cx = c.x;
      cy = c.y;
    } else if (c.type === "C") {
      for (let i = 1; i <= 14; i++) {
        const t = i / 14;
        cur.push([cubic(cx, c.x1, c.x2, c.x, t), cubic(cy, c.y1, c.y2, c.y, t)]);
      }
      cx = c.x;
      cy = c.y;
    } else if (c.type === "Q") {
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        cur.push([quad(cx, c.x1, c.x, t), quad(cy, c.y1, c.y, t)]);
      }
      cx = c.x;
      cy = c.y;
    } else if (c.type === "Z") {
      cur.push([sx, sy]);
      cx = sx;
      cy = sy;
    }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}

/** 点到线段距离 */
function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker 简化 */
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const first = pts[0];
  const last = pts[pts.length - 1];
  let idx = -1;
  let maxD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps && idx > 0) {
    const a = rdp(pts.slice(0, idx + 1), eps);
    const b = rdp(pts.slice(idx), eps);
    return a.slice(0, -1).concat(b);
  }
  return [first, last];
}

/** 自适应简化：控制点数落在 [minPts, maxPts]（规格建议 6–24） */
function simplifyToRange(pts, minPts = 6, maxPts = 24) {
  let eps = 1;
  let out = rdp(pts, eps);
  let guard = 0;
  while (out.length > maxPts && guard++ < 40) {
    eps *= 1.22;
    out = rdp(pts, eps);
  }
  // 点数过少且原始较密时，适当放宽（避免直线被压成 2 点后丧失形态）
  if (out.length < minPts && pts.length > minPts) {
    let e = eps;
    for (let i = 0; i < 20; i++) {
      e *= 0.75;
      const cand = rdp(pts, e);
      if (cand.length >= minPts) return cand;
      out = cand;
    }
  }
  return out;
}

/** 去相邻重复点 */
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) out.push(p);
  }
  return out;
}

// ── 度量与映射 ──────────────────────────────────────────────────
/**
 * print 字体实测（**opentype `getPath` 输出坐标系：y 向下、baseline≈0**）：
 * capHeight/ascender = -816、x-height = -415、baseline ≈ +16（含过冲）、descender = +418。
 */
const PRINT_METRICS = {
  top: -816,
  xHeight: -415,
  baseline: 16,
  descender: 418,
};
/** 目标参考线：top→10、descender→96（等比，形状不变形） */
const GUIDE_TOP = 10;
const GUIDE_BOTTOM = 96;

function buildMapper(metrics) {
  const scale = (GUIDE_BOTTOM - GUIDE_TOP) / (metrics.descender - metrics.top);
  const toY = (gy) => GUIDE_TOP + (gy - metrics.top) * scale;
  return {
    scale,
    toY,
    guides: {
      ascender: round1(GUIDE_TOP),
      capHeight: round1(GUIDE_TOP),
      xHeight: round1(toY(metrics.xHeight)),
      baseline: round1(toY(metrics.baseline)),
      descender: round1(GUIDE_BOTTOM),
    },
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ── 主流程 ──────────────────────────────────────────────────────
(async () => {
  const mod = await import("opentype.js");
  const opentype = mod.default || mod;

  // 读取已有输出（保留 cursive 等未生成项）
  let out = {};
  if (fs.existsSync(OUT_FILE)) {
    try {
      out = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    } catch {
      out = {};
    }
  }
  delete out._meta;
  // 补齐 94 键骨架
  for (const g of UPPER) if (!(g in out)) out[`print:${g}`] = null;
  for (const g of LOWER) if (!(g in out)) out[`print:${g}`] = null;
  for (const g of LOWER) if (!(g in out)) out[`cursive:${g}`] = null;
  for (const g of ACCENTED) if (!(g in out)) out[`print:${g}`] = null;
  for (const g of ACCENTED) if (!(g in out)) out[`cursive:${g}`] = null;

  if (doPrint) {
    if (!fs.existsSync(PRINT_FONT)) {
      console.error(`❌ 缺少字体：${PRINT_FONT}`);
      process.exit(1);
    }
    const buf = fs.readFileSync(PRINT_FONT);
    const font = opentype.parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    );
    const mapper = buildMapper(PRINT_METRICS);

    const stats = [];
    for (const glyph of [...UPPER, ...LOWER, ...ACCENTED]) {
      const g = font.charToGlyph(glyph);
      if (!g || g.index === 0) {
        stats.push(`${glyph}: 字体缺字`);
        continue;
      }
      const p = g.getPath(0, 0, 1000);
      const bb = g.getBoundingBox();
      const centerX = (bb.x1 + bb.x2) / 2;
      const toX = (fx) => 50 + (fx - centerX) * mapper.scale;

      let contours = pathToContours(p.commands)
        .map((c) => dedupe(c))
        .filter((c) => c.length >= 2);

      // 变音字形：区分 base / diacritic
      const isAccented = ACCENTED.includes(glyph);
      // 位置判定：整条位于 x-height 线之上（i/j 的点、变音音符）或基线之下（ç 下加符）→ diacritic
      let strokes = contours.map((c) => {
        const ys = c.map((pt) => pt[1]);
        const yMax = Math.max(...ys); // 最下
        const yMin = Math.min(...ys); // 最上
        const isTop = yMax < PRINT_METRICS.xHeight;
        const isBottom = yMin > PRINT_METRICS.baseline;
        return { kind: isTop || isBottom ? "diacritic" : "base", pts: c };
      });
      // ç 等：单条路径同时含主体与下加符 → 按 y 切分
      if (isAccented && !strokes.some((s) => s.kind === "diacritic")) {
        const merged = strokes.flatMap((s) => s.pts);
        const cut = PRINT_METRICS.baseline + 8;
        const base = merged.filter((pt) => pt[1] <= cut);
        const dia = merged.filter((pt) => pt[1] > cut);
        strokes = [];
        if (base.length >= 2) strokes.push({ kind: "base", pts: base });
        if (dia.length >= 2) strokes.push({ kind: "diacritic", pts: dia });
      }
      // base 在前、diacritic 在后
      strokes.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "base" ? -1 : 1));

      const jsonStrokes = strokes
        .map((s) => {
          const simplified = dedupe(simplifyToRange(s.pts));
          const points = simplified.map(([fx, fy]) => [
            round1(toX(fx)),
            round1(mapper.toY(fy)),
          ]);
          return { kind: s.kind, points };
        })
        .filter((s) => s.points.length >= 2);

      if (jsonStrokes.length === 0) {
        stats.push(`${glyph}: 无有效笔画`);
        continue;
      }

      out[`print:${glyph}`] = {
        key: `print:${glyph}`,
        glyph,
        style: "print",
        langs: isAccented ? ["fr"] : ["en", "fr"],
        viewBox: { w: 100, h: 100 },
        guides: mapper.guides,
        strokes: jsonStrokes,
        source: {
          by: "自动提取 · Belle Allure Script2i-Fin",
          date: new Date().toISOString().slice(0, 10),
          note: `自动生成（scripts/generate-trace-data.cjs）：${jsonStrokes.length} 笔`,
        },
      };
      stats.push(`${glyph}: ${jsonStrokes.length} 笔 / ${jsonStrokes.reduce((n, s) => n + s.points.length, 0)} 点`);
    }

    console.log(`—— print 生成完成（字体：BelleAllureScript2i-Fin）——`);
    console.log(`guides: ${JSON.stringify(mapper.guides)}`);
    console.log(stats.join("\n"));
  }

  out._meta = {
    generator: "scripts/generate-trace-data.cjs",
    fonts: { print: "BelleAllureScript2i-Fin.otf（单线印刷体）", cursive: "（待接入）" },
    note: "自动提取结果需人工/母语者校验；可手工微调点列与笔画顺序。",
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  const filled = Object.entries(out).filter(([k, v]) => k !== "_meta" && v).length;

  if (dry) {
    console.log(`\n[dry-run] 未写文件。已填 ${filled}/94`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), OUT_FILE)}　已填 ${filled}/94`);
})();
