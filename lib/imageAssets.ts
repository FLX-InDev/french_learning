/**
 * T6-10 · 插画资产路径常量（单一真源）
 * PRD §10.2 — public/images/ 目录
 *
 * 所有组件统一从此文件取图片路径，避免硬编码；
 * 后续替换为 AI 生成真实图片时只需更新文件名，组件代码不变。
 */

// ── 学科入口图标（512×512 逻辑，渲染 96px） ──
export const SUBJECT_ICONS = {
  dialogue: "/images/icons/dialogue.svg",
  spelling: "/images/icons/spelling.svg",
  words:    "/images/icons/words.svg",
  math:     "/images/icons/math.svg",
  logic:    "/images/icons/logic.svg",
  music:    "/images/icons/music.svg",
} as const;

export type SubjectIconKey = keyof typeof SUBJECT_ICONS;

/** 各学科 emoji 降级值（图片加载失败时显示，保留 emoji 路径 G-6） */
export const SUBJECT_EMOJI_FALLBACK: Record<SubjectIconKey, string> = {
  dialogue: "💬",
  spelling: "🔤",
  words:    "🃏",
  math:     "🔢",
  logic:    "🧩",
  music:    "🎵",
};

// ── 故事封面（768×432 逻辑，渲染 160×90px） ──
export const STORY_COVERS: Record<string, string> = {
  rabbit: "/images/stories/rabbit.svg",
  bear:   "/images/stories/bear.svg",
  bird:   "/images/stories/bird.svg",
  dog:    "/images/stories/dog.svg",
  cat:    "/images/stories/cat.svg",
  pig:    "/images/stories/pig.svg",
  sheep:  "/images/stories/sheep.svg",
  duck:   "/images/stories/duck.svg",
};

/** 故事 emoji 降级值（与 StoryList 中 EMOJIS 数组对齐） */
export const STORY_EMOJI_FALLBACK: Record<string, string> = {
  rabbit: "🐰",
  bear:   "🐻",
  bird:   "🐦",
  dog:    "🐶",
  cat:    "🐱",
  pig:    "🐷",
  sheep:  "🐑",
  duck:   "🦆",
};

// ── 词卡占位（512×512 逻辑，渲染 64px） ──
export const WORD_PLACEHOLDER = "/images/words/placeholder.svg";
export const WORD_PLACEHOLDER_EMOJI = "🃏";
