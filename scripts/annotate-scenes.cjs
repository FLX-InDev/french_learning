/**
 * Phase 5B T5B.4：为 data/sentences.md 的主题组插入组级 `- scene:` 场景标注
 * （组级标量 → 组内全部句子继承，parseSentencesFromFile 已支持）。
 * 运行：node scripts/annotate-scenes.cjs（幂等：已标注的组跳过）
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "sentences.md");

// 主题 → 幼儿园场景（对应 /life 10 节点；未列出的主题不标注 = 通用）
const THEME_SCENE = {
  应对欺负: "游戏时间",
  处理冲突: "游戏时间",
  与同伴合作: "游戏时间",
  表达不满或反对: "游戏时间",
  寻求帮助: "上课",
  安慰他人: "游戏时间",
  协商与妥协: "游戏时间",
  解释原因: "上课",
  喜悦: "晨圈",
  悲伤: "晨圈",
  愤怒: "晨圈",
  恐惧: "晨圈",
  焦虑: "晨圈",
  惊讶: "晨圈",
  羞愧: "晨圈",
  好奇: "晨圈",
  无聊: "游戏时间",
  其他情绪: "晨圈",
  描述动作: "上课",
  描述状态: "上课",
  提问: "上课",
  表达需求: "上课",
  表达意见: "上课",
  讲述事件: "晨圈",
  描述物体: "上课",
  表达感受: "晨圈",
  社交互动: "入园问候",
  解决问题: "游戏时间",
};

let content = fs.readFileSync(FILE, "utf8");
const lines = content.split("\n");
const out = [];
let inserted = 0;
let skipped = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  out.push(line);
  const m = line.match(/^## (.+?)\s*$/);
  if (!m) continue;
  const theme = m[1].trim();
  const scene = THEME_SCENE[theme];
  if (!scene) continue;
  // 幂等：下一行已是场景标注则跳过
  const next = (lines[i + 1] || "").trim();
  if (next.startsWith("- scene:")) {
    skipped++;
    continue;
  }
  out.push(`- scene: ${scene}`);
  inserted++;
}

fs.writeFileSync(FILE, out.join("\n"));
console.log(`inserted ${inserted} scene annotations, skipped ${skipped} (already present)`);
