#!/usr/bin/env node
/**
 * i18n 三语一致性校验（Phase 6 T6-01，契约 G-1）
 *
 * 校验三件事：
 *   1. 三个 locale 的 key 集合完全一致（缺失 / 多余均报错）；
 *   2. 模块文件内的 key 必须以「模块名.」为前缀（命名空间约束）；
 *   3. 源码中静态调用的 `t('key')` / `i18nT('key')` 必须在字典中存在（不漏翻）。
 *
 * 字典来源：
 *   - 基础 chrome：translations/<locale>.json
 *   - 功能模块：  translations/modules/<locale>/<module>.json（可选，见 lib/i18nModules.ts）
 *
 * 用法：node scripts/check-i18n-parity.cjs
 * 退出码：全部通过 → 0；存在任一问题 → 1（可直接用于 CI / npm run verify）。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOCALES = ["zh", "en", "fr"];
const TRANS_DIR = path.join(ROOT, "translations");
const MODULES_DIR = path.join(TRANS_DIR, "modules");
const SRC_DIRS = ["app", "components", "lib"];

const problems = [];
const notes = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadLocale(locale) {
  const dict = Object.create(null);
  const base = path.join(TRANS_DIR, `${locale}.json`);
  if (!fs.existsSync(base)) {
    throw new Error(`缺少基础字典：translations/${locale}.json`);
  }
  Object.assign(dict, readJson(base));

  const dir = path.join(MODULES_DIR, locale);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const mod = path.basename(f, ".json");
      const entries = readJson(path.join(dir, f));
      for (const [k, v] of Object.entries(entries)) {
        if (!k.startsWith(mod + ".")) {
          problems.push(
            `[命名空间] translations/modules/${locale}/${f} 中的 key "${k}" 未以 "${mod}." 开头`
          );
        }
        if (k in dict) {
          problems.push(`[重复 key] "${k}" 在 ${locale} 中重复定义（模块 ${mod} 与基础字典冲突）`);
        }
        dict[k] = v;
      }
    }
  }
  return dict;
}

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) {
      out.push(p);
    }
  }
}

function scanUsedKeys() {
  const used = new Map(); // key -> 首个出现位置
  const files = [];
  for (const d of SRC_DIRS) {
    const dir = path.join(ROOT, d);
    if (fs.existsSync(dir)) walk(dir, files);
  }
  // 匹配 t('key') / i18nT("key")，排除 obj.t( / format( 等
  const re = /(?:[^\w$.]|^)(?:t|i18nT)\(\s*(['"])([^'"`]+)\1/g;
  const keyShape = /^[A-Za-z][\w]*(\.[\w\u4e00-\u9fa5]+)+$/;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = m[2];
      if (!keyShape.test(key)) continue;
      if (!used.has(key)) {
        used.set(key, path.relative(ROOT, file));
      }
    }
  }
  return used;
}

// ── 1. 载入三语字典 ─────────────────────────────────────────────
let dicts;
try {
  dicts = { zh: loadLocale("zh"), en: loadLocale("en"), fr: loadLocale("fr") };
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const base = dicts.zh;
const baseKeys = Object.keys(base);

console.log(`字典规模：zh=${baseKeys.length} en=${Object.keys(dicts.en).length} fr=${Object.keys(dicts.fr).length}`);

// ── 2. 三语 key 集合比对（以 zh 为基准）────────────────────────
for (const locale of ["en", "fr"]) {
  const keys = new Set(Object.keys(dicts[locale]));
  const missing = baseKeys.filter((k) => !keys.has(k));
  const extra = Object.keys(dicts[locale]).filter((k) => !(k in base));
  if (missing.length) {
    problems.push(`[缺失] ${locale} 缺少 ${missing.length} 个 key：\n    ` + missing.join("\n    "));
  }
  if (extra.length) {
    problems.push(`[多余] ${locale} 有 ${extra.length} 个 zh 中不存在的 key：\n    ` + extra.join("\n    "));
  }
}

// ── 3. 空值与未翻译占位检查 ────────────────────────────────────
const PLACEHOLDER_RE = /^\s*$/;
for (const locale of LOCALES) {
  for (const [k, v] of Object.entries(dicts[locale])) {
    if (typeof v !== "string") {
      problems.push(`[类型] ${locale} 的 "${k}" 不是字符串`);
    } else if (PLACEHOLDER_RE.test(v)) {
      problems.push(`[空值] ${locale} 的 "${k}" 为空字符串`);
    }
  }
}

// ── 4. 源码使用的 key 是否都已翻译 ─────────────────────────────
const used = scanUsedKeys();
const untranslated = [];
for (const [key, where] of used) {
  if (!(key in base)) untranslated.push(`"${key}"（${where}）`);
}
if (untranslated.length) {
  problems.push(
    `[未翻译] 源码中使用但字典缺失的 key（${untranslated.length} 个）：\n    ` +
      untranslated.join("\n    ")
  );
}

const unusedCount = baseKeys.filter((k) => !used.has(k)).length;
notes.push(`源码静态引用 key：${used.size} 个；字典中未被静态引用：${unusedCount} 个（动态拼接 key 不计入）`);

// ── 输出 ───────────────────────────────────────────────────────
for (const n of notes) console.log(`ℹ️  ${n}`);
if (problems.length === 0) {
  console.log(`\n✅ i18n 三语一致：${baseKeys.length} 个 key 全部对齐`);
  process.exit(0);
}
console.error("");
for (const p of problems) console.error(`❌ ${p}`);
console.error(`\n合计 ${problems.length} 项问题`);
process.exit(1);
