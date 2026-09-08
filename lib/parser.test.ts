import { describe, expect, it } from "vitest";
import {
  getAllAlphabets,
  getAllDialogues,
  getAllLogicItems,
  getAllMathItems,
  getAllSentences,
  getAllSongs,
  getAllStories,
  getAllWords,
  getContentStats,
  parseDialoguesFromFile,
  parseFrontMatter,
  parseManifest,
  parseMarkdown,
  parseSongsFromFile,
  parseWordsFromFile,
} from "./parser";
import { matchesLevel } from "./contentTypes";

// ─── front-matter ────────────────────────────────────────────────

describe("parseFrontMatter", () => {
  it("读取 type 与 levels（方括号列表）", () => {
    const { meta, body } = parseFrontMatter(
      ["---", "type: word", "levels: [L1, L2]", "---", "- zh: 苹果"].join("\n")
    );
    expect(meta.type).toBe("word");
    expect(meta.levels).toBe("L1, L2");
    expect(body.trim()).toBe("- zh: 苹果");
  });

  it("无 front-matter 时原样返回正文", () => {
    const { meta, body } = parseFrontMatter("# 标题\n- zh: 你好");
    expect(meta).toEqual({});
    expect(body).toContain("- zh: 你好");
  });
});

// ─── 双写法 / 标量 / 角色行 ──────────────────────────────────────

describe("parseMarkdown · 两种写法混排", () => {
  it("多行组与单行紧凑写法可混用，顺序保持 zh→en→fr", () => {
    const md = [
      "- zh: 你好",
      "- en: Hello",
      "- fr: Bonjour",
      "- zh: 谢谢 | Thank you | Merci",
    ].join("\n");
    const { groups, warnings } = parseMarkdown(md);
    expect(warnings).toHaveLength(0);
    const items = groups[0].items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ zh: "你好", en: "Hello", fr: "Bonjour" });
    expect(items[1]).toMatchObject({
      zh: "谢谢",
      en: "Thank you",
      fr: "Merci",
    });
  });

  it("紧凑写法字段顺序固定为 zh→en→fr（位置语义，不随书写习惯变化）", () => {
    const { groups } = parseMarkdown("- stem: 谁偷吃了蛋糕？| Who ate it? | Qui ?");
    expect(groups[0].items[0]).toMatchObject({
      key: "stem",
      zh: "谁偷吃了蛋糕？",
      en: "Who ate it?",
      fr: "Qui ?",
    });
  });

  it("分隔符不足 2 个时告警并退化为普通值", () => {
    const { groups, warnings } = parseMarkdown("- zh: 你好 | Hello");
    expect(warnings).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ zh: "你好 | Hello" });
  });
});

describe("parseMarkdown · 标量键附着", () => {
  it("level / category / emoji 附着到其后的第一条内容项", () => {
    const md = [
      "- level: L2",
      "- category: 颜色 Couleurs",
      "- emoji: 🔴",
      "- zh: 红色",
      "- en: red",
      "- fr: rouge",
      "",
      "- zh: 蓝色 | blue | bleu",
    ].join("\n");
    const { groups } = parseMarkdown(md);
    const [first, second] = groups[0].items;
    expect(first.meta).toMatchObject({ level: "L2", category: "颜色 Couleurs", emoji: "🔴" });
    expect(second.meta).toEqual({});
  });

  it("分组内的标量不跨 `##` 泄漏", () => {
    const md = ["## A", "- level: L1", "- zh: 一 | one | un", "## B", "- zh: 二 | two | deux"].join("\n");
    const { groups } = parseMarkdown(md);
    expect(groups).toHaveLength(3); // 含首个隐式分组
    const gA = groups.find((g) => g.heading === "A")!;
    const gB = groups.find((g) => g.heading === "B")!;
    expect(gA.items[0].meta.level).toBe("L1");
    expect(gB.items[0].meta.level).toBeUndefined();
  });
});

describe("parseMarkdown · 角色行（对话）", () => {
  it("同 role 三语顺序无关，构成一个 turn", () => {
    const md = [
      "- A fr: Bonjour, Madame !",
      "- A zh: 老师早上好！",
      "- A en: Good morning, Miss!",
      "- B zh: 莱奥早上好！",
      "- B en: Good morning, Léo!",
      "- B fr: Bonjour, Léo !",
    ].join("\n");
    const { groups } = parseMarkdown(md);
    const items = groups[0].items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      role: "A",
      zh: "老师早上好！",
      en: "Good morning, Miss!",
      fr: "Bonjour, Madame !",
    });
    expect(items[1].role).toBe("B");
    expect(items[1].fr).toBe("Bonjour, Léo !");
  });

  it("角色行与普通三语行可共存于同一分组", () => {
    const md = ["- zh: 场景说明 | scene note | note", "- A zh: 你好 | hi | salut"].join("\n");
    const { groups } = parseMarkdown(md);
    expect(groups[0].items[0].role).toBeUndefined();
    expect(groups[0].items[1].role).toBe("A");
  });
});

// ─── v1 回归 ─────────────────────────────────────────────────────

describe("v1 内容回归（sentences / stories 零修改）", () => {
  it("sentences.md 仍可解析出 300+ 句，且捕获 `##` 主题为 category", () => {
    const sentences = getAllSentences();
    expect(sentences.length).toBeGreaterThanOrEqual(300);
    const withCategory = sentences.filter((s) => !!s.category);
    expect(withCategory.length).toBe(sentences.length);
    expect(sentences[0].zh).toBeTruthy();
    expect(sentences[0].fr).toBeTruthy();
  });

  it("stories.md 仍可解析出 10 个故事，id 为 1..10", () => {
    const stories = getAllStories();
    expect(stories).toHaveLength(10);
    expect(stories.map((s) => s.id)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
    ]);
    expect(stories[0].title).toContain("小兔子");
    expect(stories[0].sentences.length).toBeGreaterThan(0);
  });
});

// ─── 六类新内容（C1 种子）───────────────────────────────────────

describe("六类新内容解析", () => {
  it("words.md：40 张词卡，含 level / category / emoji", () => {
    const words = getAllWords();
    expect(words.length).toBeGreaterThanOrEqual(40);
    const w = words[0];
    expect(w.category).toBeTruthy();
    expect(w.emoji).toBeTruthy();
    expect([w.zh, w.en, w.fr].every(Boolean)).toBe(true);
  });

  it("songs.md：儿歌含标题三语与逐句歌词", () => {
    const songs = getAllSongs();
    expect(songs.length).toBeGreaterThanOrEqual(2);
    const s = songs[0];
    expect([s.title.zh, s.title.en, s.title.fr].every(Boolean)).toBe(true);
    expect(s.lines.length).toBeGreaterThan(0);
    expect([s.lines[0].zh, s.lines[0].en, s.lines[0].fr].every(Boolean)).toBe(true);
  });

  it("dialogues.md：对话含 A/B 两个角色且三语齐全", () => {
    const dialogues = getAllDialogues();
    expect(dialogues.length).toBeGreaterThanOrEqual(2);
    const d = dialogues[0];
    expect(d.scene).toBeTruthy();
    expect(d.turns.length).toBeGreaterThanOrEqual(2);
    expect(new Set(d.turns.map((t) => t.role)).size).toBe(2);
  });

  it("alphabets.md：52 张字母卡（法/英各 26）", () => {
    const cards = getAllAlphabets();
    expect(cards).toHaveLength(52);
    expect(cards.filter((c) => c.lang === "fr")).toHaveLength(26);
    expect(cards.filter((c) => c.lang === "en")).toHaveLength(26);
  });

  it("math-bank.md / logic-bank.md：固定题含 kind 与答案", () => {
    const math = getAllMathItems();
    const logic = getAllLogicItems();
    expect(math.length).toBeGreaterThanOrEqual(10);
    expect(logic.length).toBeGreaterThanOrEqual(10);
    expect(math[0].kind).toBeTruthy();
    expect(math[0].answer).toBeTruthy();
    expect(logic[0].domain).toBeTruthy();
  });
});

// ─── manifest v2 ─────────────────────────────────────────────────

describe("manifest v2", () => {
  it("从 front-matter 读取 type 与 levels，文件名兜底推断", () => {
    const manifest = parseManifest();
    expect(manifest.length).toBeGreaterThanOrEqual(8);
    const word = manifest.find((e) => e.filename === "words.md");
    expect(word?.type).toBe("word");
    expect(word?.levels.length).toBeGreaterThan(0);
    const sentences = manifest.find((e) => e.filename === "sentences.md");
    expect(sentences?.type).toBe("sentence");
  });

  it("动态统计与解析结果一致（BUG-2 关闭）", () => {
    const stats = getContentStats();
    expect(stats.sentence).toBe(getAllSentences().length);
    expect(stats.story).toBe(getAllStories().length);
    expect(stats.word).toBe(getAllWords().length);
    expect(stats.languages).toBe(3);
    expect(stats.sentence).not.toBe(0);
  });
});

// ─── 学段过滤 ────────────────────────────────────────────────────

describe("matchesLevel", () => {
  it("未标注 level 的内容属通用池，全学段可见", () => {
    expect(matchesLevel(null, "L1")).toBe(true);
    expect(matchesLevel(undefined, "L6")).toBe(true);
  });

  it("已标注 level 的内容仅在对应学段可见", () => {
    expect(matchesLevel("L2", "L2")).toBe(true);
    expect(matchesLevel("L2", "L3")).toBe(false);
  });
});

// ─── 分组解析细节（词卡 / 儿歌 / 对话）──────────────────────────

describe("分组解析细节", () => {
  it("words.md 的 `##` 作为默认 category", () => {
    const md = ["## 颜色 Couleurs", "- level: L1", "- emoji: 🔴", "- zh: 红色 | red | rouge"].join("\n");
    const { groups } = parseMarkdown(md);
    const g = groups.find((x) => x.heading === "颜色 Couleurs")!;
    expect(g.items[0].meta.category).toBeUndefined();
    expect(g.heading).toBe("颜色 Couleurs");
  });

  it("songs：第一条为标题三语，其后为歌词", () => {
    const md = [
      "## 数字歌",
      "- level: L1",
      "- emoji: 🔢",
      "- zh: 数字歌",
      "- en: Number Song",
      "- fr: La chanson des nombres",
      "- zh: 一、二、三",
      "- en: One, two, three",
      "- fr: Un, deux, trois",
    ].join("\n");
    const { groups } = parseMarkdown(md);
    const g = groups.find((x) => x.heading === "数字歌")!;
    expect(g.items).toHaveLength(2);
    expect(g.items[0]).toMatchObject({ zh: "数字歌", fr: "La chanson des nombres" });
    expect(g.items[0].meta.level).toBe("L1");
  });

  it("dialogues：scene 标量被捕获", () => {
    const md = [
      "## 和妈妈说再见",
      "- level: L1",
      "- scene: 入园问候",
      "- A zh: 老师早上好！ | A en: Good morning! | A fr: Bonjour !",
    ].join("\n");
    const { groups } = parseMarkdown(md);
    const g = groups.find((x) => x.heading === "和妈妈说再见")!;
    expect(g.items[0].meta.scene).toBe("入园问候");
    expect(g.items[0].role).toBe("A");
  });
});

// ── Phase 5B：Sentence scene 解析（T5B.4）────────────────────────
describe("Sentence scene 字段", () => {
  it("getAllSentences 中部分句子带 scene（标注后 ≥ 0 条）", () => {
    const sentences = getAllSentences();
    const withScene = sentences.filter((s) => !!s.scene);
    expect(withScene.length).toBeGreaterThan(0);
    expect(withScene.every((s) => typeof s.scene === "string")).toBe(true);
  });
  it("getAllDialogues 返回 20 组对话且均有 scene", () => {
    const ds = getAllDialogues();
    expect(ds.length).toBe(20);
    ds.forEach((d) => {
      expect(d.scene).toBeTruthy();
      expect(d.turns.length).toBeGreaterThanOrEqual(4);
    });
  });
});
