import fs from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────

export interface Sentence {
  zh: string;
  en: string;
  fr: string;
}

export interface Story {
  id: string;
  title: string;
  sentences: Sentence[];
}

export interface MaterialEntry {
  name: string;
  filename: string;
  enabled: boolean;
  type: string;
  description: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const MANIFEST_FILE = path.join(DATA_DIR, "french_learning_materials.md");

function slugify(_title: string, index: number): string {
  return String(index + 1);
}

function readDataFile(filename: string): string {
  const filepath = path.join(DATA_DIR, filename);
  return fs.readFileSync(filepath, "utf-8");
}

// ─── Manifest Parser ─────────────────────────────────────────────

/**
 * Parse the entry file (french_learning_materials.md).
 * Extracts material entries from markdown checklist format:
 *   - [x] [名字](./filename.md) - 描述
 *   - [ ] [名字](./filename.md) - 描述
 */
export function parseManifest(): MaterialEntry[] {
  const content = fs.readFileSync(MANIFEST_FILE, "utf-8");
  const lines = content.split("\n");
  const entries: MaterialEntry[] = [];

  // Match patterns like: - [x] [句子](./sentences.md) - 300+ sentences
  // Also handles: - [X][sentences](./sentences.md)
  const entryRegex =
    /^-\s+\[([ xX])\]\s*\[([^\]]+)\]\(\.\/([^)]+)\)(?:\s*[-–—]\s*(.+))?/;

  for (const line of lines) {
    const match = line.trim().match(entryRegex);
    if (match) {
      const [, checkbox, name, filename, description] = match;
      const enabled = checkbox.toLowerCase() === "x";

      // Derive type from filename (remove .md extension)
      const type = filename.replace(/\.md$/, "");

      entries.push({
        name,
        filename,
        enabled,
        type,
        description: description?.trim() || "",
      });
    }
  }

  return entries;
}

// ─── Sentences Parser ────────────────────────────────────────────

/**
 * Parse a sentences markdown file.
 * Format: groups of 3 lines (zh, en, fr) separated by blank lines,
 * organized under ## category headers.
 */
export function parseSentencesFromFile(filepath: string): Sentence[] {
  const content = readDataFile(filepath);
  const lines = content.split("\n");
  const sentences: Sentence[] = [];

  let currentZh = "";
  let currentEn = "";
  let currentFr = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("- zh: ")) {
      currentZh = trimmed.slice(6);
    } else if (trimmed.startsWith("- en: ")) {
      currentEn = trimmed.slice(6);
    } else if (trimmed.startsWith("- fr: ")) {
      currentFr = trimmed.slice(6);

      // When we have all three, push the sentence
      if (currentZh || currentEn || currentFr) {
        sentences.push({
          zh: currentZh,
          en: currentEn,
          fr: currentFr,
        });
        currentZh = "";
        currentEn = "";
        currentFr = "";
      }
    }
  }

  return sentences;
}

// ─── Stories Parser ──────────────────────────────────────────────

/**
 * Parse a stories markdown file.
 * Stories are organized under ## headers, each containing
 * groups of 3 lines (zh, en, fr) separated by blank lines.
 */
export function parseStoriesFromFile(filepath: string): Story[] {
  const content = readDataFile(filepath);
  const lines = content.split("\n");
  const stories: Story[] = [];

  let currentTitle = "";
  let currentSentences: Sentence[] = [];
  let currentZh = "";
  let currentEn = "";
  let currentFr = "";

  const flushSentence = () => {
    if (currentZh || currentEn || currentFr) {
      currentSentences.push({
        zh: currentZh,
        en: currentEn,
        fr: currentFr,
      });
      currentZh = "";
      currentEn = "";
      currentFr = "";
    }
  };

  let storyIndex = 0;

  const flushStory = () => {
    flushSentence();
    if (currentTitle && currentSentences.length > 0) {
      stories.push({
        id: slugify(currentTitle, storyIndex),
        title: currentTitle,
        sentences: [...currentSentences],
      });
      storyIndex++;
    }
    currentSentences = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      flushStory();
      currentTitle = trimmed.slice(3);
    } else if (trimmed.startsWith("- zh: ")) {
      currentZh = trimmed.slice(6);
    } else if (trimmed.startsWith("- en: ")) {
      currentEn = trimmed.slice(6);
    } else if (trimmed.startsWith("- fr: ")) {
      currentFr = trimmed.slice(6);
      flushSentence();
    }
  }

  // Don't forget the last story
  flushStory();

  return stories;
}

// ─── Aggregation Functions ───────────────────────────────────────

/**
 * Get all enabled sentences by reading the manifest
 * and parsing enabled sentence-type files.
 */
export function getAllSentences(): Sentence[] {
  const manifest = parseManifest();
  const allSentences: Sentence[] = [];

  for (const entry of manifest) {
    if (entry.enabled && entry.type === "sentences") {
      const sentences = parseSentencesFromFile(entry.filename);
      allSentences.push(...sentences);
    }
  }

  return allSentences;
}

/**
 * Get all enabled stories by reading the manifest
 * and parsing enabled story-type files.
 */
export function getAllStories(): Story[] {
  const manifest = parseManifest();
  const allStories: Story[] = [];

  for (const entry of manifest) {
    if (entry.enabled && entry.type === "stories") {
      const stories = parseStoriesFromFile(entry.filename);
      allStories.push(...stories);
    }
  }

  return allStories;
}

/**
 * Get a single story by its id (slugified title).
 */
export function getStoryById(id: string): Story | undefined {
  const stories = getAllStories();
  return stories.find((s) => s.id === id);
}
