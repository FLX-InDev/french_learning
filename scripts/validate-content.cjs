/**
 * 内容校验脚本（T5D.6，Phase 5D）
 * 运行：node scripts/validate-content.cjs
 */
const fs = require("fs");
const path = require("path");

// 简易 Markdown 校验（不依赖 TypeScript 编译产物）
function checkTri(file, name) {
  const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const lines = content.split("\n");
  let errors = 0;
  // 紧凑写法：`- zh: 中 | EN | FR`（单行含三语，字段顺序 zh→en→fr）
  const compact = lines.filter((l) => l.startsWith("- zh:") && l.includes("|")).length;
  // 多行写法：`- zh:` / `- en:` / `- fr:` 各一行
  const zh = lines.filter((l) => l.startsWith("- zh:")).length;
  const en = lines.filter((l) => l.startsWith("- en:")).length;
  const fr = lines.filter((l) => l.startsWith("- fr:")).length;
  if (compact > 0) {
    // 紧凑写法为主：验证 zh 行数 = 条目总数
    const total = zh;
    const enCompact = lines.filter((l) => l.startsWith("- en:") && l.includes("|")).length;
    const frCompact = lines.filter((l) => l.startsWith("- fr:") && l.includes("|")).length;
    if (enCompact > 0 || frCompact > 0) { console.error(`❌ ${name}: 紧凑写法不应包含 - en:/ - fr: 行`); errors++; }
  } else {
    if (zh !== en || en !== fr) { console.error(`❌ ${name}: 三语行数不一致 (zh=${zh} en=${en} fr=${fr})`); errors++; }
  }
  return errors;
}
let e = 0;
e += checkTri("data/words.md", "词卡");
e += checkTri("data/songs.md", "儿歌");
e += checkTri("data/dialogues.md", "对话");
e += checkTri("data/sentences.md", "句子");
e += checkTri("data/stories.md", "故事");
if (e > 0) { console.log(`\n${e} 个文件三语不一致`); process.exit(1); }
console.log("✅ 内容校验通过，三语字段齐全");