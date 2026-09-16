#!/usr/bin/env node
/**
 * 描红笔顺数据校验（Phase 6 T6-08；契约 G / `docs/phase-6/trace-data-spec.md §10`）
 *
 * 校验内容（对应规格 §10 的自动化项）：
 *   1. 字形键合法且属于 94 键规范集合（`${style}:${glyph}`）
 *   2. 分组数量正确（print 大写 26 / print 小写 26 / cursive 小写 26 / print 变音 8 / cursive 变音 8）
 *   3. 坐标 ∈ [0,100]；点格式 [x, y]
 *   4. 每笔 points ≥ 2、strokes ≥ 1
 *   5. guides 单调（ascender ≤ capHeight < xHeight < baseline < descender）且 ∈ [0,100]；slant ∈ [0,45]
 *   6. langs 与规范一致（print 字母 ["en","fr"]；cursive 与变音 ["fr"]）
 *   7. 变音字形含 diacritic 笔画且其下标大于所有 base
 *   8. cursive 字形含 connect，且 entry/exit 与 base 首/末点一致（±2）
 *   9. source.by / source.date 非空
 *
 * 用法：
 *   node scripts/validate-trace-data.cjs               # 校验 data/trace/*.json（忽略 *.template.json）
 *   node scripts/validate-trace-data.cjs a.json b.json # 校验指定文件
 *   node scripts/validate-trace-data.cjs --strict      # 待填（null / 空 strokes）也计为失败（最终验收用）
 *
 * 退出码：0 = 通过；1 = 存在错误（或 --strict 下存在待填）
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DIR = path.join(ROOT, "data", "trace");

// ── 规范字形集合（94）────────────────────────────────────────────
const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
const UPPER = LOWER.map((c) => c.toUpperCase());
const ACCENTED = ["é", "è", "ê", "à", "ù", "î", "ô", "ç"];

const GROUPS = [
  { name: "print 大写", style: "print", glyphs: UPPER, langs: ["en", "fr"] },
  { name: "print 小写", style: "print", glyphs: LOWER, langs: ["en", "fr"] },
  { name: "cursive 小写", style: "cursive", glyphs: LOWER, langs: ["fr"] },
  { name: "print 变音", style: "print", glyphs: ACCENTED, langs: ["fr"] },
  { name: "cursive 变音", style: "cursive", glyphs: ACCENTED, langs: ["fr"] },
];

const EXPECTED = new Map();
for (const g of GROUPS) {
  for (const glyph of g.glyphs) {
    EXPECTED.set(`${g.style}:${glyph}`, {
      style: g.style,
      glyph,
      langs: g.langs,
      accented: ACCENTED.includes(glyph),
      group: g.name,
    });
  }
}

// ── 参数 ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const fileArgs = argv.filter((a) => !a.startsWith("--"));

function collectFiles() {
  if (fileArgs.length > 0) return fileArgs.map((f) => path.resolve(process.cwd(), f));
  if (!fs.existsSync(DEFAULT_DIR)) return [];
  return fs
    .readdirSync(DEFAULT_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".template.json"))
    .map((f) => path.join(DEFAULT_DIR, f));
}

// ── 校验 ────────────────────────────────────────────────────────
const errors = [];
const pending = [];
const seen = new Map(); // key -> file

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isPoint(p) {
  return Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
}

function near(a, b, tol = 2) {
  return isPoint(a) && isPoint(b) && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

function validateEntry(key, e, file) {
  const loc = `${file} → ${key}`;
  const spec = EXPECTED.get(key);
  if (!spec) {
    errors.push(`${loc}：未知字形键（不在 94 键规范集合内）`);
    return;
  }

  if (!e || typeof e !== "object" || Array.isArray(e)) {
    errors.push(`${loc}：条目必须为对象`);
    return;
  }

  // 元信息一致性
  if (e.key !== key) errors.push(`${loc}：e.key（${e.key}）与键名不一致`);
  if (e.glyph !== spec.glyph) errors.push(`${loc}：glyph 应为 "${spec.glyph}"`);
  if (e.style !== spec.style) errors.push(`${loc}：style 应为 "${spec.style}"`);
  if (JSON.stringify(e.langs) !== JSON.stringify(spec.langs))
    errors.push(`${loc}：langs 应为 ${JSON.stringify(spec.langs)}`);

  // viewBox
  if (!e.viewBox || e.viewBox.w !== 100 || e.viewBox.h !== 100)
    errors.push(`${loc}：viewBox 应为 { w: 100, h: 100 }`);

  // guides
  const g = e.guides || {};
  const gn = [g.ascender, g.capHeight, g.xHeight, g.baseline, g.descender];
  if (!gn.every(isNum)) {
    errors.push(`${loc}：guides 缺少数值（ascender/capHeight/xHeight/baseline/descender）`);
  } else {
    if (gn.some((v) => v < 0 || v > 100)) errors.push(`${loc}：guides 取值须 ∈ [0,100]`);
    if (!(g.ascender <= g.capHeight && g.capHeight < g.xHeight && g.xHeight < g.baseline && g.baseline < g.descender))
      errors.push(`${loc}：guides 须满足 ascender ≤ capHeight < xHeight < baseline < descender`);
  }
  if (g.slant !== undefined && (!isNum(g.slant) || g.slant < 0 || g.slant > 45))
    errors.push(`${loc}：slant 须为 [0,45] 的数值`);

  // source
  if (!e.source || typeof e.source.by !== "string" || !e.source.by.trim())
    errors.push(`${loc}：缺少 source.by`);
  if (!e.source || typeof e.source.date !== "string" || !e.source.date.trim())
    errors.push(`${loc}：缺少 source.date`);

  // strokes
  if (!Array.isArray(e.strokes) || e.strokes.length === 0) {
    pending.push(`${key}（${spec.group}）`);
    return;
  }

  const baseIdx = [];
  const diaIdx = [];
  e.strokes.forEach((s, i) => {
    if (!s || typeof s !== "object") {
      errors.push(`${loc}：strokes[${i}] 非法`);
      return;
    }
    if (s.kind !== "base" && s.kind !== "diacritic")
      errors.push(`${loc}：strokes[${i}].kind 须为 "base" | "diacritic"`);
    if (!Array.isArray(s.points) || s.points.length < 2) {
      errors.push(`${loc}：strokes[${i}].points 须 ≥ 2 个点`);
    } else {
      s.points.forEach((p, pi) => {
        if (!isPoint(p)) {
          errors.push(`${loc}：strokes[${i}].points[${pi}] 须为 [x, y]`);
        } else if (p[0] < 0 || p[0] > 100 || p[1] < 0 || p[1] > 100) {
          errors.push(`${loc}：坐标越界 ${JSON.stringify(p)}`);
        }
      });
    }
    if (s.kind === "base") baseIdx.push(i);
    if (s.kind === "diacritic") diaIdx.push(i);
  });

  // 变音规则
  if (spec.accented) {
    if (diaIdx.length === 0) {
      errors.push(`${loc}：变音字形缺少 diacritic 笔画`);
    } else if (baseIdx.some((b) => diaIdx.some((d) => b > d))) {
      errors.push(`${loc}：diacritic 笔画须排在所有 base 之后`);
    }
  }

  // cursive 连笔（connect）
  if (spec.style === "cursive") {
    if (!e.connect || !isPoint(e.connect.entry) || !isPoint(e.connect.exit)) {
      errors.push(`${loc}：cursive 必须提供 connect.entry / connect.exit`);
    } else {
      const firstBase = e.strokes.find((s) => s.kind === "base" && Array.isArray(s.points));
      const lastBase = [...e.strokes].reverse().find((s) => s.kind === "base" && Array.isArray(s.points));
      if (firstBase && !near(e.connect.entry, firstBase.points[0]))
        errors.push(`${loc}：connect.entry 与 base 首点不一致（±2）`);
      if (lastBase && !near(e.connect.exit, lastBase.points[lastBase.points.length - 1]))
        errors.push(`${loc}：connect.exit 与 base 末点不一致（±2）`);
    }
  }
}

// ── 主流程 ──────────────────────────────────────────────────────
const files = collectFiles();
if (files.length === 0) {
  console.log("ℹ️  未找到数据文件（data/trace/*.json，忽略 *.template.json）。");
  console.log("   提示：复制 data/trace/letter-strokes.template.json 后填充，或按批次新建 json。");
  process.exit(strict ? 1 : 0);
}

for (const file of files) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    errors.push(`${file}：JSON 解析失败（${err.message}）`);
    continue;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    errors.push(`${file}：顶层须为对象`);
    continue;
  }
  for (const [key, entry] of Object.entries(json)) {
    if (key === "_meta") continue;
    const rel = path.relative(ROOT, file) || file;
    if (seen.has(key)) {
      errors.push(`${key}：在 ${seen.get(key)} 与 ${rel} 中重复定义`);
      continue;
    }
    seen.set(key, rel);
    if (entry === null) {
      const spec = EXPECTED.get(key);
      pending.push(`${key}${spec ? `（${spec.group}）` : "（未知键）"}`);
      continue;
    }
    validateEntry(key, entry, rel);
  }
}

// 缺失键（既未定义也未 pending 的）
const missing = [...EXPECTED.keys()].filter((k) => !seen.has(k));

// ── 输出 ────────────────────────────────────────────────────────
const total = EXPECTED.size;
const filled = total - pending.length - missing.length;
console.log(`数据文件：${files.map((f) => path.relative(ROOT, f)).join(", ")}`);
console.log(`📊 进度：已填 ${filled}/${total}　待填 ${pending.length}　缺失 ${missing.length}`);

if (missing.length) {
  console.log(`\n⚠️  未定义的字形键（${missing.length}）：\n    ${missing.join("\n    ")}`);
}

if (errors.length === 0) {
  if (pending.length > 0) {
    console.log(`\n⏳ 待填字形（${pending.length}）：\n    ${pending.join("\n    ")}`);
  }
  if (strict && (pending.length > 0 || missing.length > 0)) {
    console.error(`\n❌ --strict：仍有未完成字形（待填 ${pending.length} + 缺失 ${missing.length}）`);
    process.exit(1);
  }
  console.log(`\n✅ 描红笔顺数据校验通过（结构 / 坐标 / 参考线 / 连笔 / 元数据）`);
  process.exit(0);
}

console.error("");
for (const p of errors) console.error(`❌ ${p}`);
console.error(`\n合计 ${errors.length} 项问题`);
process.exit(1);
