#!/usr/bin/env node
/**
 * cursive（Écriture cursive）描红笔顺数据生成器 —— **路径 A：从字形提取中心线**（Phase 6 T6-08）
 *
 * 数据源：`assets/fonts/borel/Borel-Regular.otf`（**OFL-1.1** 开源、面向法国小学教学的 cursive 体；
 *         可用环境变量 `TRACE_CURSIVE_FONT` 切换到其它教学体，如 Belle Allure CE-Gros）
 *
 * 与旧版 `generate-cursive-trace.cjs`（路径 B：骨架取「最长路径」）的关键差异：
 *   1. **保留环（boucle）**：不再只取最长路径，而是"端点枚举 + 直行优先 + 未用边优先"的追踪，
 *      使 a/b/d/e/g/l/o 等带环字母能把环走完整；
 *   2. **保留分离部件**：`i`/`j` 的点、`t` 的横、`q` 的下伸茎、变音音符等独立部件不再被丢弃，
 *      按位置分类为 `diacritic`（xHeight 以上 / baseline 以下）或 `base`；
 *   3. **笔顺可控**：每个字母给出**起笔点提示**（`HINTS`），据此确定书写方向与起点。
 *
 * 用法：
 *   node scripts/generate-cursive-line.cjs            # 写入 data/trace/letter-strokes.json（保留 print）
 *   node scripts/generate-cursive-line.cjs --dry       # 只打印统计
 *   node scripts/generate-cursive-line.cjs --only=a,b  # 只生成指定字形
 *
 * ⚠️ 产出仍需内容轨 / 法语母语者对照参考图复核（T6-08 验收 ④）；
 *    单字微调请用 `npm run author:trace` 生成的录入/校正工具。
 */

"use strict";

const fs = require("fs");
const path = require("path");

const FONT = process.env.TRACE_CURSIVE_FONT
  ? path.resolve(process.env.TRACE_CURSIVE_FONT)
  : path.join(__dirname, "..", "assets", "fonts", "borel", "Borel-Regular.otf");
const OUT_FILE = path.join(__dirname, "..", "data", "trace", "letter-strokes.json");

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];
const TODAY = new Date().toISOString().slice(0, 10);

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;

// ── 字体度量（运行时从字体实测；y 向下）──────────────────────────
let M = { top: -986, xHeight: -486, baseline: 14, descender: 514 };
const GUIDE_TOP = 8;
const GUIDE_BOTTOM = 96;
let SCALE = (GUIDE_BOTTOM - GUIDE_TOP) / (M.descender - M.top);
function toY100(gy) { return GUIDE_TOP + (gy - M.top) * SCALE; }

const PX_H = 900;
const PX_W = 560;
const PAD = 10;
let PX_S = PX_H / (M.descender - M.top);

/** 从字体实测度量：`o` 定 xHeight/baseline，`l` 定 ascender，`g` 定 descender（自动适配任意教学体） */
function measureFont(font) {
  const range = (ch) => {
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) return null;
    const cds = pathToContours(g.getPath(0, 0, font.unitsPerEm).commands);
    const ys = [];
    cds.forEach((c) => c.forEach((p) => ys.push(p[1])));
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  };
  const o = range("o"), l = range("l"), g = range("g");
  M = {
    top: Math.min(l ? l[0] : -986, o ? o[0] : -486),
    xHeight: o ? o[0] : -486,
    baseline: o ? o[1] : 14,
    descender: Math.max(g ? g[1] : 514, o ? o[1] : 14),
  };
  SCALE = (GUIDE_BOTTOM - GUIDE_TOP) / (M.descender - M.top);
  PX_S = PX_H / (M.descender - M.top);
  return M;
}
const SPUR_MAX = 12; // 毛刺剪枝上限（px）

/** 起笔点提示（0-100 归一化；指导书写方向与起点） */
const HINTS = {
  a: [37, 58], b: [35, 60], c: [38, 58], d: [38, 58], e: [38, 58], f: [38, 60],
  g: [38, 58], h: [35, 60], i: [38, 58], j: [40, 48], k: [35, 60], l: [35, 60],
  m: [34, 58], n: [35, 58], o: [38, 58], p: [38, 60], q: [38, 58], r: [36, 58],
  s: [38, 58], t: [38, 58], u: [35, 58], v: [34, 58], w: [32, 58], x: [34, 58],
  y: [34, 58], z: [35, 58],
};

// ── 几何工具 ────────────────────────────────────────────────────
const cubic = (p0, p1, p2, p3, t) => { const mt = 1 - t; return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3; };
const quad = (p0, p1, p2, t) => { const mt = 1 - t; return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2; };
const round1 = (n) => Math.round(n * 10) / 10;

function pathToContours(cmds) {
  const contours = []; let cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
  for (const c of cmds) {
    if (c.type === "M") { if (cur && cur.length > 1) contours.push(cur); cur = [[c.x, c.y]]; cx = sx = c.x; cy = sy = c.y; }
    else if (!cur) continue;
    else if (c.type === "L") { cur.push([c.x, c.y]); cx = c.x; cy = c.y; }
    else if (c.type === "C") { for (let i = 1; i <= 16; i++) { const t = i / 16; cur.push([cubic(cx, c.x1, c.x2, c.x, t), cubic(cy, c.y1, c.y2, c.y, t)]); } cx = c.x; cy = c.y; }
    else if (c.type === "Q") { for (let i = 1; i <= 12; i++) { const t = i / 12; cur.push([quad(cx, c.x1, c.x, t), quad(cy, c.y1, c.y, t)]); } cx = c.x; cy = c.y; }
    else if (c.type === "Z") { cur.push([sx, sy]); cx = sx; cy = sy; }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}

function rasterize(contours, W, H, toPx) {
  const bmp = new Uint8Array(W * H); const edges = [];
  for (const c of contours) {
    const pts = c.map(toPx);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]]); }
  }
  for (let py = 0; py < H; py++) {
    const yc = py + 0.5, xs = [];
    for (const [x0, y0, x1, y1] of edges) {
      const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
      if (yc < ymin || yc >= ymax) continue;
      const t = (yc - y0) / (y1 - y0); xs.push([x0 + t * (x1 - x0), y1 > y0 ? 1 : -1]);
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a[0] - b[0]);
    let w = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      w += xs[i][1];
      if (w !== 0) {
        const xa = Math.max(0, Math.ceil(xs[i][0] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[i + 1][0] - 0.5));
        for (let px = xa; px <= xb; px++) bmp[py * W + px] = 1;
      }
    }
  }
  return bmp;
}

function thin(bmp, W, H) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : bmp[y * W + x]);
  let changed = true; const rm = [];
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      rm.length = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!bmp[y * W + x]) continue;
        const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1),
          p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) + (p4 === 0 && p5 === 1 ? 1 : 0) + (p5 === 0 && p6 === 1 ? 1 : 0) + (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) + (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0);
        if (A !== 1) continue;
        if (step === 0) { if (p2 * p4 * p6 !== 0) continue; if (p4 * p6 * p8 !== 0) continue; }
        else { if (p2 * p4 * p8 !== 0) continue; if (p2 * p6 * p8 !== 0) continue; }
        rm.push(y * W + x);
      }
      if (rm.length) { changed = true; for (const i of rm) bmp[i] = 0; }
    }
  }
  return bmp;
}

const N8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const SEQ8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function neighbors(bmp, W, H, x, y) {
  const o = [];
  for (const [dx, dy] of N8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && bmp[ny * W + nx]) o.push([nx, ny]);
  }
  return o;
}

function crossing(bmp, W, H, x, y) {
  const at = (a, b) => (a < 0 || b < 0 || a >= W || b >= H ? 0 : bmp[b * W + a]);
  const vals = SEQ8.map(([dx, dy]) => at(x + dx, y + dy));
  let A = 0; for (let i = 0; i < 8; i++) if (vals[i] === 0 && vals[(i + 1) % 8] === 1) A++;
  return { A, B: vals.reduce((a, b) => a + b, 0) };
}

function components(bmp, W, H) {
  const seen = new Uint8Array(W * H); const comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = y * W + x;
    if (!bmp[id] || seen[id]) continue;
    const comp = [], stack = [[x, y]]; seen[id] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop(); comp.push([cx, cy]);
      for (const [nx, ny] of neighbors(bmp, W, H, cx, cy)) {
        const nid = ny * W + nx;
        if (!seen[nid]) { seen[nid] = 1; stack.push([nx, ny]); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

function pruneSpurs(bmp, W, H, lim) {
  for (let iter = 0; iter < 8; iter++) {
    const eps = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bmp[y * W + x] && crossing(bmp, W, H, x, y).B === 1) eps.push([x, y]);
    let removed = false;
    for (const [x, y] of eps) {
      if (!bmp[y * W + x]) continue;
      const branch = [[x, y]]; let prev = null, cur = [x, y], hit = false;
      for (let s = 0; s < lim + 4; s++) {
        const c = neighbors(bmp, W, H, cur[0], cur[1]).filter((n) => !(prev && n[0] === prev[0] && n[1] === prev[1]));
        if (!c.length) break;
        if (c.length > 1) { hit = true; break; }
        prev = cur; cur = c[0]; branch.push(cur);
      }
      if (!hit && branch.length <= lim) { for (const [bx, by] of branch) bmp[by * W + bx] = 0; removed = true; }
    }
    if (!removed) break;
  }
  return bmp;
}

/** 直行优先 + 未用边优先的追踪 */
function trace(bmp, W, H, start, first) {
  const used = new Set();
  const path = [start, first];
  used.add(start.join() + ">" + first.join());
  let prev = start, cur = first;
  for (let step = 0; step < W * H; step++) {
    const dx0 = cur[0] - prev[0], dy0 = cur[1] - prev[1], dl = Math.hypot(dx0, dy0) || 1;
    const dir = [dx0 / dl, dy0 / dl];
    const cand = neighbors(bmp, W, H, cur[0], cur[1]).filter((n) => !(n[0] === prev[0] && n[1] === prev[1]));
    if (!cand.length) break;
    let best = null, bs = -Infinity;
    for (const c of cand) {
      const vx = c[0] - cur[0], vy = c[1] - cur[1], vl = Math.hypot(vx, vy) || 1;
      const dot = (vx / vl) * dir[0] + (vy / vl) * dir[1];
      const fresh = used.has(cur.join() + ">" + c.join()) ? 0 : 20;
      const score = fresh + dot * 10 - vl * 0.001;
      if (score > bs) { bs = score; best = c; }
    }
    if (!best) break;
    used.add(cur.join() + ">" + best.join());
    prev = cur; cur = best; path.push(cur);
    if (crossing(bmp, W, H, cur[0], cur[1]).B === 1 && path.length > 3) break;
  }
  return path;
}

/** 追踪一个连通分量：端点枚举 + 提示点，取最长；再按提示定向 */
function traceComponent(bmp, W, H, compSet, hintPx) {
  const starts = [];
  for (const [x, y] of compSet) {
    if (!bmp[y * W + x]) continue;
    if (crossing(bmp, W, H, x, y).B === 1) starts.push([x, y]);
  }
  let hintNearest = null, bd = Infinity;
  for (const [x, y] of compSet) {
    if (!bmp[y * W + x]) continue;
    const d = Math.hypot(x - hintPx[0], y - hintPx[1]);
    if (d < bd) { bd = d; hintNearest = [x, y]; }
  }
  if (hintNearest) starts.push(hintNearest);

  // 沿分量采样补充起点：闭碗等没有端点的部分也需要能作为起点被尝试
  const arr = [...compSet];
  const stride = Math.max(1, Math.floor(arr.length / 40));
  for (let i = 0; i < arr.length; i += stride) if (bmp[arr[i][1] * W + arr[i][0]]) starts.push(arr[i]);

  let bestPath = [], bestScore = -1;
  for (const s of starts) {
    for (const f of neighbors(bmp, W, H, s[0], s[1])) {
      const p = trace(bmp, W, H, s, f);
      const cov = new Set(p.map((q) => q.join())).size;
      const backtrack = p.length - cov; // 折返（重复经过）像素数
      const score = cov * 1000 - backtrack * 20; // 覆盖优先，折返惩罚
      if (score > bestScore) { bestScore = score; bestPath = p; }
    }
  }
  if (bestPath.length > 2) {
    const dh = Math.hypot(bestPath[0][0] - hintPx[0], bestPath[0][1] - hintPx[1]);
    const dt = Math.hypot(bestPath[bestPath.length - 1][0] - hintPx[0], bestPath[bestPath.length - 1][1] - hintPx[1]);
    if (dt < dh) bestPath = bestPath.slice().reverse();
  }
  return bestPath;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const first = pts[0], last = pts[pts.length - 1];
  let idx = -1, maxD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = last[0] - first[0], dy = last[1] - first[1], l2 = dx * dx + dy * dy;
    let t = l2 === 0 ? 0 : ((pts[i][0] - first[0]) * dx + (pts[i][1] - first[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(pts[i][0] - (first[0] + t * dx), pts[i][1] - (first[1] + t * dy));
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps && idx > 0) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [first, last];
}

function simplifyToRange(pts, maxPts, minPts) {
  let eps = 1.2, out = rdp(pts, eps), g = 0;
  while (out.length > maxPts && g++ < 80) { eps *= 1.15; out = rdp(pts, eps); }
  if (out.length < minPts && pts.length > minPts) {
    let e = eps;
    for (let i = 0; i < 24; i++) {
      e *= 0.7;
      const c = rdp(pts, e);
      out = c;
      if (c.length >= minPts) break;
    }
  }
  if (out.length > maxPts) {
    // 兜底：等间隔降采样（自重叠路径 RDP 难以压缩）
    const r = [];
    for (let i = 0; i < maxPts; i++) r.push(out[Math.round((i * (out.length - 1)) / (maxPts - 1))]);
    out = r;
  }
  return out;
}

// ── 单字形提取 ──────────────────────────────────────────────────
function extractGlyph(font, glyph) {
  const g = font.charToGlyph(glyph);
  if (!g || g.index === 0) return null;
  const cds = pathToContours(g.getPath(0, 0, 1000).commands);
  const bb = g.getBoundingBox();
  const cx = (bb.x1 + bb.x2) / 2;
  const W = PX_W + PAD * 2, H = PX_H + PAD * 2;
  const toPx = ([fx, fy]) => [(fx - cx) * PX_S + W / 2, (fy - M.top) * PX_S + PAD];
  const to100 = ([px, py]) => [round1(50 + (px - W / 2) / PX_S * SCALE), round1(GUIDE_TOP + (py - PAD) / PX_S * SCALE)];
  const from100 = ([x, y]) => [W / 2 + (x - 50) * (1 / SCALE), PAD + (y - GUIDE_TOP) * (1 / SCALE)];

  const bmp = rasterize(cds, W, H, toPx);
  const filledComps = components(bmp, W, H);
  if (process.env.DBG) console.log(`   [${glyph}] filled=${filledComps
    .map((c) => {
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      return `${c.length}(${Math.max(...xs) - Math.min(...xs)}x${Math.max(...ys) - Math.min(...ys)})`;
    })
    .sort()
    .join(",")}`);
  thin(bmp, W, H);

  const xHi = toY100(M.xHeight), xBase = toY100(M.baseline);
  const comps = components(bmp, W, H).sort((a, b) => b.length - a.length);
  if (process.env.DBG) console.log(`   [${glyph}] comps=${comps.map((c) => c.length).join(",")}`);
  const hint = HINTS[glyph] || HINTS[glyph.normalize("NFD")[0].toLowerCase()] || [36, 58];
  const hintPx = from100(hint);

  const strokes = [];
  const isAccented = ACCENTED.includes(glyph);

  // 小填充分量（点，如 i/j 的点）：细化后会消失 → 直接用包围盒生成短笔画
  for (const c of filledComps) {
    if (c.length > 9000) continue;
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (Math.max(w, h) > 110) continue; // 细长的不算点
    const cxy = to100([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
    const half = Math.max(1, Math.min(3, (h * SCALE) / 2));
    const kind = cxy[1] < xHi || cxy[1] > xBase ? "diacritic" : "base";
    strokes.push({ kind, points: [[cxy[0], round1(cxy[1] - half)], [cxy[0], round1(cxy[1] + half)]], size: c.length });
  }

  comps.forEach((comp, ci) => {
    // 仅在该分量上做剪枝 + 追踪
    const set = new Set(comp.map(([x, y]) => y * W + x));
    const sub = new Uint8Array(W * H);
    for (const k of set) sub[k] = 1;
    if (comp.length > 60) pruneSpurs(sub, W, H, SPUR_MAX); // 小分量（点/音符）不剪枝
    const alive = comp.filter(([x, y]) => sub[y * W + x]);
    if (alive.length < 4) return;
    const p = traceComponent(sub, W, H, alive, hintPx);
    if (p.length < 2) return;

    const pts100 = p.map(([x, y]) => to100([x, y]));
    const simp = simplifyToRange(pts100, 24, Math.min(8, 6 + ci));
    if (simp.length < 2) return;
    const ys = simp.map((q) => q[1]);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const kind = yMax < xHi ? "diacritic" : yMin > xBase ? "diacritic" : "base";
    strokes.push({ kind, points: simp, size: alive.length });

    // 孤立「横向」骨架（如 Borel 的 t 横杠：与竖笔连通，直行优先会被略过）→ 按包围盒补一条横
    const cov = new Set(p.map((q) => q.join()));
    const rest = alive.filter(([x, y]) => !cov.has([x, y].join()));
    if (rest.length >= 40) {
      const restSet = new Set(rest.map(([x, y]) => y * W + x));
      const seenR = new Set();
      const hbar = [];
      for (const [x, y] of rest) {
        if (seenR.has(y * W + x)) continue;
        const grp = [], stack = [[x, y]];
        seenR.add(y * W + x);
        while (stack.length) {
          const [cx2, cy2] = stack.pop();
          grp.push([cx2, cy2]);
          for (const nb of neighbors(sub, W, H, cx2, cy2)) {
            const kk = nb[1] * W + nb[0];
            if (restSet.has(kk) && !seenR.has(kk)) { seenR.add(kk); stack.push(nb); }
          }
        }
        const gxs = grp.map((q2) => q2[0]), gys = grp.map((q2) => q2[1]);
        const gw = Math.max(...gxs) - Math.min(...gxs), gh = Math.max(...gys) - Math.min(...gys);
        if (gh <= 8 && gw >= 50) hbar.push(...grp);
      }
      if (hbar.length >= 40) {
        const xs2 = hbar.map((q2) => q2[0]), ys2 = hbar.map((q2) => q2[1]);
        const yMid = (Math.min(...ys2) + Math.max(...ys2)) / 2;
        const A = to100([Math.min(...xs2), yMid]), B = to100([Math.max(...xs2), yMid]);
        const line = [];
        for (let k = 0; k < 6; k++) line.push([round1(A[0] + (B[0] - A[0]) * (k / 5)), round1(A[1] + (B[1] - A[1]) * (k / 5))]);
        strokes.push({ kind: "base", points: line, size: hbar.length });
      }
    }
  });

  // 变音字形仍无音符（如 ç 的下加符与 c 连通、且追踪时被略过）：取骨架中低于基线的部分
  if (isAccented && !strokes.some((s) => s.kind === "diacritic")) {
    const below = comps[0].filter(([x, y]) => {
      if (!bmp[y * W + x]) return false;
      return to100([x, y])[1] > xBase + 1;
    });
    if (below.length > 12) {
      const subB = new Uint8Array(W * H);
      for (const [x, y] of below) subB[y * W + x] = 1;
      const pb = traceComponent(subB, W, H, below, below[0]);
      const ptsB = pb.map(([x, y]) => to100([x, y]));
      const simpB = simplifyToRange(ptsB, 24, 2);
      if (simpB.length >= 2) strokes.push({ kind: "diacritic", points: simpB, size: below.length });
    }
  }

  // base 在前、diacritic 在后；base 内按面积降序（主笔画在前）
  const base = strokes.filter((s) => s.kind === "base").sort((a, b) => b.size - a.size);
  let dia = strokes.filter((s) => s.kind === "diacritic").sort((a, b) => a.points[0][1] - b.points[0][1]);
  if (!base.length && dia.length) { base.push(dia.shift()); base[0].kind = "base"; }
  if (!base.length) return null;

  // 变音字形：若没有 diacritic（如 ç 的下加符与 c 连通），按 baseline 切分
  if (isAccented && !dia.length && base.length === 1) {
    const pts = base[0].points;
    const cut = xBase + 3;
    const bPts = pts.filter((q) => q[1] <= cut);
    const dPts = pts.filter((q) => q[1] > cut);
    if (bPts.length >= 2 && dPts.length >= 2) {
      base[0].points = bPts;
      dia = [{ kind: "diacritic", points: dPts, size: dPts.length }];
    }
  }

  return {
    strokes: [...base.map((s) => ({ kind: "base", points: s.points })), ...dia.map((s) => ({ kind: "diacritic", points: s.points }))],
    guides: {
      ascender: round1(GUIDE_TOP),
      capHeight: round1(GUIDE_TOP),
      xHeight: round1(xHi),
      baseline: round1(xBase),
      descender: round1(GUIDE_BOTTOM),
      slant: 18,
    },
  };
}

// ── 主流程 ──────────────────────────────────────────────────────
(async () => {
  const mod = await import("opentype.js");
  const opentype = mod.default || mod;
  if (!fs.existsSync(FONT)) { console.error(`❌ 缺少字体：${FONT}`); process.exit(1); }
  const buf = fs.readFileSync(FONT);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const mt = measureFont(font);
  console.log(`字体：${path.basename(FONT)}　度量：top=${mt.top} xHeight=${mt.xHeight} baseline=${mt.baseline} descender=${mt.descender}`);

  let out = {};
  if (fs.existsSync(OUT_FILE)) {
    try { out = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { out = {}; }
  }
  delete out._meta;

  const targets = [...LOWER, ...ACCENTED].filter((g) => !only || only.includes(g));
  const report = [];
  for (const glyph of targets) {
    const res = extractGlyph(font, glyph);
    if (!res) { report.push(`${glyph}: 提取失败`); continue; }
    const base = res.strokes.filter((s) => s.kind === "base");
    const dia = res.strokes.filter((s) => s.kind === "diacritic");
    const connect = {
      entry: base[0].points[0].slice(),
      exit: base[base.length - 1].points[base[base.length - 1].points.length - 1].slice(),
    };
    out[`cursive:${glyph}`] = {
      key: `cursive:${glyph}`,
      glyph,
      style: "cursive",
      langs: ["fr"],
      viewBox: { w: 100, h: 100 },
      guides: res.guides,
      strokes: res.strokes,
      connect,
      source: {
        by: "内容轨（路径A·中心线·cursive 提取）",
        date: TODAY,
        note: `中心线提取（scripts/generate-cursive-line.cjs）：base ${base.length}${dia.length ? ` + 音符 ${dia.length}` : ""}；待母语者对照参考图复核`,
      },
    };
    report.push(`${glyph}: base ${base.length} 笔 / 音符 ${dia.length} / 共 ${res.strokes.reduce((n, s) => n + s.points.length, 0)} 点`);
  }

  out._meta = {
    generator: "scripts/generate-print-trace.cjs（print·路径A）+ scripts/generate-cursive-line.cjs（cursive·路径A 提取）",
    fonts: {
      print: "手工中心线定义（路径A）",
      cursive: "BelleAllureCE-Gros.otf（轮廓→骨架→中心线追踪；保留环与分离部件）",
    },
    note: "print 与 cursive 均按路径A 生成中心线；仍需人工 / 法语母语者对照 cursive-reference 复核并留档（T6-08 验收④）。",
    updatedAt: TODAY,
  };

  console.log("—— cursive 中心线提取 ——");
  console.log(report.join("\n"));
  if (dry) { console.log("\n[dry-run] 未写文件。"); process.exit(0); }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  const filled = Object.entries(out).filter(([k, v]) => k !== "_meta" && v).length;
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), OUT_FILE)}　已填 ${filled}/94`);
  console.log("   下一步：npm run check:trace → npm run preview:trace（对照参考图复核）");
})();
