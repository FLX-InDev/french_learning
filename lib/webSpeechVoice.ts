/**
 * Web Speech 语音挑选（T3.6 从 PlayButton 抽取为共享模块）
 *
 * PlayButton 与 lib/audioManager.ts（儿歌卡拉OK / 连播 / 拼词点读）共用同一套
 * 语音挑选策略，保证全站三语发音音色一致。
 */

import type { Language } from "./voiceConfig";

// Preferred voice names per language, ordered by quality (best first)
// Top entries are exact iOS voice names confirmed on iPad Safari.
export const PREFERRED_VOICES: Record<Language, string[]> = {
  zh: [
    "Yun", // Apple zh-CN (iOS "云" voice) — TOP PICK
    "Yunyang", // Microsoft Neural (Edge/Chrome)
    "Xiaoxiao", // Microsoft Neural (Edge/Chrome)
    "Ting-Ting", // Apple Premium (iOS/macOS)
    "婷婷", // Apple Chinese name
    "Sinji", // Apple zh-HK
    "Google", // Chrome fallback
  ],
  en: [
    "Stephanie", // Apple en-US (iOS, optimized quality) — TOP PICK
    "Samantha", // Apple Premium (iOS/macOS)
    "Jenny", // Microsoft Neural
    "Aria", // Microsoft Neural
    "Daniel", // Apple UK
    "Karen", // Apple AU
    "Google US", // Chrome
  ],
  fr: [
    "Audrey", // Apple fr-FR enhanced (best on iOS) — TOP PICK
    "Aurélie", // Apple fr-FR enhanced / Siri
    "Amélie", // Apple fr-FR standard
    "Thomas", // Apple fr-FR standard
    "Denise", // Microsoft Neural (Edge/Chrome)
    "Henri", // Microsoft Neural (Edge/Chrome)
    "Google français", // Chrome fallback
  ],
};

/**
 * Pick the best available voice for a language.
 * Priority: explicit preferred names → Enhanced/Premium → Neural/Natural → first match.
 * For French, strictly match fr-FR to avoid Canadian French (fr-CA).
 */
export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  langCode: string,
  lang: Language
): SpeechSynthesisVoice | null {
  const matching = voices.filter((v) =>
    lang === "fr" ? v.lang === "fr-FR" : v.lang.startsWith(langCode)
  );

  if (matching.length === 0) {
    console.warn(`[WebSpeechVoice] ${lang}: 没有找到匹配 ${langCode} 的语音`);
    return null;
  }

  const preferred = PREFERRED_VOICES[lang] || [];
  for (const name of preferred) {
    const found = matching.find((v) => v.name.includes(name));
    if (found) {
      console.log(
        `[WebSpeechVoice] ${lang} 选中语音: "${found.name}" [${found.lang}] (匹配: "${name}")`
      );
      return found;
    }
  }

  const qualityKeywords = [
    "Enhanced", "Premium", "Natural", "Neural", "Wavenet", "Studio",
  ];
  for (const kw of qualityKeywords) {
    const found = matching.find((v) => v.name.includes(kw));
    if (found) return found;
  }

  const local = matching.find((v) => v.localService);
  if (local) return local;

  console.log(
    `[WebSpeechVoice] ${lang} 回退到第一个语音: "${matching[0].name}" [${matching[0].lang}]`
  );
  return matching[0];
}

/**
 * 读取语音列表；首次调用常为空（iOS Safari 惰性加载），
 * 等待 voiceschanged 或超时后重取一次。
 */
export function loadVoicesReady(timeoutMs = 500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }
    const first = window.speechSynthesis.getVoices();
    if (first.length > 0) {
      resolve(first);
      return;
    }
    let done = false;
    const finish = (v: SpeechSynthesisVoice[]) => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener("voiceschanged", listener);
      window.clearTimeout(timer);
      resolve(v);
    };
    const listener = () => finish(window.speechSynthesis.getVoices());
    const timer = window.setTimeout(
      () => finish(window.speechSynthesis.getVoices()),
      timeoutMs
    );
    window.speechSynthesis.addEventListener("voiceschanged", listener);
  });
}
