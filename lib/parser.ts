/**
 * Markdown 内容解析器 v2（PRD §9.2 / §9.3，Dev-Plan T1.2）
 *
 * v2 增强（对 v1 格式完全向后兼容）：
 *  1. manifest v2：条目仍为 `- [x] [名称](./file.md) - 描述`，
 *     type / levels 从内容文件的 front-matter 读取，缺省按文件名推断；
 *  2. 双写法：多行 `- zh:/- en:/- fr:` 与单行紧凑 `- key: zh | en | fr` 可混用；
 *  3. 角色行：`- A zh: …`，同 role 的三语行构成一个 turn，语言顺序无关；
 *  4. 标量键（level/category/scene/emoji/kind/domain…）附着到其后的第一条内容项；
 *  5. `##` 在 sentences 中为「主题」→ category，在 stories/songs 中为标题。
 */

import fs from "fs";
import path from "path";
import { isLevel, type Level } from "./levels";
import {
  CONTENT_TYPES,
  type AlphabetCard,
  type ContentType,
  type Dialogue,
  type DialogueTurn,
  type LogicItem,
  type MathItem,
  type Song,
  type SongLine,
  type Tri,
  type Word,
} from "./contentTypes";

// ─── v1 兼容类型 ─────────────────────────────────────────────────

export interface Sentence {
  zh: string;
  en: string;
  fr: string;
  /** v2 新增：学段标注（null / 缺省 = 通用池，全学段可见） */
  level?: Level | null;
  /** v2 新增：主题（sentences 的 `##` 标题或 `- category:`） */
  category?: string;
}

export interface Story {
  id: string;
  title: string;
  sentences: Sentence[];
  level?: Level | null;
  emoji?: string;
}

export interface MaterialEntry {
  name: string;
  filename: string;
  enabled: boolean;
  type: ContentType;
  /** front-matter 声明的适用学段（为空表示不限） */
  levels: Level[];
  description: string;
}

// ─── 解析中间结构 ────────────────────────────────────────────────

export type ParsedItem = {
  /** 紧凑写法的字段名（word / example / prompt / answer / stem …） */
  key?: string;
  /** 对话角色（A / B） */
  role?: string;
  zh: string;
  en: string;
  fr: string;
  meta: Record<string, string>;
};

export type ParsedGroup = {
  heading: string;
  meta: Record<string, string>;
  items: ParsedItem[];
};

export type ParseResult = {
  groups: ParsedGroup[];
  warnings: string[];
};

// ─── IO helpers ──────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const MANIFEST_FILE = path.join(DATA_DIR, "french_learning_materials.md");

function readDataFile(filename: string): string {
  const filepath = path.join(DATA_DIR, filename);
  return fs.readFileSync(filepath, "utf-8");
}

function readDataFileSafe(filename: string): string | null {
  try {
    return readDataFile(filename);
  } catch {
    return null;
  }
}

// ─── front-matter ────────────────────────────────────────────────

/**
 * 解析文件头 front-matter（`---` 包裹的 key: value 列表）。
 * 例：
 *   ---
 *   type: word
 *   levels: [L1, L2]
 *   ---
 */
export function parseFrontMatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const lines = raw.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== "---") return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---") {
      i++;
      break;
    }
    const m = t.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) {
      // levels: [L1, L2] → "L1, L2"
      meta[m[1].toLowerCase()] = m[2].trim().replace(/^\[|\]$/g, "").trim();
    }
  }
  return { meta, body: lines.slice(i).join("\n") };
}

// ─── manifest ────────────────────────────────────────────────────

const TYPE_BY_FILENAME: Record<string, ContentType> = {
  "sentences.md": "sentence",
  "stories.md": "story",
  "words.md": "word",
  "songs.md": "song",
  "dialogues.md": "dialogue",
  "alphabets.md": "alphabet",
  "math-bank.md": "math",
  "logic-bank.md": "logic",
};

function inferType(filename: string): ContentType {
  if (TYPE_BY_FILENAME[filename]) return TYPE_BY_FILENAME[filename];
  const base = filename.replace(/\.md$/, "");
  const hit = CONTENT_TYPES.find((t) => t === base || base.startsWith(t));
  return hit ?? "sentence";
}

function isContentType(v: unknown): v is ContentType {
  return typeof v === "string" && (CONTENT_TYPES as string[]).includes(v);
}

function parseLevels(v: string | undefined): Level[] {
  if (!v) return [];
  return v
    .split(/[,，\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(isLevel);
}

export function parseManifest(): MaterialEntry[] {
  const content = fs.readFileSync(MANIFEST_FILE, "utf-8");
  const lines = content.split("\n");
  const entries: MaterialEntry[] = [];

  const entryRegex =
    /^-\s+\[([ xX])\]\s*\[([^\]]+)\]\(\.\/([^)]+)\)(?:\s*[-–—]\s*(.+))?/;

  for (const line of lines) {
    const match = line.trim().match(entryRegex);
    if (!match) continue;

    const [, checkbox, name, filename, description] = match;
    const raw = readDataFileSafe(filename);
    const fm: { meta: Record<string, string> } = raw
      ? parseFrontMatter(raw)
      : { meta: {} };

    entries.push({
      name,
      filename,
      enabled: checkbox.toLowerCase() === "x",
      type: isContentType(fm.meta.type) ? fm.meta.type : inferType(filename),
      levels: parseLevels(fm.meta.levels),
      description: description?.trim() || "",
    });
  }

  return entries;
}

/** manifest 中处于勾选状态（启用）的条目 */
export function getEnabledManifest(): MaterialEntry[] {
  return parseManifest().filter((e) => e.enabled);
}

// ─── 核心：Markdown 行解析（纯函数，可单测）────────────────────

/** 只取标量值的键（不参与三语组合） */
const SCALAR_KEYS = new Set([
  "level",
  "category",
  "scene",
  "emoji",
  "audio",
  "kind",
  "domain",
  "image",
  "id",
  "lang",
  "letter",
  "time",
]);

/** 可作为三语组的键（紧凑写法） */
const TRI_KEYS = new Set([
  "zh",
  "en",
  "fr",
  "title",
  "word",
  "example",
  "prompt",
  "answer",
  "stem",
  "clue",
  "explanation",
  "line",
]);

const ROLE_RE = /^([A-Za-z])\s+(zh|en|fr)$/;

export function parseMarkdown(content: string): ParseResult {
  const groups: ParsedGroup[] = [];
  const warnings: string[] = [];

  let group: ParsedGroup = { heading: "", meta: {}, items: [] };
  groups.push(group);

  /** 待附着到「下一条内容项」的标量键 */
  let pending: Record<string, string> = {};
  /** 多行三语缓冲 */
  let buf: { zh: string; en: string; fr: string } | null = null;
  /** 角色行缓冲 */
  let roleBuf: {
    role: string;
    zh: string;
    en: string;
    fr: string;
    meta: Record<string, string>;
  } | null = null;

  const takePending = (): Record<string, string> => {
    const copy = { ...pending };
    pending = {};
    return copy;
  };

  const flushTri = () => {
    if (!buf) return;
    if (buf.zh || buf.en || buf.fr) {
      group.items.push({ zh: buf.zh, en: buf.en, fr: buf.fr, meta: takePending() });
    }
    buf = null;
  };

  const flushRole = () => {
    if (!roleBuf) return;
    if (roleBuf.zh || roleBuf.en || roleBuf.fr) {
      group.items.push({
        role: roleBuf.role,
        zh: roleBuf.zh,
        en: roleBuf.en,
        fr: roleBuf.fr,
        meta: roleBuf.meta,
      });
    }
    roleBuf = null;
  };

  const flushAll = () => {
    flushTri();
    flushRole();
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("## ")) {
      flushAll();
      pending = {};
      group = { heading: line.slice(3).trim(), meta: {}, items: [] };
      groups.push(group);
      continue;
    }

    if (!line.startsWith("- ")) continue;

    const body = line.slice(2).trim();
    const m = body.match(/^([^:]+):\s*([\s\S]*)$/);
    if (!m) continue;

    const key = m[1].trim();
    const value = m[2].trim();
    const parts = value.split("|").map((s) => s.trim());

    // 1) 角色行：`- A zh: …`
    //    单行紧凑写法 `- A zh: … | A en: … | A fr: …`（PRD §9.3）同样支持
    const roleMatch = key.match(ROLE_RE);
    if (roleMatch) {
      flushTri();
      const [, firstRole, firstLang] = roleMatch;
      const chunks = value.split("|").map((s) => s.trim());
      const prefixed = chunks.filter((c) =>
        /^[A-Za-z]\s+(zh|en|fr)\s*:/.test(c)
      );

      if (prefixed.length > 0) {
        // 紧凑角色行：`- A zh: … | A en: … | A fr: …`（PRD §9.3）
        for (const chunk of chunks) {
          const cm = chunk.match(/^([A-Za-z])\s+(zh|en|fr)\s*:\s*([\s\S]*)$/);
          if (!cm) continue;
          const [, role, lang, text] = cm;
          if (roleBuf && roleBuf.role !== role) {
            flushRole();
            pending = {};
          }
          if (!roleBuf) {
            roleBuf = { role, zh: "", en: "", fr: "", meta: takePending() };
          }
          roleBuf[lang as "zh" | "en" | "fr"] = text.trim();
        }
      } else if (chunks.length >= 3) {
        // `- A zh: 你好 | hi | salut` → 该角色的 zh/en/fr
        if (roleBuf && roleBuf.role !== firstRole) {
          flushRole();
          pending = {};
        }
        if (!roleBuf) {
          roleBuf = { role: firstRole, zh: "", en: "", fr: "", meta: takePending() };
        }
        roleBuf.zh = chunks[0];
        roleBuf.en = chunks[1];
        roleBuf.fr = chunks[2];
      } else {
        // 普通角色行：`- A zh: …`
        if (roleBuf && roleBuf.role !== firstRole) {
          flushRole();
          pending = {};
        }
        if (!roleBuf) {
          roleBuf = {
            role: firstRole,
            zh: "",
            en: "",
            fr: "",
            meta: takePending(),
          };
        }
        roleBuf[firstLang as "zh" | "en" | "fr"] = value;
      }

      if (roleBuf && roleBuf.zh && roleBuf.en && roleBuf.fr) flushRole();
      continue;
    }

    const lowerKey = key.toLowerCase();

    // 2) 紧凑三语写法：`- <key>: zh | en | fr`
    if (parts.length >= 3 && (TRI_KEYS.has(lowerKey) || !SCALAR_KEYS.has(lowerKey))) {
      flushTri();
      if (roleBuf) flushRole();
      const meta = takePending();
      group.items.push({
        key: lowerKey === "zh" ? undefined : lowerKey,
        zh: parts[0],
        en: parts[1],
        fr: parts[2],
        meta,
      });
      continue;
    }

    // 3) 单行写法分隔符不足 2 个 → 告警（P1 校验脚本拦截），退化为普通值
    if (parts.length === 2) {
      warnings.push(`三语字段不完整（需 2 个 "|" 分隔符）：${line}`);
    }

    // 4) 标量键：向后附着到下一条内容项
    if (SCALAR_KEYS.has(lowerKey)) {
      pending[lowerKey] = value;
      group.meta[lowerKey] = value;
      continue;
    }

    // 5) 非三语的补充键（如 `- answer: 12`）：附着到上一条同组记录
    if (!TRI_KEYS.has(lowerKey)) {
      const last = group.items[group.items.length - 1];
      if (last) last.meta[lowerKey] = value;
      else pending[lowerKey] = value;
      continue;
    }

    // 6) 多行三语组：`- zh:` / `- en:` / `- fr:`（遇 fr 收口，v1 行为）
    if (!buf) buf = { zh: "", en: "", fr: "" };
    if (lowerKey === "zh") buf.zh = value;
    else if (lowerKey === "en") buf.en = value;
    else if (lowerKey === "fr") buf.fr = value;
    if (lowerKey === "fr") flushTri();
  }

  flushAll();

  return { groups, warnings };
}

// ─── 通用小工具 ──────────────────────────────────────────────────

function parseLevel(v: string | undefined): Level | null {
  if (!v) return null;
  const up = v.trim().toUpperCase();
  return isLevel(up) ? up : null;
}

function triOf(it: ParsedItem): Tri {
  return { zh: it.zh, en: it.en, fr: it.fr };
}

/** 按「首领项」把 items 切成多条记录（用于 alphabets / math-bank / logic-bank） */
function groupByLeader<T>(items: T[], isLeader: (t: T) => boolean): T[][] {
  const out: T[][] = [];
  for (const it of items) {
    if (isLeader(it) || out.length === 0) out.push([it]);
    else out[out.length - 1].push(it);
  }
  return out;
}

function findByKey(record: ParsedItem[], key: string): ParsedItem | undefined {
  return record.find((it) => it.key === key);
}

function slug(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

// ─── 分类解析器 ──────────────────────────────────────────────────

export function parseSentencesFromFile(filepath: string): Sentence[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: Sentence[] = [];
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.zh && !it.en && !it.fr) continue;
      out.push({
        zh: it.zh,
        en: it.en,
        fr: it.fr,
        level: parseLevel(it.meta.level),
        category: it.meta.category || g.heading || "",
      });
    }
  }
  return out;
}

export function parseStoriesFromFile(filepath: string): Story[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const stories: Story[] = [];

  for (const g of groups) {
    if (!g.heading) continue;
    const sentences: Sentence[] = g.items
      .filter((it) => it.zh || it.en || it.fr)
      .map((it) => ({
        zh: it.zh,
        en: it.en,
        fr: it.fr,
        level: parseLevel(it.meta.level),
        category: it.meta.category || "",
      }));
    if (sentences.length === 0) continue;
    stories.push({
      id: String(stories.length + 1),
      title: g.heading,
      sentences,
      level: parseLevel(g.items[0]?.meta.level ?? g.meta.level),
      emoji: g.items[0]?.meta.emoji ?? g.meta.emoji,
    });
  }

  return stories;
}

export function parseWordsFromFile(filepath: string): Word[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: Word[] = [];
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.zh && !it.en && !it.fr) continue;
      out.push({
        id: slug("w", out.length),
        level: parseLevel(it.meta.level),
        category: it.meta.category || g.heading || "",
        emoji: it.meta.emoji || "",
        image: it.meta.image,
        zh: it.zh,
        en: it.en,
        fr: it.fr,
      });
    }
  }
  return out;
}

export function parseSongsFromFile(filepath: string): Song[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: Song[] = [];

  for (const g of groups) {
    if (!g.heading || g.items.length === 0) continue;
    const items = g.items.filter((it) => it.zh || it.en || it.fr);
    if (items.length === 0) continue;

    // 约定：组内第一条为「标题三语」，其后为逐句歌词；
    // 只有一条时视为纯歌词，标题取 `##` 标题。
    const hasTitleRow = items.length >= 2;
    const title = hasTitleRow
      ? triOf(items[0])
      : { zh: g.heading, en: g.heading, fr: g.heading };
    const lines: SongLine[] = (hasTitleRow ? items.slice(1) : items).map((it) => {
      const line: SongLine = { zh: it.zh, en: it.en, fr: it.fr };
      if (it.meta.time) {
        const t = Number(it.meta.time);
        if (!Number.isNaN(t)) line.time = t;
      }
      return line;
    });

    const head = items[0];
    out.push({
      id: slug("song", out.length),
      level: parseLevel(head.meta.level ?? g.meta.level),
      title,
      emoji: head.meta.emoji || g.meta.emoji || "",
      audio: head.meta.audio || g.meta.audio,
      lines,
    });
  }

  return out;
}

export function parseDialoguesFromFile(filepath: string): Dialogue[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: Dialogue[] = [];

  for (const g of groups) {
    if (!g.heading) continue;
    const turns: DialogueTurn[] = g.items
      .filter((it) => it.role && (it.zh || it.en || it.fr))
      .map((it) => ({
        role: (it.role === "B" ? "B" : "A") as "A" | "B",
        zh: it.zh,
        en: it.en,
        fr: it.fr,
      }));
    if (turns.length === 0) continue;

    const titleItem = g.items.find((it) => it.key === "title");
    const title = titleItem
      ? triOf(titleItem)
      : { zh: g.heading, en: g.heading, fr: g.heading };
    const head = g.items[0];

    out.push({
      id: slug("dlg", out.length),
      level: parseLevel(head?.meta.level ?? g.meta.level),
      scene: head?.meta.scene || g.meta.scene || "",
      title,
      turns,
    });
  }

  return out;
}

export function parseAlphabetsFromFile(filepath: string): AlphabetCard[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: AlphabetCard[] = [];

  for (const g of groups) {
    const items = g.items.filter((it) => it.zh || it.en || it.fr || it.meta.letter);
    if (items.length === 0) continue;

    for (const record of groupByLeader(items, (it) => !!it.meta.letter)) {
      const head = record[0];
      const wordItem = findByKey(record, "word") ?? head;
      const exampleItem = findByKey(record, "example");
      const letter = head.meta.letter || head.zh || "";
      const lang: "fr" | "en" =
        (record.find((it) => it.meta.lang)?.meta.lang ?? g.meta.lang) === "en"
          ? "en"
          : "fr";
      out.push({
        id: `${lang}-${letter}`,
        letter,
        lang,
        emoji: head.meta.emoji || "",
        word: triOf(wordItem),
        example: exampleItem ? triOf(exampleItem) : undefined,
      });
    }
  }

  return out;
}

export function parseMathBankFromFile(filepath: string): MathItem[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: MathItem[] = [];

  for (const g of groups) {
    const items = g.items.filter((it) => it.zh || it.en || it.fr || it.meta.kind);
    if (items.length === 0) continue;

    for (const record of groupByLeader(items, (it) => !!it.meta.kind)) {
      const head = record[0];
      const promptItem = findByKey(record, "prompt") ?? head;
      const answerItem = findByKey(record, "answer");
      const expItem = findByKey(record, "explanation");
      out.push({
        id: head.meta.id || slug("math", out.length),
        level: parseLevel(head.meta.level ?? g.meta.level),
        kind: head.meta.kind || "unknown",
        prompt: triOf(promptItem),
        answer: answerItem ? answerItem.zh : head.meta.answer || "",
        answerTri: answerItem ? triOf(answerItem) : undefined,
        explanation: expItem ? triOf(expItem) : undefined,
      });
    }
  }

  return out;
}

export function parseLogicBankFromFile(filepath: string): LogicItem[] {
  const content = readDataFile(filepath);
  const { groups } = parseMarkdown(content);
  const out: LogicItem[] = [];

  for (const g of groups) {
    const items = g.items.filter((it) => it.zh || it.en || it.fr || it.meta.kind);
    if (items.length === 0) continue;

    for (const record of groupByLeader(items, (it) => !!it.meta.kind)) {
      const head = record[0];
      const stemItem = findByKey(record, "stem") ?? head;
      const clueItem = findByKey(record, "clue");
      const answerItem = findByKey(record, "answer");
      const expItem = findByKey(record, "explanation");
      out.push({
        id: head.meta.id || slug("logic", out.length),
        level: parseLevel(head.meta.level ?? g.meta.level),
        domain: head.meta.domain || "",
        kind: head.meta.kind || "unknown",
        stem: triOf(stemItem),
        clue: clueItem ? triOf(clueItem) : undefined,
        answer: answerItem ? answerItem.zh : head.meta.answer || "",
        answerTri: answerItem ? triOf(answerItem) : undefined,
        explanation: expItem ? triOf(expItem) : undefined,
      });
    }
  }

  return out;
}

// ─── 聚合（按 manifest 勾选状态装载）─────────────────────────────

function collect<T>(type: ContentType, parse: (f: string) => T[]): T[] {
  const out: T[] = [];
  for (const entry of getEnabledManifest()) {
    if (entry.type !== type) continue;
    try {
      out.push(...parse(entry.filename));
    } catch {
      // 内容文件缺失或格式异常时跳过，不影响整站构建
    }
  }
  return out;
}

export function getAllSentences(): Sentence[] {
  return collect("sentence", parseSentencesFromFile);
}

export function getAllStories(): Story[] {
  return collect("story", parseStoriesFromFile);
}

export function getAllWords(): Word[] {
  return collect("word", parseWordsFromFile);
}

export function getAllSongs(): Song[] {
  return collect("song", parseSongsFromFile);
}

export function getAllDialogues(): Dialogue[] {
  return collect("dialogue", parseDialoguesFromFile);
}

export function getAllAlphabets(): AlphabetCard[] {
  return collect("alphabet", parseAlphabetsFromFile);
}

export function getAllMathItems(): MathItem[] {
  return collect("math", parseMathBankFromFile);
}

export function getAllLogicItems(): LogicItem[] {
  return collect("logic", parseLogicBankFromFile);
}

export function getStoryById(id: string): Story | undefined {
  return getAllStories().find((s) => s.id === id);
}

/** 儿歌详情（/songs/[id] SSG 路由用，Phase 3） */
export function getSongById(id: string): Song | undefined {
  return getAllSongs().find((s) => s.id === id);
}

// ─── 首页动态统计（修复 BUG-2）───────────────────────────────────

export type ContentStats = Record<ContentType, number> & { languages: number };

/** 按解析结果动态统计各内容类型条数（首页统计不再硬编码） */
export function getContentStats(): ContentStats {
  return {
    sentence: getAllSentences().length,
    story: getAllStories().length,
    word: getAllWords().length,
    song: getAllSongs().length,
    dialogue: getAllDialogues().length,
    alphabet: getAllAlphabets().length,
    math: getAllMathItems().length,
    logic: getAllLogicItems().length,
    languages: 3,
  };
}

/** 当前 manifest 中启用（勾选）的内容类型集合，供首页/家长中心使用 */
export function getEnabledContentTypes(): ContentType[] {
  return getEnabledManifest().map((e) => e.type);
}
