#!/usr/bin/env node
/**
 * 描红笔顺「录入 / 校正」工具生成器（Phase 6 T6-08 内容轨配套工具）
 *
 * 目的：给内容轨一个**离线单文件网页**，用于按书写规范**手绘中心线**（路径 A），
 *       或在自动提取结果上**校正**笔画顺序 / 起笔方向 / 连写点，并直接导出合法 JSON。
 *
 * 与既有工具的互补关系：
 *   - scripts/validate-trace-data.cjs  管「数据合法」（结构 / 坐标 / 连线）
 *   - scripts/preview-trace-data.cjs   管「写得对不对」（只看，不改）
 *   - 本工具                             管「怎么改」（可交互录入 / 校正 / 导出）
 *
 * 功能：
 *   1. 左侧按 5 个批次列出全部 94 字形；右侧为 0–100 四线格编辑器；
 *   2. 「绘制」模式：鼠标 / 触控在格内描中心线，松手自动按弧长重采样为 6–24 点；
 *   3. 笔画管理：选中 / 反转方向 / 删除 / 上移下移 / 切换 base↔diacritic / 平滑开关；
 *   4. cursive 连写点：一键取「首笔首点 → entry」「末笔末点 → exit」；
 *   5. 参考叠加：系统字体字形 + 可加载参考图（file:// 本地读取，不联网）；
 *   6. 实时校验（镜像 validate 规则）+ 导出（当前字形 / 全部 / 导入 JSON）；
 *   7. localStorage 自动暂存，避免刷新丢稿。
 *
 * 用法：
 *   node scripts/trace-authoring.cjs                 # → data/trace/authoring.html（双击即开）
 *   node scripts/trace-authoring.cjs out.html        # 自定义输出
 *
 * 注意：本工具不参与构建 / 不联网；导出的 JSON 仍需人工复核与 `npm run check:trace --strict`。
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "trace", "letter-strokes.json");

const argv = process.argv.slice(2);
const outArg = argv.find((a) => !a.startsWith("--"));
const OUT = outArg ? path.resolve(process.cwd(), outArg) : path.join(ROOT, "data", "trace", "authoring.html");

// ── 94 字形键（规范顺序）───────────────────────────────────────────
const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];
const KEYS = [
  ...UPPER.map((g) => `print:${g}`),
  ...LOWER.map((g) => `print:${g}`),
  ...LOWER.map((g) => `cursive:${g}`),
  ...ACCENTED.map((g) => `print:${g}`),
  ...ACCENTED.map((g) => `cursive:${g}`),
];

// ── 读取现有数据（缺失则空）────────────────────────────────────────
let glyphs = {};
let meta = {};
if (fs.existsSync(SRC)) {
  try {
    const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
    meta = raw._meta || {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === "_meta") continue;
      if (v && typeof v === "object") glyphs[k] = v;
    }
  } catch (err) {
    console.warn(`⚠️  读取 ${path.relative(ROOT, SRC)} 失败：${err.message}（以空数据启动）`);
  }
}

const filled = KEYS.filter((k) => glyphs[k] && Array.isArray(glyphs[k].strokes) && glyphs[k].strokes.length).length;

const payload = {
  generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  meta,
  keys: KEYS,
  glyphs,
  filled,
  total: KEYS.length,
};

// ── 客户端脚本（刻意避免模板字符串 / 反引号，防止与生成器模板冲突）──
const CLIENT_JS = `
(function () {
  var DATA = __PAYLOAD__;
  var LS_KEY = "trace-authoring-v1";

  var LINES = [
    ["ascender", "asc", "上伸线"],
    ["capHeight", "cap", "大写线"],
    ["xHeight", "xh", "主体线"],
    ["baseline", "base", "基线"],
    ["descender", "desc", "下伸线"]
  ];

  var BATCHES = [
    { id: "upper", name: "① print 大写", test: function (g) { return g.style === "print" && /^[A-Z]$/.test(g.glyph); } },
    { id: "lower", name: "② print 小写", test: function (g) { return g.style === "print" && /^[a-z]$/.test(g.glyph); } },
    { id: "cur", name: "③ cursive 小写", test: function (g) { return g.style === "cursive" && /^[a-z]$/.test(g.glyph); } },
    { id: "acc", name: "④ print 变音", test: function (g) { return g.style === "print" && !/^[A-Za-z]$/.test(g.glyph); } },
    { id: "curacc", name: "⑤ cursive 变音", test: function (g) { return g.style === "cursive" && !/^[A-Za-z]$/.test(g.glyph); } }
  ];

  function styleOf(key) { return key.split(":")[0]; }
  function glyphOf(key) { return key.slice(key.indexOf(":") + 1); }

  function skeleton(key) {
    var style = styleOf(key), glyph = glyphOf(key);
    var letter = /^[A-Za-z]$/.test(glyph);
    return {
      key: key, glyph: glyph, style: style,
      langs: (style === "print" && letter) ? ["en", "fr"] : ["fr"],
      viewBox: { w: 100, h: 100 },
      guides: style === "cursive"
        ? { ascender: 8, capHeight: 20, xHeight: 38, baseline: 74, descender: 96, slant: 18 }
        : { ascender: 12, capHeight: 12, xHeight: 40, baseline: 78, descender: 96 },
      strokes: [],
      source: { by: "内容轨（路径A）", date: new Date().toISOString().slice(0, 10), note: "" }
    };
  }

  // ── 采样（与 generate-print-trace.cjs 一致的简化版）──────────────
  function dedupe(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], l = out[out.length - 1];
      if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.01) out.push([p[0], p[1]]);
    }
    return out;
  }

  function cr(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return [
      0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  }

  function smoothPath(pts) {
    if (pts.length < 3) return pts.slice();
    var n = pts.length, dense = [pts[0]];
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var steps = 16;
      for (var s = 1; s <= steps; s++) dense.push(cr(p0, p1, p2, p3, s / steps));
    }
    return dense;
  }

  function resample(pts, smooth) {
    pts = dedupe(pts);
    if (pts.length < 2) return pts;
    var dense = smooth ? smoothPath(pts) : pts.slice();
    var cum = [0], total = 0;
    for (var i = 1; i < dense.length; i++) {
      total += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
      cum.push(total);
    }
    var N = Math.max(6, Math.min(24, Math.round(total / 3.5)));
    var out = [];
    for (var k = 0; k < N; k++) {
      var target = total * (k / (N - 1));
      var j = 1;
      while (j < cum.length - 1 && cum[j] < target) j++;
      var d0 = cum[j - 1], d1 = cum[j] || (d0 + 1e-6);
      var r = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
      var a = dense[j - 1], b = dense[j];
      out.push([
        Math.round((a[0] + (b[0] - a[0]) * r) * 10) / 10,
        Math.round((a[1] + (b[1] - a[1]) * r) * 10) / 10
      ]);
    }
    return dedupe(out);
  }

  // ── 校验（镜像 scripts/validate-trace-data.cjs）──────────────────
  function isPoint(p) { return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]); }
  function nearest(a, b, tol) { return isPoint(a) && isPoint(b) && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol; }

  function validate(key, e) {
    var err = [];
    var style = styleOf(key), glyph = glyphOf(key);
    var letter = /^[A-Za-z]$/.test(glyph);
    var accented = !letter;
    var wantLangs = (style === "print" && letter) ? ["en", "fr"] : ["fr"];

    if (e.style !== style) err.push("style 应为 " + style);
    if (e.glyph !== glyph) err.push("glyph 应为 " + glyph);
    if (JSON.stringify(e.langs) !== JSON.stringify(wantLangs)) err.push("langs 应为 " + JSON.stringify(wantLangs));

    var g = e.guides || {};
    var gn = [g.ascender, g.capHeight, g.xHeight, g.baseline, g.descender];
    for (var i = 0; i < gn.length; i++) if (typeof gn[i] !== "number" || !isFinite(gn[i])) err.push("guides 缺少数值");
    if (gn.every(function (v) { return typeof v === "number" && isFinite(v); })) {
      if (gn.some(function (v) { return v < 0 || v > 100; })) err.push("guides 须 ∈ [0,100]");
      if (!(g.ascender <= g.capHeight && g.capHeight < g.xHeight && g.xHeight < g.baseline && g.baseline < g.descender))
        err.push("guides 须 ascender ≤ capHeight < xHeight < baseline < descender");
    }
    if (g.slant !== undefined && (typeof g.slant !== "number" || g.slant < 0 || g.slant > 45)) err.push("slant 须 ∈ [0,45]");

    if (!e.source || !e.source.by) err.push("缺少 source.by");
    if (!e.source || !e.source.date) err.push("缺少 source.date");

    if (!Array.isArray(e.strokes) || !e.strokes.length) { err.push("尚无笔画（待填）"); return err; }

    var baseIdx = [], diaIdx = [];
    e.strokes.forEach(function (s, idx) {
      if (s.kind !== "base" && s.kind !== "diacritic") err.push("strokes[" + idx + "].kind 非法");
      if (!Array.isArray(s.points) || s.points.length < 2) err.push("strokes[" + idx + "].points 须 ≥ 2");
      else s.points.forEach(function (p, pi) {
        if (!isPoint(p)) err.push("strokes[" + idx + "].points[" + pi + "] 非法");
        else if (p[0] < 0 || p[0] > 100 || p[1] < 0 || p[1] > 100) err.push("坐标越界 " + JSON.stringify(p));
      });
      if (s.kind === "base") baseIdx.push(idx);
      if (s.kind === "diacritic") diaIdx.push(idx);
    });

    if (accented) {
      if (!diaIdx.length) err.push("变音字形缺少 diacritic 笔画");
      else if (baseIdx.some(function (b) { return diaIdx.some(function (d) { return b > d; }); })) err.push("diacritic 须排在所有 base 之后");
    }

    if (style === "cursive") {
      if (!e.connect || !isPoint(e.connect.entry) || !isPoint(e.connect.exit)) err.push("cursive 必须提供 connect.entry / exit");
      else {
        var fb = null, lb = null;
        for (var i2 = 0; i2 < e.strokes.length; i2++) { if (e.strokes[i2].kind === "base") { if (!fb) fb = e.strokes[i2]; lb = e.strokes[i2]; } }
        if (fb && !nearest(e.connect.entry, fb.points[0], 2)) err.push("connect.entry 与 base 首点不一致（±2）");
        if (lb && !nearest(e.connect.exit, lb.points[lb.points.length - 1], 2)) err.push("connect.exit 与 base 末点不一致（±2）");
      }
    }
    return err;
  }

  function flagsOf(e) {
    var out = [];
    var base = e.strokes.filter(function (s) { return s.kind === "base"; });
    var dia = e.strokes.filter(function (s) { return s.kind === "diacritic"; });
    if (e.style === "print") {
      var isUpper = /^[A-Z]$/.test(e.glyph), limit = isUpper ? 3 : 2;
      if (base.length > limit) out.push("base " + base.length + " 笔，超规格上限 " + limit);
    }
    if (e.style === "cursive") {
      if (typeof e.guides.slant !== "number") out.push("未设 slant");
      if (!e.connect) out.push("缺少 connect");
      if (base.length > 1 && !/^[ij]$/.test(e.glyph)) out.push("base " + base.length + " 笔（cursive 通常一笔）");
    }
    if (!/^[A-Za-z]$/.test(e.glyph) && dia.length === 0) out.push("变音字形缺少 diacritic");
    e.strokes.forEach(function (s, i) { var n = s.points.length; if (n < 6 || n > 24) out.push("第 " + (i + 1) + " 笔点数 " + n + "（建议 6–24）"); });
    return out;
  }

  // ── 状态 ────────────────────────────────────────────────────────
  var working = {};
  var dirty = {};
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved && saved.working) { working = saved.working; dirty = saved.dirty || {}; }
  } catch (e) {}

  var state = {
    key: DATA.keys[0],
    mode: "browse",
    pick: [],
    kind: "base",
    smooth: false,
    sel: -1,
    ghost: true,
    guideOn: true,
    refImg: null,
    refOpacity: 0.35,
    raw: null
  };
  var history = [];

  function entryOf(key) {
    if (working[key]) return working[key];
    if (DATA.glyphs[key]) return JSON.parse(JSON.stringify(DATA.glyphs[key]));
    return skeleton(key);
  }
  function cur() { return working[state.key] || (working[state.key] = entryOf(state.key)); }
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify({ working: working, dirty: dirty })); } catch (e) {} }
  function snapshot() { history.push(JSON.stringify(working)); if (history.length > 60) history.shift(); }
  function undo() {
    if (!history.length) return;
    working = JSON.parse(history.pop());
    persist(); renderAll();
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ── 渲染：编辑器 ────────────────────────────────────────────────
  function guideSvg(e) {
    if (!state.guideOn) return "";
    var gd = e.guides, s = "";
    for (var i = 0; i < LINES.length; i++) {
      var y = gd[LINES[i][0]];
      if (typeof y !== "number") continue;
      s += '<line x1="0" y1="' + y + '" x2="100" y2="' + y + '" class="gl ' + LINES[i][1] + '"/>';
    }
    var slant = typeof gd.slant === "number" ? gd.slant : e.style === "cursive" ? 15 : 0;
    if (slant) {
      var dx = Math.tan((slant * Math.PI) / 180) * 100;
      for (var k = 20; k <= 100; k += 20)
        s += '<line x1="' + k + '" y1="0" x2="' + (k - dx) + '" y2="100" class="gl slant' + (typeof gd.slant === "number" ? "" : " assumed") + '"/>';
    }
    return s;
  }

  function ghostSvg(e) {
    if (!state.ghost || e.style !== "print") return "";
    var gd = e.guides, isUpper = /^[A-Z]$/.test(e.glyph);
    var span = isUpper ? gd.baseline - gd.capHeight : gd.baseline - gd.xHeight;
    var size = Math.max(8, span / (isUpper ? 0.7 : 0.5));
    return '<text x="50" y="' + gd.baseline + '" class="ghost" text-anchor="middle" dominant-baseline="alphabetic" font-size="' + size.toFixed(1) + '">' + esc(e.glyph) + "</text>";
  }

  function strokeSvg(e, i) {
    var pts = e.strokes[i].points, d = "";
    for (var j = 0; j < pts.length; j++) d += (j ? " " : "") + pts[j][0] + "," + pts[j][1];
    return '<polyline points="' + d + '" class="st ' + e.strokes[i].kind + (i === state.sel ? " sel" : "") + '" data-i="' + i + '"/>';
  }

  function markerSvg(e, i) {
    var pts = e.strokes[i].points, p0 = pts[0], p1 = pts[1] || pts[0], kind = e.strokes[i].kind, s = "";
    s += '<circle cx="' + p0[0] + '" cy="' + p0[1] + '" r="6" class="sdot ' + kind + (i === state.sel ? " sel" : "") + '"/>';
    s += '<text x="' + p0[0] + '" y="' + p0[1] + '" class="snum">' + (i + 1) + "</text>";
    var a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), tip = 12;
    var ax = p0[0] + Math.cos(a) * tip, ay = p0[1] + Math.sin(a) * tip;
    var bx = ax - Math.cos(a) * 6.5, by = ay - Math.sin(a) * 6.5;
    var nx = -Math.sin(a) * 3.6, ny = Math.cos(a) * 3.6;
    s += '<polygon class="arrow ' + kind + '" points="' + ax + "," + ay + " " + (bx + nx) + "," + (by + ny) + " " + (bx - nx) + "," + (by - ny) + '"/>';
    return s;
  }

  function editorSvg(e) {
    var s = '<svg id="board" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">';
    s += '<rect x="0" y="0" width="100" height="100" class="bg"/>';
    if (state.refImg) s += '<image href="' + state.refImg + '" x="0" y="0" width="100" height="100" opacity="' + state.refOpacity + '" preserveAspectRatio="none"/>';
    s += guideSvg(e) + ghostSvg(e);
    for (var i = 0; i < e.strokes.length; i++) s += strokeSvg(e, i);
    if (e.connect) {
      var en = e.connect.entry, ex = e.connect.exit;
      s += '<rect x="' + (en[0] - 2.6) + '" y="' + (en[1] - 2.6) + '" width="5.2" height="5.2" class="mk entry"/>';
      s += '<rect x="' + (ex[0] - 2.6) + '" y="' + (ex[1] - 2.6) + '" width="5.2" height="5.2" class="mk exit"/>';
    }
    for (var m = 0; m < e.strokes.length; m++) s += markerSvg(e, m);
    for (var pi = 0; pi < state.pick.length; pi++) {
      var pk = state.pick[pi];
      var pt = e.strokes[pk.s] && e.strokes[pk.s].points[pk.p];
      if (!pt) continue;
      s += '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="5.5" class="pick ' + (pi === 0 ? "pk-entry" : "pk-exit") + '"/>';
      s += '<text x="' + pt[0] + '" y="' + pt[1] + '" class="snum">' + (pi === 0 ? "S" : "E") + "</text>";
    }
    if (state.raw && state.raw.length) {
      var d = "";
      for (var r = 0; r < state.raw.length; r++) d += (r ? " " : "") + state.raw[r][0] + "," + state.raw[r][1];
      s += '<polyline points="' + d + '" class="st" style="stroke:#0ea5e9;stroke-width:1.6;opacity:.75"/>';
    }
    s += "</svg>";
    return s;
  }

  // ── 渲染：侧栏 / 面板 ───────────────────────────────────────────
  function sidebarHtml() {
    var html = "";
    for (var b = 0; b < BATCHES.length; b++) {
      var batch = BATCHES[b];
      var keys = DATA.keys.filter(function (k) {
        var e = entryOf(k);
        return batch.test(e);
      });
      if (!keys.length) continue;
      html += '<div class="grp"><h3>' + esc(batch.name) + '<span>' + keys.length + "</span></h3><div class='items'>";
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], e = entryOf(k);
        var n = e.strokes.length;
        var warn = flagsOf(e).length;
        var cls = "item" + (k === state.key ? " on" : "") + (n ? "" : " empty");
        if (dirty[k]) cls += " dirty";
        html += '<button class="' + cls + '" data-key="' + esc(k) + '">' +
          '<b>' + esc(e.glyph) + "</b>" +
          '<span class="k">' + esc(k) + "</span>" +
          '<span class="n">' + (n ? n + "×" : "—") + "</span>" +
          (warn ? '<span class="w">⚠</span>' : "") +
          "</button>";
      }
      html += "</div></div>";
    }
    return html;
  }

  function strokesPanel(e) {
    var html = '<div class="sec"><h4>笔画（顺序 = 书写顺序）</h4><div class="list">';
    if (!e.strokes.length) html += '<p class="mut">尚无笔画：切到「绘制」在格内描中心线。</p>';
    for (var i = 0; i < e.strokes.length; i++) {
      var s = e.strokes[i], n = s.points.length;
      var bad = n < 6 || n > 24;
      html += '<div class="row' + (i === state.sel ? " on" : "") + '" data-i="' + i + '">' +
        '<span class="idx">' + (i + 1) + "</span>" +
        '<span class="kd ' + s.kind + '">' + (s.kind === "base" ? "base" : "音符") + "</span>" +
        '<span class="pt' + (bad ? " bad" : "") + '">' + n + " 点</span>" +
        '<button data-act="sel" data-i="' + i + '">选</button>' +
        '<button data-act="rev" data-i="' + i + '">反转</button>' +
        '<button data-act="kind" data-i="' + i + '">切类型</button>' +
        '<button data-act="up" data-i="' + i + '">↑</button>' +
        '<button data-act="down" data-i="' + i + '">↓</button>' +
        '<button data-act="del" data-i="' + i + '" class="danger">删</button>' +
        "</div>";
    }
    html += "</div></div>";
    return html;
  }

  function guidesPanel(e) {
    var gd = e.guides;
    var fields = [["ascender", "上伸"], ["capHeight", "大写"], ["xHeight", "主体"], ["baseline", "基线"], ["descender", "下伸"]];
    var html = '<div class="sec"><h4>参考线 / 倾斜</h4><div class="guides">';
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      html += '<label>' + f[1] + '<input type="number" step="0.5" data-g="' + f[0] + '" value="' + (typeof gd[f[0]] === "number" ? gd[f[0]] : "") + '"></label>';
    }
    html += '<label>倾斜°<input type="number" step="1" data-g="slant" value="' + (typeof gd.slant === "number" ? gd.slant : "") + '"></label>';
    html += "</div></div>";
    return html;
  }

  function connectPanel(e) {
    if (e.style !== "cursive") return "";
    var c = e.connect || {};
    return '<div class="sec"><h4>连写点 connect</h4>' +
      '<div class="mut">entry ' + (c.entry ? JSON.stringify(c.entry) : "—") + " ｜ exit " + (c.exit ? JSON.stringify(c.exit) : "—") + "</div>" +
      '<div class="btns"><button data-act="entry">取首笔首点→entry</button><button data-act="exit">取末笔末点→exit</button></div>' +
      "</div>";
  }

  function annotatePanel(e) {
    var txt = state.pick.length
      ? state.pick.map(function (pk, i) {
          var st = e.strokes[pk.s];
          return (i === 0 ? "起笔 " : "收笔 ") + (st ? JSON.stringify(st.points[pk.p]) : "?");
        }).join(" ｜ ")
      : "切「标注」后：先点起笔点，再点收笔点，然后点「按标注应用」";
    return '<div class="sec"><h4>笔顺标注</h4>' +
      '<div class="mut">' + esc(txt) + "</div>" +
      '<div class="btns"><button data-act="applyPicks">按标注应用</button><button data-act="clearPicks">清除标注</button></div>' +
      '<div class="mut">应用后自动重算 cursive 的 connect（连写点）</div>' +
      "</div>";
  }

  function validatePanel(e) {
    var errs = validate(state.key, e);
    var hard = errs.filter(function (s) { return s.indexOf("待填") === -1; });
    var html = '<div class="sec"><h4>校验</h4>';
    var flags = flagsOf(e);
    if (!hard.length && !flags.length) html += '<p class="ok">✅ 通过（结构 / 坐标 / 参考线 / 连写）</p>';
    if (hard.length) html += '<ul class="err">' + hard.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>";
    if (flags.length) html += '<ul class="warn">' + flags.map(function (s) { return "<li>⚠ " + esc(s) + "</li>"; }).join("") + "</ul>";
    if (!e.strokes.length) html += '<p class="mut">（待填：尚无笔画）</p>';
    html += "</div>";
    return html;
  }

  function renderAll() {
    var e = cur();
    document.getElementById("board-host").innerHTML = editorSvg(e);
    document.getElementById("side").innerHTML = sidebarHtml();
    document.getElementById("panel").innerHTML =
      '<div class="sec"><h4>当前字形</h4><div class="cur">' +
        '<b>' + esc(e.glyph) + "</b> <code>" + esc(e.key) + "</code>" +
        '<span class="tag">' + e.style + "</span><span class='tag'>" + e.langs.join("/") + "</span>" +
        (dirty[state.key] ? '<span class="tag dirty">已改</span>' : "") +
      "</div></div>" +
      strokesPanel(e) + annotatePanel(e) + connectPanel(e) + guidesPanel(e) + validatePanel(e) +
      '<div class="sec"><h4>导出</h4><div class="btns col">' +
        '<button data-act="copyOne">复制当前字形 JSON</button>' +
        '<button data-act="dlOne">下载当前字形</button>' +
        '<button data-act="dlAll">下载全部（含修改）</button>' +
      "</div></div>";
    document.getElementById("status").textContent =
      "已改 " + Object.keys(dirty).length + " 个字形 ｜ 数据源 " + DATA.filled + "/" + DATA.total + " 已填";
    bindBoard();
  }

  // ── 画布交互 ────────────────────────────────────────────────────
  var board = null;
  function toSvg(evt) {
    var r = board.getBoundingClientRect();
    return [
      Math.round(((evt.clientX - r.left) / r.width) * 1000) / 10,
      Math.round(((evt.clientY - r.top) / r.height) * 1000) / 10
    ];
  }
  function bindBoard() {
    board = document.getElementById("board");
    if (!board) return;
    board.addEventListener("pointerdown", function (evt) {
      if (state.mode !== "draw") return;
      evt.preventDefault();
      board.setPointerCapture(evt.pointerId);
      state.raw = [toSvg(evt)];
    });
    board.addEventListener("pointermove", function (evt) {
      if (!state.raw) return;
      var p = toSvg(evt);
      var l = state.raw[state.raw.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.8) { state.raw.push(p); drawRaw(); }
    });
    board.addEventListener("pointerup", function (evt) {
      if (!state.raw) return;
      var raw = state.raw; state.raw = null;
      if (raw.length >= 2) {
        snapshot();
        var e = cur();
        e.strokes.push({ kind: state.kind, points: resample(raw, state.smooth) });
        state.sel = e.strokes.length - 1;
        markDirty();
      }
      renderAll();
    });
    board.addEventListener("click", function (evt) {
      if (state.mode === "annotate") {
        var p = toSvg(evt), e = cur(), bi = -1, bp = -1, bd = Infinity;
        for (var i = 0; i < e.strokes.length; i++) {
          var pts = e.strokes[i].points;
          for (var j = 0; j < pts.length; j++) {
            var dd = Math.hypot(pts[j][0] - p[0], pts[j][1] - p[1]);
            if (dd < bd) { bd = dd; bi = i; bp = j; }
          }
        }
        if (bi >= 0) {
          state.sel = bi;
          if (state.pick.length >= 2) state.pick = [];
          state.pick.push({ s: bi, p: bp });
        }
        renderAll();
        return;
      }
      if (state.mode !== "browse") return;
      var pl = evt.target.closest("polyline.st");
      if (pl) { state.sel = Number(pl.getAttribute("data-i")); renderAll(); }
    });
  }
  function drawRaw() {
    var old = board.querySelector("polyline.raw");
    if (old) old.remove();
    if (!state.raw || state.raw.length < 2) return;
    var d = "";
    for (var i = 0; i < state.raw.length; i++) d += (i ? " " : "") + state.raw[i][0] + "," + state.raw[i][1];
    var pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    pl.setAttribute("points", d);
    pl.setAttribute("class", "st raw");
    pl.style.stroke = "#0ea5e9"; pl.style.strokeWidth = "1.6"; pl.style.opacity = ".75";
    board.appendChild(pl);
  }

  function markDirty() { dirty[state.key] = 1; persist(); }

  // ── 笔顺标注：点起笔/收笔 → 重排笔画方向 ─────────────────────────
  function isClosed(a) { return a.length > 3 && Math.hypot(a[0][0] - a[a.length - 1][0], a[0][1] - a[a.length - 1][1]) <= 4; }

  function refreshConnect(e) {
    if (e.style !== "cursive") return;
    var fb = null, lb = null;
    for (var i = 0; i < e.strokes.length; i++) {
      if (e.strokes[i].kind !== "base") continue;
      if (!fb) fb = e.strokes[i];
      lb = e.strokes[i];
    }
    if (fb && lb) e.connect = { entry: fb.points[0].slice(), exit: lb.points[lb.points.length - 1].slice() };
  }

  /** 以 idx 为起笔：闭合环则从该点起绕一圈；开放路径则按近端定向 */
  function orientStart(st, idx) {
    var a = st.points;
    if (isClosed(a)) {
      var cyc = a.slice(0, a.length - 1), n = cyc.length, i0 = idx % n, out = [];
      for (var k = 0; k <= n; k++) out.push(cyc[(i0 + k) % n].slice());
      st.points = out;
    } else if (idx > a.length / 2) {
      st.points = a.slice().reverse();
    }
  }

  function orientEnd(st, idx) {
    var a = st.points;
    if (isClosed(a)) { orientStart(st, (idx + 1) % a.length); return; }
    if (idx < a.length / 2) st.points = a.slice().reverse();
  }

  /** 闭合环上「起笔 i0 → 收笔 i1」沿环切开成开放路径 */
  function cutOpen(st, i0, i1) {
    var a = st.points;
    if (isClosed(a)) {
      var cyc = a.slice(0, a.length - 1), n = cyc.length;
      var sI = i0 % n, tI = i1 % n;
      var dist = ((tI - sI) % n + n) % n, out = [];
      for (var k = 0; k <= dist; k++) out.push(cyc[(sI + k) % n].slice());
      if (out.length >= 2) st.points = out;
    } else if (i0 > i1) {
      st.points = a.slice().reverse();
    }
  }

  function applyPicks() {
    var e = cur(), pk = state.pick;
    if (!pk.length) return;
    snapshot();
    var s0 = e.strokes[pk[0].s];
    if (!s0) { state.pick = []; return; }
    if (pk.length === 1) {
      orientStart(s0, pk[0].p);
    } else {
      var s1 = e.strokes[pk[1].s];
      if (s0 === s1) cutOpen(s0, pk[0].p, pk[1].p);
      else { orientStart(s0, pk[0].p); orientEnd(s1, pk[1].p); }
    }
    refreshConnect(e);
    state.pick = [];
    markDirty();
    renderAll();
  }

  // ── 交互动作 ────────────────────────────────────────────────────
  function applyAct(act, i) {
    var e = cur();
    if (act === "sel") { state.sel = i; }
    else if (act === "rev") { snapshot(); e.strokes[i].points.reverse(); markDirty(); }
    else if (act === "kind") { snapshot(); e.strokes[i].kind = e.strokes[i].kind === "base" ? "diacritic" : "base"; markDirty(); }
    else if (act === "del") { snapshot(); e.strokes.splice(i, 1); state.sel = -1; markDirty(); }
    else if (act === "up" && i > 0) { snapshot(); var t = e.strokes[i - 1]; e.strokes[i - 1] = e.strokes[i]; e.strokes[i] = t; state.sel = i - 1; markDirty(); }
    else if (act === "down" && i < e.strokes.length - 1) { snapshot(); var t2 = e.strokes[i + 1]; e.strokes[i + 1] = e.strokes[i]; e.strokes[i] = t2; state.sel = i + 1; markDirty(); }
    else if (act === "entry") {
      var fb = null; for (var a = 0; a < e.strokes.length; a++) if (e.strokes[a].kind === "base") { fb = e.strokes[a]; break; }
      if (fb) { snapshot(); e.connect = e.connect || {}; e.connect.entry = fb.points[0].slice(); markDirty(); }
    } else if (act === "exit") {
      var lb = null; for (var b2 = 0; b2 < e.strokes.length; b2++) if (e.strokes[b2].kind === "base") lb = e.strokes[b2];
      if (lb) { snapshot(); e.connect = e.connect || {}; e.connect.exit = lb.points[lb.points.length - 1].slice(); markDirty(); }
    }
    else if (act === "clearPicks") { state.pick = []; }
    else if (act === "applyPicks") { applyPicks(); return; }
    renderAll();
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function merged() {
    var out = {};
    for (var i = 0; i < DATA.keys.length; i++) {
      var k = DATA.keys[i];
      if (working[k]) out[k] = working[k];
      else if (DATA.glyphs[k]) out[k] = DATA.glyphs[k];
    }
    out._meta = Object.assign({}, DATA.meta, { authoredBy: "trace-authoring.html", updatedAt: new Date().toISOString().slice(0, 10) });
    return out;
  }

  // ── 顶部工具条 / 事件绑定 ───────────────────────────────────────
  function setMode(m) {
    state.mode = m;
    var b1 = document.getElementById("mBrowse"), b2 = document.getElementById("mDraw"), b3 = document.getElementById("mAnnotate");
    if (b1) b1.classList.toggle("on", m === "browse");
    if (b2) b2.classList.toggle("on", m === "draw");
    if (b3) b3.classList.toggle("on", m === "annotate");
    if (board) { board.classList.toggle("draw", m === "draw"); board.classList.toggle("annot", m === "annotate"); }
    if (m !== "annotate") state.pick = [];
    var hint = document.getElementById("hint");
    if (hint) hint.textContent = m === "draw"
      ? "绘制中：在格内按书写顺序描中心线（松手成笔）"
      : m === "annotate"
        ? "标注中：先点「起笔点」，再点「收笔点」→ 点「按标注应用」；形状不动，只重排笔顺与方向"
        : "浏览：点击笔画可选中；切「绘制」开始描红，切「标注」定笔顺";
  }

  function bindUI() {
    document.getElementById("mBrowse").onclick = function () { setMode("browse"); };
    document.getElementById("mDraw").onclick = function () { setMode("draw"); };
    document.getElementById("mAnnotate").onclick = function () { setMode("annotate"); };
    document.getElementById("kindBase").onclick = function () { state.kind = "base"; syncToggles(); };
    document.getElementById("kindDia").onclick = function () { state.kind = "diacritic"; syncToggles(); };
    document.getElementById("smooth").onchange = function (ev) { state.smooth = ev.target.checked; };
    document.getElementById("ghost").onchange = function (ev) { state.ghost = ev.target.checked; renderAll(); };
    document.getElementById("guideOn").onchange = function (ev) { state.guideOn = ev.target.checked; renderAll(); };
    document.getElementById("undo").onclick = undo;
    document.getElementById("clear").onclick = function () {
      if (!confirm("清空当前字形的全部笔画？")) return;
      snapshot(); cur().strokes = []; state.sel = -1; markDirty(); renderAll();
    };
    document.getElementById("refFile").onchange = function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { state.refImg = fr.result; renderAll(); };
      fr.readAsDataURL(f);
    };
    document.getElementById("refOpacity").oninput = function (ev) { state.refOpacity = Number(ev.target.value); renderAll(); };
    document.getElementById("impFile").onchange = function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var j = JSON.parse(fr.result);
          var n = 0;
          for (var k in j) { if (k === "_meta") continue; if (j[k] && typeof j[k] === "object") { snapshot(); working[k] = j[k]; dirty[k] = 1; n++; } }
          persist(); setMode("browse"); renderAll();
          alert("已导入 " + n + " 个字形（覆盖同键）");
        } catch (err) { alert("导入失败：" + err.message); }
      };
      fr.readAsText(f);
    };

    document.getElementById("side").addEventListener("click", function (evt) {
      var btn = evt.target.closest("button.item");
      if (!btn) return;
      state.key = btn.getAttribute("data-key"); state.sel = -1; renderAll();
    });
    document.getElementById("panel").addEventListener("click", function (evt) {
      var t = evt.target.closest("button");
      if (!t) return;
      var act = t.getAttribute("data-act");
      if (!act) return;
      if (act === "copyOne") {
        navigator.clipboard.writeText(JSON.stringify(cur(), null, 2)).then(function () { alert("已复制当前字形 JSON"); }, function () { alert("复制失败，请用「下载当前字形」"); });
      } else if (act === "dlOne") download(state.key.replace(":", "-") + ".json", JSON.stringify(cur(), null, 2));
      else if (act === "dlAll") download("letter-strokes.json", JSON.stringify(merged(), null, 2) + "\\n");
      else applyAct(act, Number(t.getAttribute("data-i")));
    });
    document.getElementById("panel").addEventListener("input", function (evt) {
      var g = evt.target.getAttribute("data-g");
      if (!g) return;
      var e = cur();
      if (g === "slant") {
        if (evt.target.value === "") delete e.guides.slant;
        else e.guides.slant = Number(evt.target.value);
      } else {
        e.guides[g] = Number(evt.target.value);
      }
      markDirty();
      document.getElementById("panel").querySelector("div.sec:last-child");
      var saved = state.sel;
      renderAll();
      state.sel = saved;
    });

    document.addEventListener("keydown", function (evt) {
      if (/input|textarea/i.test((evt.target.tagName || ""))) return;
      if (evt.key === "d") setMode(state.mode === "draw" ? "browse" : "draw");
      else if (evt.key === "a") setMode(state.mode === "annotate" ? "browse" : "annotate");
      else if (evt.key === "1") { state.kind = "base"; syncToggles(); }
      else if (evt.key === "2") { state.kind = "diacritic"; syncToggles(); }
      else if (evt.key === "s") { state.smooth = !state.smooth; document.getElementById("smooth").checked = state.smooth; }
      else if (evt.key === "Delete" && state.sel >= 0) applyAct("del", state.sel);
      else if ((evt.ctrlKey || evt.metaKey) && evt.key === "z") { evt.preventDefault(); undo(); }
    });
  }

  function syncToggles() {
    document.getElementById("kindBase").classList.toggle("on", state.kind === "base");
    document.getElementById("kindDia").classList.toggle("on", state.kind === "diacritic");
  }

  function init() {
    document.getElementById("gen").textContent = DATA.generatedAt;
    bindUI(); syncToggles(); setMode("browse"); renderAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>描红笔顺录入 / 校正工具 · 94 字形（T6-08 内容轨）</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;color:#1e293b;font:14px/1.55 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.97);border-bottom:1px solid #e2e8f0;padding:10px 18px;backdrop-filter:blur(6px)}
  h1{margin:0;font-size:16px}
  .sub{font-size:12px;color:#64748b;margin-top:2px}
  .sub code{background:#f1f5f9;padding:1px 5px;border-radius:4px}
  .toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
  button{padding:5px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:12.5px;cursor:pointer}
  button:hover{background:#f8fafc;border-color:#94a3b8}
  button.on{background:#6d28d9;border-color:#6d28d9;color:#fff}
  button.danger{color:#b91c1c;border-color:#fecaca}
  .sep{width:1px;height:20px;background:#e2e8f0;margin:0 4px}
  label.chk{display:flex;align-items:center;gap:4px;font-size:12.5px;color:#475569;cursor:pointer}
  #status{margin-left:auto;font-size:12px;color:#64748b}
  #hint{font-size:12px;color:#6d28d9;margin-top:4px}
  main{display:grid;grid-template-columns:230px 1fr 340px;gap:14px;padding:14px 18px 40px;max-width:1600px;margin:0 auto;align-items:start}
  .card{background:#fff;border:1px solid #e8edf3;border-radius:14px;padding:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  #side{max-height:calc(100vh - 150px);overflow:auto}
  .grp h3{font-size:12px;color:#475569;margin:10px 0 6px;display:flex;justify-content:space-between}
  .grp h3 span{color:#94a3b8;font-weight:400}
  .items{display:grid;grid-template-columns:1fr 1fr;gap:5px}
  button.item{display:flex;align-items:center;gap:5px;text-align:left;padding:5px 6px;font-size:11.5px}
  button.item.on{background:#f5f3ff;border-color:#a78bfa}
  button.item.empty{opacity:.62}
  button.item.dirty{box-shadow:inset 3px 0 0 #f59e0b}
  button.item b{font-size:14px;color:#0f172a;min-width:14px}
  button.item .k{color:#94a3b8;font-family:ui-monospace,Consolas,monospace;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  button.item .n{margin-left:auto;color:#64748b;font-size:10.5px}
  button.item .w{color:#b45309}
  #board-host{display:flex;justify-content:center}
  #board{width:100%;max-width:520px;height:auto;aspect-ratio:1/1;touch-action:none;border-radius:12px;background:linear-gradient(#fcfdff,#fcfdff)}
  #board.draw{cursor:crosshair}
  #board .bg{fill:none}
  .gl{stroke-width:.8;fill:none}
  .gl.asc,.gl.cap{stroke:#93c5fd;stroke-dasharray:2 2}
  .gl.xh{stroke:#86efac;stroke-dasharray:2 2}
  .gl.base{stroke:#f87171;stroke-width:1}
  .gl.desc{stroke:#c4b5fd;stroke-dasharray:2 2}
  .gl.slant{stroke:#cbd5e1;stroke-dasharray:1 3;stroke-width:.5}
  .gl.slant.assumed{stroke-dasharray:1 5;opacity:.55}
  .ghost{fill:#cbd5e1;opacity:.5;font-family:"Segoe UI",Arial,sans-serif}
  .st{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.6;cursor:pointer}
  .st.base{stroke:#1e293b}
  .st.diacritic{stroke:#f97316}
  .st.sel{stroke:#7c3aed;stroke-width:3.6}
  .sdot{stroke:#fff;stroke-width:1}
  .sdot.base{fill:#ef4444}
  .sdot.diacritic{fill:#f97316}
  .sdot.sel{fill:#7c3aed}
  .snum{font-size:6.4px;font-weight:700;fill:#fff;text-anchor:middle;dominant-baseline:central;pointer-events:none;font-family:Arial,sans-serif}
  .arrow.base{fill:#ef4444}
  .arrow.diacritic{fill:#f97316}
  .mk.entry{fill:#10b981;opacity:.9}
  .mk.exit{fill:#3b82f6;opacity:.9}
  .pick{fill:none;stroke-width:1.6}
  .pick.pk-entry{stroke:#10b981}
  .pick.pk-exit{stroke:#3b82f6}
  #board.annot{cursor:crosshair}
  .sec{margin-bottom:14px;padding-bottom:12px;border-bottom:1px dashed #e8edf3}
  .sec:last-child{border-bottom:0}
  .sec h4{margin:0 0 8px;font-size:12.5px;color:#334155}
  .cur{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
  .cur b{font-size:20px}
  .cur code{color:#64748b;font-family:ui-monospace,Consolas,monospace;font-size:11px}
  .tag{font-size:10.5px;background:#f1f5f9;border-radius:999px;padding:1px 7px;color:#475569}
  .tag.dirty{background:#fef3c7;color:#92400e}
  .list .row{display:flex;align-items:center;gap:5px;padding:4px 5px;border-radius:8px;font-size:11.5px}
  .list .row.on{background:#f5f3ff}
  .list .row .idx{width:14px;color:#94a3b8;text-align:center}
  .list .row .kd{font-size:10px;padding:1px 5px;border-radius:999px}
  .list .row .kd.base{background:#e2e8f0;color:#334155}
  .list .row .kd.diacritic{background:#ffedd5;color:#c2410c}
  .list .row .pt{margin-left:auto;color:#64748b}
  .list .row .pt.bad{color:#b45309;font-weight:700}
  .list .row button{padding:2px 6px;font-size:11px}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
  .btns.col{flex-direction:column}
  .btns.col button{width:100%}
  .guides{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .guides label{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;color:#475569}
  .guides input{width:74px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px}
  .mut{color:#94a3b8;font-size:12px}
  .ok{color:#0f766e;font-size:12px}
  ul.err,ul.warn{margin:0;padding-left:16px;font-size:12px}
  ul.err{color:#b91c1c}
  ul.warn{color:#b45309;margin-top:6px}
  .refrow{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569}
  @media(max-width:1100px){main{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <h1>描红笔顺录入 / 校正工具 <span style="font-weight:400;color:#94a3b8;font-size:12.5px">Phase 6 · T6-08 · 路径A 中心线</span></h1>
  <div class="sub">
    数据源 <code>data/trace/letter-strokes.json</code> ｜ 生成于 <span id="gen"></span> ｜
    导出后用 <code>npm run check:trace --strict</code> 复核
  </div>
  <div class="toolbar">
    <button id="mBrowse">浏览</button>
    <button id="mDraw">绘制</button>
    <button id="mAnnotate">标注</button>
    <span class="sep"></span>
    <span style="font-size:12px;color:#64748b">笔类型</span>
    <button id="kindBase">base</button>
    <button id="kindDia">diacritic</button>
    <label class="chk"><input type="checkbox" id="smooth"> 平滑曲线</label>
    <span class="sep"></span>
    <label class="chk"><input type="checkbox" id="guideOn" checked> 四线格</label>
    <label class="chk"><input type="checkbox" id="ghost" checked> 字体参照</label>
    <span class="sep"></span>
    <label class="chk">参考图 <input type="file" id="refFile" accept="image/*" style="width:130px"></label>
    <input type="range" id="refOpacity" min="0" max="1" step="0.05" value="0.35" title="参考图透明度">
    <span class="sep"></span>
    <button id="undo">撤销</button>
    <button id="clear" class="danger">清空字形</button>
    <label class="chk" style="margin-left:6px">导入 JSON <input type="file" id="impFile" accept="application/json" style="width:130px"></label>
    <span id="status"></span>
  </div>
  <div id="hint"></div>
</header>
<main>
  <aside id="side" class="card"></aside>
  <section class="card"><div id="board-host"></div></section>
  <aside id="panel" class="card"></aside>
</main>
<script>${CLIENT_JS.replace("__PAYLOAD__", JSON.stringify(payload))}</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, "utf8");

console.log(`✅ 已生成录入/校正工具：${path.relative(ROOT, OUT)}`);
console.log(`   字形 ${payload.total} 个（已填 ${payload.filled}）｜ 文件 ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
console.log(`   打开方式：直接双击该 HTML（file:// 即可，无需服务器）`);
console.log(`   用法：①「绘制」描中心线 ②「标注」点起笔/收笔自动重排笔顺 → 导出 JSON`);
