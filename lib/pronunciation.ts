import type { SpeakLang } from "./workspace";
import { DEFAULT_LOCALE, type Locale } from "./workspace";
import { translate } from "./i18nDict";

/** 反馈文案的默认界面语言（调用方不传 locale 时保持历史中文行为） */
const DEFAULT_FEEDBACK_LOCALE: Locale = DEFAULT_LOCALE;

// ─── Types ───────────────────────────────────────────────────────

export type Candidate = { transcript: string; confidence: number };

export type SpeechScore = {
  score: number; // 0-100
  transcript: string; // 采用的最佳候选原文
  matched: string[]; // 命中的目标词
  missing: string[]; // 漏读 / 未识别出的目标词
  extra: string[]; // 多读 / 夹杂的词
  precision: number; // 0-1
  recall: number; // 0-1
  confidence: number; // 0-1
  feedback: string[];
};

// ─── Normalization ───────────────────────────────────────────────

/**
 * 归一化文本用于词级比对：
 * 小写 → NFD 分解并去掉变音符号（é→e, ç→c）→ 删除撇号（j'aime→jaime, l'eau→leau）
 * → 非字母数字转空格 → 折叠空白。
 * 删除撇号可消除法语省音造成的分词歧义，显著提升比对容错。
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // 去变音符号（é→e, ç→c）
    .replace(/['\u2019\u02bc]/g, "") // 删除撇号（含弯撇号，消除省音分词歧义）
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalizeText(s);
  return n.length === 0 ? [] : n.split(" ");
}

// ─── Word alignment (LCS) ────────────────────────────────────────

/**
 * 词级最长公共子序列对齐，得出命中词、漏读词（目标有未说出）、多余词（说出的非目标词）。
 * 不使用 Set/Map 展开（tsconfig 未设 target，展开可迭代对象会触发 TS2802）。
 */
export function alignWords(
  target: string[],
  spoken: string[]
): { matched: string[]; missing: string[]; extra: string[] } {
  const n = target.length;
  const m = spoken.length;

  // dp[i][j] = target[i..] 与 spoken[j..] 的 LCS 长度
  const dp: number[][] = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Array<number>(m + 1).fill(0));
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        target[i] === spoken[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (target[i] === spoken[j]) {
      matched.push(target[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      missing.push(target[i]);
      i++;
    } else {
      extra.push(spoken[j]);
      j++;
    }
  }
  while (i < n) {
    missing.push(target[i]);
    i++;
  }
  while (j < m) {
    extra.push(spoken[j]);
    j++;
  }

  return { matched, missing, extra };
}

// ─── Scoring ─────────────────────────────────────────────────────

function ratio(a: number, b: number): number {
  if (b <= 0) return 0;
  return a / b;
}

function f1Of(target: string[], spoken: string[]): number {
  const { matched } = alignWords(target, spoken);
  if (target.length === 0 && spoken.length === 0) return 1;
  const r = target.length === 0 ? 1 : ratio(matched.length, target.length);
  const p = spoken.length === 0 ? 0 : ratio(matched.length, spoken.length);
  return p + r > 0 ? (2 * p * r) / (p + r) : 0;
}

/** 从多个识别候选中挑与目标最匹配的（并列时取置信度更高的），提升鲁棒性 */
export function pickBestCandidate(
  target: string,
  cands: Candidate[]
): { transcript: string; confidence: number } {
  const targetWords = tokenize(target);
  let best = { transcript: "", confidence: 0 };
  let bestF1 = -1;
  for (const c of cands) {
    const f1 = f1Of(targetWords, tokenize(c.transcript));
    if (f1 > bestF1 || (f1 === bestF1 && c.confidence > best.confidence)) {
      bestF1 = f1;
      best = { transcript: c.transcript, confidence: c.confidence };
    }
  }
  return best;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 核心打分：词级 F1（权重 0.7）与识别置信度（权重 0.3）加权，映射到 0-100。
 * 候选为空或识别不到语音 → 0 分。
 * `locale` 仅决定反馈文案语言（界面语言），不影响打分算法。
 */
export function scorePronunciation(
  target: string,
  cands: Candidate[],
  lang: SpeakLang,
  locale: Locale = DEFAULT_FEEDBACK_LOCALE
): SpeechScore {
  const targetWords = tokenize(target);

  if (cands.length === 0) {
    const base = {
      score: 0,
      transcript: "",
      matched: [],
      missing: targetWords,
      extra: [],
      precision: 0,
      recall: 0,
      confidence: 0,
    };
    return { ...base, feedback: buildFeedback(base, lang, locale) };
  }

  const best = pickBestCandidate(target, cands);
  const spokenWords = tokenize(best.transcript);
  const { matched, missing, extra } = alignWords(targetWords, spokenWords);

  const recall = targetWords.length === 0 ? 1 : ratio(matched.length, targetWords.length);
  const precision = spokenWords.length === 0 ? 0 : ratio(matched.length, spokenWords.length);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // 部分浏览器不返回置信度，用 0.8 兜底
  const conf =
    typeof best.confidence === "number" && isFinite(best.confidence) && best.confidence > 0
      ? clamp(best.confidence, 0, 1)
      : 0.8;

  const raw = spokenWords.length === 0 ? 0 : 100 * (0.7 * f1 + 0.3 * conf);
  const score = clamp(Math.round(raw), 0, 100);

  const base = {
    score,
    transcript: best.transcript,
    matched,
    missing,
    extra,
    precision,
    recall,
    confidence: conf,
  };
  return { ...base, feedback: buildFeedback(base, lang, locale) };
}

// ─── Feedback ────────────────────────────────────────────────────

/** 反馈文案随界面语言取 `pronunciation.*` key（默认 zh 保持既有行为） */

const LANG_TIP_KEY: Record<SpeakLang, string> = {
  fr: "pronunciation.tipFr",
  en: "pronunciation.tipEn",
};

function bandTipKey(score: number): string {
  if (score >= 85) return "pronunciation.bandHigh";
  if (score >= 70) return "pronunciation.bandGood";
  if (score >= 55) return "pronunciation.bandMid";
  return "pronunciation.bandLow";
}

/** ≤max 全量展示；超出时截断并走 `*More` 模板（{words} 前 max 个 + {count} 总数） */
const WORD_LIST_MAX = 5;

function wordVars(words: string[], sep: string, key: string, locale: Locale): string {
  if (words.length <= WORD_LIST_MAX) {
    return translate(key, { words: words.join(sep) }, locale);
  }
  return translate(`${key}More`, {
    words: words.slice(0, WORD_LIST_MAX).join(sep),
    count: String(words.length),
    shown: String(WORD_LIST_MAX),
  }, locale);
}

export function buildFeedback(
  s: Omit<SpeechScore, "feedback">,
  lang: SpeakLang,
  locale: Locale = DEFAULT_FEEDBACK_LOCALE
): string[] {
  const tips: string[] = [];
  const listSep = locale === "zh" ? "、" : ", ";

  if (!s.transcript || s.matched.length === 0) {
    tips.push(translate("pronunciation.noSpeech", undefined, locale));
    tips.push(translate(LANG_TIP_KEY[lang], undefined, locale));
    return tips;
  }

  tips.push(translate(bandTipKey(s.score), undefined, locale));

  if (s.missing.length > 0) {
    tips.push(wordVars(s.missing, listSep, "pronunciation.missingWords", locale));
  }
  if (s.extra.length > 0) {
    tips.push(wordVars(s.extra, listSep, "pronunciation.extraWords", locale));
  }
  if (s.confidence < 0.6 && s.matched.length > 0) {
    tips.push(translate("pronunciation.lowConfidence", undefined, locale));
  }

  tips.push(translate(LANG_TIP_KEY[lang], undefined, locale));
  return tips;
}
