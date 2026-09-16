#!/usr/bin/env node
/**
 * cursive 笔顺数据生成器（Phase 6 T6-08）
 *
 * 数据源：`BelleAllureCE-Gros.otf`（**实心轮廓**，法语 cursive 教学体）
 * 流程：轮廓 → 光栅化（扫描线 + nonzero winding）→ Zhang-Suen 细化 → 骨架转向量段
 *        → 剪枝 → RDP 简化 → 归一化 0–100
 *
 * 输出：合并写入 `data/trace/letter-strokes.json`（仅 cursive 34 字形；未生成项保留原值）
 * 用法：node scripts/generate-cursive-trace.cjs [--dry] [--only=a,b,é]
 *
 * ⚠️ 自动生成的骨架需人工/母语者校验（笔画顺序、连写点、分叉处取舍）。
 */

const fs = require("fs");
const path = require("path");

const FONT = path.join(
  __dirname,
  "..",
  "assets",
  "fonts",
  "belle-allure",
  "BelleAllureCE-Gros.otf"
);
const OUT_FILE = path.join(__dirname, "..", "data", "trace", "letter-strokes.json");

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;

// ── 度量（实测，getPath 坐标：y 向下）───────────────────────────
const M = { top: -1232, xHeight: -434, baseline: 32, descender: 836 };
const GUIDE_TOP = 10;
const GUIDE_BOTTOM = 96;
const SCALE100 = (GUIDE_BOTTOM - GUIDE_TOP) / (M.descender - M.top);
const toY100 = (gy) => GUIDE_TOP + (gy - M.top) * SCALE100;

// 光栅化网格（统一像素比例，保证各字形相对大小一致）
const PX_H = 560;
const PX_S = PX_H / (M.descender - M.top); // px per font unit
const PX_W = 300;
const PAD = 6;

// ── 几何工具 ────────────────────────────────────────────────────
const cubic = (p0, p1, p2, p3, t) => {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
};
const quad = (p0, p1, p2, t) => {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
};

function pathToContours(cmds) {
  const contours = [];
  let cur = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const c of cmds) {
    if (c.type === "M") {
      if (cur && cur.length > 1) contours.push(cur);
      cur = [[c.x, c.y]];
      cx = sx = c.x;
      cy = sy = c.y;
    } else if (!cur) continue;
    else if (c.type === "L") {
      cur.push([c.x, c.y]);
      cx = c.x; cy = c.y;
    } else if (c.type === "C") {
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        cur.push([cubic(cx, c.x1, c.x2, c.x, t), cubic(cy, c.y1, c.y2, c.y, t)]);
      }
      cx = c.x; cy = c.y;
    } else if (c.type === "Q") {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        cur.push([quad(cx, c.x1, c.x, t), quad(cy, c.y1, c.y, t)]);
      }
      cx = c.x; cy = c.y;
    } else if (c.type === "Z") {
      cur.push([sx, sy]);
      cx = sx; cy = sy;
    }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const first = pts[0], last = pts[pts.length - 1];
  let idx = -1, maxD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], first, last);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps && idx > 0) {
    const a = rdp(pts.slice(0, idx + 1), eps);
    const b = rdp(pts.slice(idx), eps);
    return a.slice(0, -1).concat(b);
  }
  return [first, last];
}

function simplifyToRange(pts, maxPts = 24, minPts = 6) {
  let eps = 0.8;
  let out = rdp(pts, eps);
  let g = 0;
  while (out.length > maxPts && g++ < 40) { eps *= 1.25; out = rdp(pts, eps); }
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

const round1 = (n) => Math.round(n * 10) / 10;

// ── 光栅化（扫描线 + nonzero winding）───────────────────────────
function rasterize(contours, W, H, toPx) {
  const bmp = new Uint8Array(W * H);
  const edges = [];
  for (const c of contours) {
    const pts = c.map(toPx);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]]);
    }
  }
  for (let py = 0; py < H; py++) {
    const yc = py + 0.5;
    const xs = [];
    for (const [x0, y0, x1, y1] of edges) {
      const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
      if (yc < ymin || yc >= ymax) continue;
      const t = (yc - y0) / (y1 - y0);
      xs.push([x0 + t * (x1 - x0), y1 > y0 ? 1 : -1]);
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a[0] - b[0]);
    let w = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      w += xs[i][1];
      if (w !== 0) {
        const xa = Math.max(0, Math.ceil(xs[i][0] - 0.5));
        const xb = Math.min(W - 1, Math.floor(xs[i + 1][0] - 0.5));
        for (let px = xa; px <= xb; px++) bmp[py * W + px] = 1;
      }
    }
  }
  return bmp;
}

// ── Zhang-Suen 细化 ─────────────────────────────────────────────
function thin(bmp, W, H) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : bmp[y * W + x]);
  let changed = true;
  const rm = [];
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      rm.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (!bmp[y * W + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y),
            p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1),
            p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A =
            (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) + (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          rm.push(y * W + x);
        }
      }
      if (rm.length) {
        changed = true;
        for (const i of rm) bmp[i] = 0;
      }
    }
  }
  return bmp;
}

// ── 骨架 → 折线段 ───────────────────────────────────────────────
/** 小分量面积阈值（骨架像素）：低于此值视为「点 / 符号」，用包围盒中线表达 */
const DOT_AREA = 20;

/** 小分量（点 / 音符）→ 短中线（保证至少 minLen 长度，避免退化） */
function bboxMidline(comp) {
  const xs = comp.map((p) => p[0]);
  const ys = comp.map((p) => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs);
  const y1 = Math.min(...ys), y2 = Math.max(...ys);
  const minLen = 3;
  if (x2 - x1 >= y2 - y1) {
    const my = (y1 + y2) / 2;
    const cx = (x1 + x2) / 2;
    const half = Math.max(minLen / 2, (x2 - x1) / 2);
    return [[cx - half, my], [cx + half, my]];
  }
  const mx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const half = Math.max(minLen / 2, (y2 - y1) / 2);
  return [[mx, cy - half], [mx, cy + half]];
}

/**
 * 每个 8-连通分量取「最长路径」作为中线：
 * - 主干上的毛刺/短分叉自动被忽略（不进入最长路径）；
 * - 独立的点 / 音符（如 i 的点、é 的 acute）作为独立分量保留。
 */
function skeletonToPolylines(bmp, W, H) {
  const keyOf = (x, y) => y * W + x;
  const seen = new Uint8Array(W * H);
  const comps = [];

  for (let y0 = 0; y0 < H; y0++) {
    for (let x0 = 0; x0 < W; x0++) {
      const id0 = keyOf(x0, y0);
      if (!bmp[id0] || seen[id0]) continue;
      const comp = [];
      const stack = [[x0, y0]];
      seen[id0] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.push([cx, cy]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nid = keyOf(nx, ny);
            if (bmp[nid] && !seen[nid]) {
              seen[nid] = 1;
              stack.push([nx, ny]);
            }
          }
        }
      }
      comps.push(comp);
    }
  }

  const adjOf = (comp) => {
    const map = new Map();
    for (const [x, y] of comp) {
      const list = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (bmp[keyOf(nx, ny)]) list.push([nx, ny]);
        }
      map.set(keyOf(x, y), list);
    }
    return map;
  };

  /** 分量内最长简单路径（两遍 BFS；树状骨架下即直径） */
  const longestPath = (comp) => {
    const adj = adjOf(comp);
    const bfs = (start) => {
      const startK = keyOf(start[0], start[1]);
      const dist = new Map([[startK, 0]]);
      const prev = new Map();
      const q = [start];
      let far = start;
      let farD = 0;
      while (q.length) {
        const [cx, cy] = q.shift();
        const ck = keyOf(cx, cy);
        const d = dist.get(ck);
        if (d > farD) { farD = d; far = [cx, cy]; }
        for (const nb of adj.get(ck) || []) {
          const nk = keyOf(nb[0], nb[1]);
          if (dist.has(nk)) continue;
          dist.set(nk, d + 1);
          prev.set(nk, [cx, cy]);
          q.push(nb);
        }
      }
      return { far, prev };
    };
    const a = bfs(comp[0]);
    const b = bfs(a.far);
    const startK = keyOf(a.far[0], a.far[1]);
    const path = [];
    let cur = b.far;
    while (cur) {
      path.push(cur);
      const ck = keyOf(cur[0], cur[1]);
      if (ck === startK) break;
      cur = b.prev.get(ck);
      if (!cur && ck !== startK) break;
    }
    return path.reverse();
  };

  const polylines = comps
    .filter((c) => c.length >= 1)
    .map((c) => (c.length < DOT_AREA ? bboxMidline(c) : longestPath(c)))
    .filter((p) => p.length >= 2);
  return { polylines, comps };
}

// ── 主流程 ──────────────────────────────────────────────────────
(async () => {
  const mod = await import("opentype.js");
  const opentype = mod.default || mod;

  if (!fs.existsSync(FONT)) {
    console.error(`❌ 缺少字体：${FONT}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(FONT);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  let out = {};
  if (fs.existsSync(OUT_FILE)) {
    try { out = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { out = {}; }
  }
  delete out._meta;

  const targets = [...LOWER, ...ACCENTED].filter((g) => !only || only.includes(g));

  const guides = {
    ascender: round1(GUIDE_TOP),
    capHeight: round1(GUIDE_TOP),
    xHeight: round1(toY100(M.xHeight)),
    baseline: round1(toY100(M.baseline)),
    descender: round1(GUIDE_BOTTOM),
  };

  const report = [];
  for (const glyph of targets) {
    const g = font.charToGlyph(glyph);
    if (!g || g.index === 0) { report.push(`${glyph}: 缺字`); continue; }

    const cds = pathToContours(g.getPath(0, 0, 1000).commands);
    const bb = g.getBoundingBox();
    const cx = (bb.x1 + bb.x2) / 2;

    const W = PX_W + PAD * 2;
    const H = PX_H + PAD * 2;
    const toPx = ([fx, fy]) => [
      (fx - cx) * PX_S + W / 2,
      (fy - M.top) * PX_S + PAD,
    ];
    const fromPx = ([px, py]) => [
      (px - W / 2) / PX_S + cx,
      (py - PAD) / PX_S + M.top,
    ];

    const bmp = rasterize(cds, W, H, toPx);
    const filledPx = bmp.reduce((a, b) => a + b, 0);
    thin(bmp, W, H);
    const skelPx = bmp.reduce((a, b) => a + b, 0);
    const { polylines, comps } = skeletonToPolylines(bmp, W, H);
    let segs = polylines;
    const dbg = `bmp=${filledPx} skel=${skelPx} comps=[${comps.map((c) => c.length).join(",")}]`;

    // 主干优先（长段在前）；点线段仅 2 点，不可再过滤
    segs = segs.filter((s) => s.length >= 2);
    segs.sort((a, b) => b.length - a.length);

    const isAccented = ACCENTED.includes(glyph);
    let strokes = segs.map((s) => {
      const fontPts = s.map(fromPx);
      const simplified = simplifyToRange(fontPts);
      const points = simplified.map(([fx, fy]) => [round1(50 + (fx - cx) * SCALE100), round1(toY100(fy))]);
      // 变音判断：整段位于 x-height 线之上（顶部音符）或基线之下（cedilla）
      const ys = fontPts.map((p) => p[1]);
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      const isTop = yMax < M.xHeight;
      const isBottom = yMin > M.baseline;
      return { kind: isTop || isBottom ? "diacritic" : "base", points };
    }).filter((s) => s.points.length >= 2);

    // ç 等：主体与下加符在字形中连通 → 按 y 切出下加符
    if (isAccented && !strokes.some((s) => s.kind === "diacritic")) {
      const idx = strokes.findIndex((s) => s.kind === "base");
      if (idx >= 0) {
        const pts = strokes[idx].points;
        const cut = round1(toY100(M.baseline + 40));
        const base = pts.filter((p) => p[1] <= cut);
        const dia = pts.filter((p) => p[1] > cut);
        if (base.length >= 2 && dia.length >= 2) {
          strokes.splice(
            idx,
            1,
            { kind: "base", points: base },
            { kind: "diacritic", points: dia }
          );
        }
      }
    }
    if (isAccented) strokes.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "base" ? -1 : 1));

    if (!strokes.length) { report.push(`${glyph}: 无有效笔画 ← ${dbg}`); continue; }

    // connect：取最长 base 段的首末点
    const main = strokes.filter((s) => s.kind === "base").sort((a, b) => b.points.length - a.points.length)[0] || strokes[0];
    const connect = {
      entry: main.points[0],
      exit: main.points[main.points.length - 1],
    };

    out[`cursive:${glyph}`] = {
      key: `cursive:${glyph}`,
      glyph,
      style: "cursive",
      langs: ["fr"],
      viewBox: { w: 100, h: 100 },
      guides,
      strokes,
      connect,
      source: {
        by: "自动提取 · Belle Allure CE-Gros（骨架化）",
        date: new Date().toISOString().slice(0, 10),
        note: `自动生成（scripts/generate-cursive-trace.cjs）：${strokes.length} 段；需人工校验顺序与连写点`,
      },
    };
    report.push(
      `${glyph}: ${strokes.length} 段 / ${strokes.reduce((n, s) => n + s.points.length, 0)} 点　${dbg}`
    );
  }

  const filled = Object.entries(out).filter(([k, v]) => k !== "_meta" && v).length;
  console.log("—— cursive 生成（Belle Allure CE-Gros → 骨架化）——");
  console.log(`guides: ${JSON.stringify(guides)}`);
  console.log(report.join("\n"));

  if (dry) { console.log(`\n[dry-run] 已填 ${filled}/94`); return; }

  out._meta = {
    generator: "scripts/generate-trace-data.cjs（print）+ scripts/generate-cursive-trace.cjs（cursive）",
    fonts: { print: "BelleAllureScript2i-Fin.otf（单线）", cursive: "BelleAllureCE-Gros.otf（骨架化）" },
    note: "自动提取结果需人工/母语者校验；可手工微调点列、笔画顺序与连写点。",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), OUT_FILE)}　已填 ${filled}/94`);
})();
