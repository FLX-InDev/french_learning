#!/usr/bin/env node
/**
 * 描红笔顺数据「可视化预览」生成器（Phase 6 T6-08 辅助校验工具）
 *
 * 目的：把 data/trace/letter-strokes.json 渲染成一张可交互的离线 HTML，
 *       供人工 / 法语母语者逐个对照校验「字形形态」与「笔画顺序」。
 *
 * 特点：
 *   1. 输出**单文件 HTML**（数据内嵌），file:// 双击即开，无需服务器 / 依赖；
 *   2. 不进生产 bundle、不参与 npm run verify，纯本地校验工具；
 *   3. 四线格 + 笔画序号 + 起笔方向箭头 + cursive 连写点；
 *   4. 逐笔回放动画（校验书写顺序的关键）+ 悬停高亮 + 筛选；
 *   5. 自动标出「可疑项」（缺 slant / 笔画数超规格 / 点数异常 …）。
 *
 * 用法：
 *   node scripts/preview-trace-data.cjs                        # → data/trace/preview.html
 *   node scripts/preview-trace-data.cjs out.html               # 自定义输出路径
 *   node scripts/preview-trace-data.cjs out.html --only=^cursive:   # 只渲染匹配键的字形
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "trace", "letter-strokes.json");

const argv = process.argv.slice(2);
/** 可选 --only=<正则>：只渲染匹配的字形键（抽查单字形 / 单个批次用） */
const onlyArg = argv.find((a) => a.startsWith("--only="));
const onlyRe = onlyArg ? new RegExp(onlyArg.slice("--only=".length)) : null;
const outArg = argv.find((a) => !a.startsWith("--"));
const OUT = outArg
  ? path.resolve(process.cwd(), outArg)
  : path.join(ROOT, "data", "trace", "preview.html");

// ── 批次定义（对应规格 §2 的 5 批）────────────────────────────────
const ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");

const BATCHES = [
  { id: "upper", name: "① print 大写", hint: "A–Z ｜ 规格：大写 1–3 画", test: (g) => g.style === "print" && /^[A-Z]$/.test(g.glyph) },
  { id: "lower", name: "② print 小写", hint: "a–z ｜ 规格：小写 1–2 画", test: (g) => g.style === "print" && /^[a-z]$/.test(g.glyph) },
  { id: "cur", name: "③ cursive 小写", hint: "a–z ｜ 一笔连写、右倾 15–20°、有起收笔钩", test: (g) => g.style === "cursive" && /^[a-z]$/.test(g.glyph) },
  { id: "acc", name: "④ print 变音", hint: "é è ê à ù î ô ç ｜ 音符笔画另计且排在 base 之后", test: (g) => g.style === "print" && !/^[A-Za-z]$/.test(g.glyph) },
  { id: "curacc", name: "⑤ cursive 变音", hint: "é è ê à ù î ô ç ｜ cursive + 音符", test: (g) => g.style === "cursive" && !/^[A-Za-z]$/.test(g.glyph) },
];

// ── 读取数据 ─────────────────────────────────────────────────────
if (!fs.existsSync(SRC)) {
  console.error(`❌ 未找到数据文件：${path.relative(ROOT, SRC)}`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
const entries = Object.entries(raw)
  .filter(([k]) => k !== "_meta")
  .map(([, v]) => v);

const byKey = new Map(entries.map((e) => [e.key, e]));

/** 字母表顺序（变音字形按其基础字母排序） */
function orderOf(glyph) {
  const base = glyph.normalize("NFD")[0].toLowerCase();
  const i = ALPHA.indexOf(base);
  return i === -1 ? 99 : i;
}

// ── 可疑项自动检查（辅助校验，不替代 validate-trace-data.cjs）────
function flagsFor(g) {
  const out = [];
  const base = g.strokes.filter((s) => s.kind === "base");
  const dia = g.strokes.filter((s) => s.kind === "diacritic");

  if (g.style === "print") {
    const isUpper = /^[A-Z]$/.test(g.glyph);
    const limit = isUpper ? 3 : 2;
    if (base.length > limit) out.push(`base 笔画 ${base.length} 笔，超规格上限 ${limit} 笔`);
    if (base.length === 0) out.push("缺少 base 笔画");
  }

  if (g.style === "cursive") {
    if (typeof g.guides.slant !== "number") out.push("未设 slant（cursive 规格建议 15–20°）");
    if (!g.connect) out.push("缺少 connect（cursive 必需）");
    // i / j 的点、变音音符按规格「另计」，故只在 base > 1 且非 i/j 时提示
    if (base.length > 1 && !/^[ij]$/.test(g.glyph)) {
      out.push(`base 笔画 ${base.length} 笔（cursive 通常一笔连写）`);
    }
  }

  if (!/^[A-Za-z]$/.test(g.glyph) && dia.length === 0) out.push("变音字形缺少 diacritic 笔画");

  g.strokes.forEach((s, i) => {
    const n = s.points.length;
    if (n < 6 || n > 24) out.push(`第 ${i + 1} 笔点数 ${n}（规格建议 6–24）`);
  });

  return out;
}

const flags = {};
for (const g of entries) {
  const f = flagsFor(g);
  if (f.length) flags[g.key] = f;
}

// ── 组装 payload ─────────────────────────────────────────────────
const payload = {
  generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  meta: raw._meta || {},
  batches: BATCHES.map((b) => {
    const keys = entries
      .filter(b.test)
      .filter((g) => !onlyRe || onlyRe.test(g.key))
      .sort((a, b2) => orderOf(a.glyph) - orderOf(b2.glyph))
      .map((g) => g.key);
    return { id: b.id, name: b.name, hint: b.hint, keys };
  }),
  glyphs: Object.fromEntries(entries.map((g) => [g.key, g])),
  flags,
  total: entries.length,
};

// ── 客户端脚本（注意：此处刻意不用模板字符串，避免与生成器模板冲突）──
const CLIENT_JS = `
(function () {
  var DATA = __PAYLOAD__;

  var LINES = [
    ["ascender", "asc"],
    ["capHeight", "cap"],
    ["xHeight", "xh"],
    ["baseline", "base"],
    ["descender", "desc"]
  ];

  var state = { q: "", ghost: true, num: true, guides: true };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function guideLines(g) {
    var gd = g.guides;
    var s = "";
    for (var i = 0; i < LINES.length; i++) {
      var y = gd[LINES[i][0]];
      if (typeof y !== "number") continue;
      s += '<line x1="0" y1="' + y + '" x2="100" y2="' + y + '" class="g ' + LINES[i][1] + '"/>';
    }
    // 倾斜参考线：数据有 slant 用之，cursive 缺省按规格下限 15° 画虚线
    var slant = typeof gd.slant === "number" ? gd.slant : g.style === "cursive" ? 15 : 0;
    if (slant) {
      var dx = Math.tan((slant * Math.PI) / 180) * 100;
      for (var k = 20; k <= 100; k += 20) {
        s += '<line x1="' + k + '" y1="0" x2="' + (k - dx) + '" y2="100" class="g slant' +
          (typeof gd.slant === "number" ? "" : " assumed") + '"/>';
      }
    }
    return s;
  }

  function ghostText(g) {
    if (g.style !== "print" || !state.ghost) return "";
    var gd = g.guides;
    var isUpper = /^[A-Z]$/.test(g.glyph);
    var span = isUpper ? gd.baseline - gd.capHeight : gd.baseline - gd.xHeight;
    var size = Math.max(8, span / (isUpper ? 0.7 : 0.5));
    return '<text x="50" y="' + gd.baseline + '" class="ghost" text-anchor="middle" ' +
      'dominant-baseline="alphabetic" font-size="' + size.toFixed(1) + '">' + esc(g.glyph) + "</text>";
  }

  function strokePaths(g) {
    var s = "";
    for (var i = 0; i < g.strokes.length; i++) {
      var pts = g.strokes[i].points;
      var d = "";
      for (var j = 0; j < pts.length; j++) d += (j ? " " : "") + pts[j][0] + "," + pts[j][1];
      s += '<polyline points="' + d + '" class="stroke ' + g.strokes[i].kind + '" data-i="' + i + '"/>';
    }
    return s;
  }

  function markers(g) {
    if (!state.num) return "";
    var s = "";
    for (var i = 0; i < g.strokes.length; i++) {
      var pts = g.strokes[i].points;
      var p0 = pts[0];
      var p1 = pts[1] || pts[0];
      var kind = g.strokes[i].kind;
      s += '<circle cx="' + p0[0] + '" cy="' + p0[1] + '" r="6" class="sdot ' + kind + '" data-i="' + i + '"/>';
      s += '<text x="' + p0[0] + '" y="' + p0[1] + '" class="snum" data-i="' + i + '">' + (i + 1) + "</text>";
      var a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      var tip = 11.5;
      var ax = p0[0] + Math.cos(a) * tip;
      var ay = p0[1] + Math.sin(a) * tip;
      var bx = ax - Math.cos(a) * 6;
      var by = ay - Math.sin(a) * 6;
      var nx = -Math.sin(a) * 3.4;
      var ny = Math.cos(a) * 3.4;
      s += '<polygon class="arrow ' + kind + '" points="' +
        ax + "," + ay + " " + (bx + nx) + "," + (by + ny) + " " + (bx - nx) + "," + (by - ny) + '"/>';
    }
    return s;
  }

  function connectMarks(g) {
    if (!g.connect) return "";
    var e = g.connect.entry;
    var x = g.connect.exit;
    return '<rect x="' + (e[0] - 2.6) + '" y="' + (e[1] - 2.6) + '" width="5.2" height="5.2" class="entry"/>' +
      '<rect x="' + (x[0] - 2.6) + '" y="' + (x[1] - 2.6) + '" width="5.2" height="5.2" class="exit"/>';
  }

  function svgFor(g) {
    return '<svg viewBox="0 0 100 100" class="glyph" preserveAspectRatio="xMidYMid meet">' +
      (state.guides ? guideLines(g) : "") +
      ghostText(g) +
      strokePaths(g) +
      connectMarks(g) +
      markers(g) +
      "</svg>";
  }

  function badge(g) {
    var f = DATA.flags[g.key];
    if (!f || !f.length) return "";
    return '<span class="warn" title="' + esc(f.join("\\n")) + '">⚠ ' + f.length + "</span>";
  }

  function cardHtml(g) {
    var base = g.strokes.filter(function (s) { return s.kind === "base"; }).length;
    var dia = g.strokes.filter(function (s) { return s.kind === "diacritic"; }).length;
    return '<article class="card" data-key="' + esc(g.key) + '">' +
      '<div class="frame">' + svgFor(g) + "</div>" +
      '<div class="meta">' +
        '<div class="row1"><b class="ch">' + esc(g.glyph) + "</b>" + badge(g) + "</div>" +
        '<div class="row2"><span>' + esc(g.key) + "</span></div>" +
        '<div class="row2"><span class="cnt">' + g.strokes.length + " 笔</span>" +
          (dia ? '<span class="dia">含音符 ' + dia + "</span>" : "") +
          '<span class="lg">' + g.langs.join(" / ") + "</span></div>" +
      "</div>" +
      '<div class="acts"><button class="play">▶ 回放笔顺</button></div>' +
      "</article>";
  }

  function match(g) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    if (g.key.toLowerCase().indexOf(q) !== -1) return true;
    if (g.glyph.toLowerCase() === q) return true;
    if (g.style.indexOf(q) !== -1) return true;
    if (g.langs.join(",").indexOf(q) !== -1) return true;
    if (DATA.flags[g.key]) return "⚠".indexOf(q) !== -1 || q === "warn";
    return false;
  }

  var playing = null;

  function highlight(card, idx) {
    var nodes = card.querySelectorAll(".sdot, .snum, polyline.stroke");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.classList.toggle("active", Number(n.getAttribute("data-i")) === idx);
    }
  }

  function resetStrokes(polys) {
    for (var i = 0; i < polys.length; i++) {
      polys[i].style.transition = "none";
      polys[i].style.strokeDasharray = "";
      polys[i].style.strokeDashoffset = "";
    }
  }

  function playCard(card, token) {
    return new Promise(function (resolve) {
      var polys = Array.prototype.slice.call(card.querySelectorAll("polyline.stroke"));
      if (!polys.length) return resolve();
      for (var i = 0; i < polys.length; i++) {
        var L = polys[i].getTotalLength();
        polys[i].style.transition = "none";
        polys[i].style.strokeDasharray = L + " " + L;
        polys[i].style.strokeDashoffset = L;
      }
      var k = 0;
      function step() {
        if (k >= polys.length || (token && token.cancelled)) {
          resetStrokes(polys);
          highlight(card, -1);
          return resolve();
        }
        highlight(card, k);
        polys[k].style.transition = "stroke-dashoffset .55s linear";
        polys[k].style.strokeDashoffset = 0;
        k++;
        window.setTimeout(step, 600);
      }
      step();
    });
  }

  function render() {
    if (playing) { playing.cancelled = true; playing = null; }
    var host = document.getElementById("batches");
    var html = "";
    var shown = 0;
    for (var b = 0; b < DATA.batches.length; b++) {
      var batch = DATA.batches[b];
      var keys = batch.keys.filter(function (k) { return match(DATA.glyphs[k]); });
      if (!keys.length) continue;
      shown += keys.length;
      html += '<section class="batch"><h2>' + esc(batch.name) +
        '<span class="hint">' + esc(batch.hint) + "</span>" +
        '<span class="cnt2">' + keys.length + " / " + batch.keys.length + " 字形</span></h2><div class='grid'>";
      for (var i = 0; i < keys.length; i++) html += cardHtml(DATA.glyphs[keys[i]]);
      html += "</div></section>";
    }
    if (!shown) html = '<p class="empty">没有匹配的字形。</p>';
    host.innerHTML = html;
    document.getElementById("stat").textContent = shown + " / " + DATA.total + " 字形";
  }

  function init() {
    document.getElementById("gen").textContent = DATA.generatedAt;
    render();

    document.getElementById("q").addEventListener("input", function (e) {
      state.q = e.target.value.trim();
      render();
    });
    ["ghost", "num", "guides"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function (e) {
        state[id] = e.target.checked;
        render();
      });
    });

    document.getElementById("batches").addEventListener("click", function (e) {
      var playBtn = e.target.closest("button.play");
      if (playBtn) {
        var card = playBtn.closest(".card");
        playing = { cancelled: false };
        playCard(card, playing);
        return;
      }
      if (e.target.closest(".frame")) {
        e.target.closest(".card").classList.toggle("big");
        return;
      }
    });

    document.getElementById("playAll").addEventListener("click", function () {
      if (playing) { playing.cancelled = true; playing = null; return; }
      var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
      playing = { cancelled: false };
      var token = playing;
      (function next(i) {
        if (i >= cards.length || token.cancelled) { playing = null; return; }
        cards[i].scrollIntoView({ block: "center", behavior: "smooth" });
        playCard(cards[i], token).then(function () { window.setTimeout(function () { next(i + 1); }, 120); });
      })(0);
    });
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
<title>描红笔顺数据预览 · ${payload.total} 字形（T6-08 校验用）</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;color:#1e293b;
       font:14px/1.55 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.96);
         border-bottom:1px solid #e2e8f0;padding:14px 20px 12px;backdrop-filter:blur(6px)}
  h1{margin:0;font-size:17px}
  .sub{font-size:12px;color:#64748b;margin-top:3px}
  .sub code{background:#f1f5f9;padding:1px 5px;border-radius:4px}
  .toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:10px}
  .toolbar input[type=text]{width:240px;padding:6px 10px;border:1px solid #cbd5e1;
         border-radius:8px;font-size:13px;outline:none}
  .toolbar input[type=text]:focus{border-color:#7c3aed;box-shadow:0 0 0 3px #ede9fe}
  .toolbar label{display:flex;align-items:center;gap:5px;font-size:13px;color:#475569;cursor:pointer}
  .toolbar button{padding:6px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;
         font-size:13px;cursor:pointer}
  .toolbar button:hover{background:#f8fafc;border-color:#94a3b8}
  #stat{font-size:12px;color:#64748b;margin-left:auto}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:9px;font-size:12px;color:#64748b}
  .legend i{display:inline-block;width:16px;height:0;border-top:2px solid;vertical-align:middle;
         margin-right:4px}
  .legend .la i{border-color:#93c5fd;border-top-style:dashed}
  .legend .lx i{border-color:#86efac;border-top-style:dashed}
  .legend .lb i{border-color:#f87171}
  .legend .ld i{border-color:#c4b5fd;border-top-style:dashed}
  .legend .ls i{border-color:#cbd5e1;border-top-style:dotted}
  .legend .lk i{border-color:#1e293b}
  .legend .lk2 i{border-color:#f97316}
  main{padding:18px 20px 60px;max-width:1500px;margin:0 auto}
  .batch h2{font-size:15px;margin:26px 0 10px;display:flex;flex-wrap:wrap;
         align-items:baseline;gap:10px;padding-bottom:6px;border-bottom:1px dashed #e2e8f0}
  .batch h2 .hint{font-size:12px;font-weight:400;color:#94a3b8}
  .batch h2 .cnt2{margin-left:auto;font-size:12px;font-weight:400;color:#94a3b8}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:14px}
  .card{background:#fff;border:1px solid #e8edf3;border-radius:14px;padding:10px;
        box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .card.big{grid-column:span 2}
  .frame{cursor:zoom-in;background:
        linear-gradient(#fcfdff,#fcfdff)}
  .card.big .frame{cursor:zoom-out}
  svg.glyph{width:100%;height:auto;display:block}
  .meta{margin-top:8px;font-size:11.5px;color:#64748b}
  .row1{display:flex;align-items:center;gap:6px}
  .ch{font-size:19px;color:#0f172a;line-height:1}
  .warn{margin-left:auto;font-size:11px;color:#b45309;background:#fef3c7;
        border-radius:999px;padding:1px 6px;cursor:help}
  .row2{display:flex;gap:8px;margin-top:3px;color:#94a3b8;
        font-family:ui-monospace,Consolas,monospace;font-size:11px}
  .cnt{color:#475569}
  .dia{color:#c2410c}
  .lg{color:#0f766e}
  .acts{margin-top:8px}
  .acts button{width:100%;padding:5px 0;border:1px solid #ddd6fe;background:#f5f3ff;
        color:#6d28d9;border-radius:8px;font-size:12px;cursor:pointer}
  .acts button:hover{background:#ede9fe}
  .empty{color:#94a3b8;padding:30px 0;text-align:center}
  /* SVG 内部 */
  .g{stroke-width:.8;fill:none}
  .g.asc,.g.cap{stroke:#93c5fd;stroke-dasharray:2 2}
  .g.xh{stroke:#86efac;stroke-dasharray:2 2}
  .g.base{stroke:#f87171;stroke-width:1}
  .g.desc{stroke:#c4b5fd;stroke-dasharray:2 2}
  .g.slant{stroke:#cbd5e1;stroke-dasharray:1 3;stroke-width:.5}
  .g.slant.assumed{stroke-dasharray:1 5;opacity:.55}
  .ghost{fill:#cbd5e1;opacity:.5;font-family:"Segoe UI",Arial,sans-serif}
  polyline.stroke{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.6}
  polyline.stroke.base{stroke:#1e293b}
  polyline.stroke.diacritic{stroke:#f97316}
  polyline.stroke.active{stroke:#7c3aed;stroke-width:3.4}
  .sdot{stroke:#fff;stroke-width:1}
  .sdot.base{fill:#ef4444}
  .sdot.diacritic{fill:#f97316}
  .sdot.active{fill:#7c3aed;r:7}
  .snum{font-size:6.4px;font-weight:700;fill:#fff;text-anchor:middle;
        dominant-baseline:central;pointer-events:none;font-family:Arial,sans-serif}
  .arrow.base{fill:#ef4444}
  .arrow.diacritic{fill:#f97316}
  .arrow.active{fill:#7c3aed}
  .entry{fill:#10b981;opacity:.9}
  .exit{fill:#3b82f6;opacity:.9}
  @media print{
    header{position:static}
    .toolbar,.acts{display:none}
    .grid{grid-template-columns:repeat(6,1fr)}
    .card{break-inside:avoid;box-shadow:none}
  }
</style>
</head>
<body>
<header>
  <h1>描红笔顺数据预览 <span style="font-weight:400;color:#94a3b8;font-size:13px">Phase 6 · T6-08 人工校验工具</span></h1>
  <div class="sub">
    数据源 <code>data/trace/letter-strokes.json</code> ｜ 生成于 <span id="gen"></span> ｜
    当前显示 <span id="stat"></span> ｜ 生成器：<code>scripts/preview-trace-data.cjs</code>
  </div>
  <div class="toolbar">
    <input type="text" id="q" placeholder="筛选：字形 a / é / cursive / warn（⚠）">
    <label><input type="checkbox" id="ghost" checked> 叠加系统字体参照</label>
    <label><input type="checkbox" id="num" checked> 笔画序号</label>
    <label><input type="checkbox" id="guides" checked> 四线格</label>
    <button id="playAll">▶ 依次回放可见字形</button>
  </div>
  <div class="legend">
    <span class="la"><i></i>上伸线 / 大写线</span>
    <span class="lx"><i></i>小写主体线</span>
    <span class="lb"><i></i>基线</span>
    <span class="ld"><i></i>下伸线</span>
    <span class="ls"><i></i>倾斜参考线</span>
    <span class="lk"><i></i>base 笔画</span>
    <span class="lk2"><i></i>diacritic 音符</span>
    <span>🔴 起笔点（数字＝书写顺序）　🟩 entry 连写点　🟦 exit 连写点</span>
  </div>
</header>
<main id="batches"></main>
<script>${CLIENT_JS.replace("__PAYLOAD__", JSON.stringify(payload))}</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");

const flagCount = Object.keys(flags).length;
console.log(`✅ 已生成预览：${path.relative(ROOT, OUT)}`);
console.log(`   字形 ${payload.total} 个 ｜ 文件 ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
console.log(
  `   批次：${payload.batches.map((b) => `${b.name} ${b.keys.length}`).join(" ｜ ")}`
);
console.log(
  flagCount
    ? `   ⚠️  自动标出可疑项 ${flagCount} 个字形（预览中以 ⚠ 徽标显示，悬停看原因）`
    : "   ✅ 未发现可疑项"
);
console.log(`   打开方式：直接双击该 HTML 文件（file:// 即可，无需服务器）`);
