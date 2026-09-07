export const VOICE_CONFIG = {
  zh: {
    lang: "zh-CN",
    label: "中文",
    language: "中文",
    cfVoice: "zh-CN-YunxiNeural",
  },
  en: {
    lang: "en-US",
    label: "English",
    language: "English",
    cfVoice: "en-US-JennyNeural",
  },
  fr: {
    lang: "fr-FR",
    label: "Français",
    language: "Français",
    cfVoice: "fr-FR-DeniseNeural",
  },
} as const;

export type Language = keyof typeof VOICE_CONFIG;

/** 「正常」语速基准：settings.speechRate = 0.9 表示正常，0.75 表示慢速 */
export const NORMAL_SPEECH_RATE = 0.9;

/** 浏览器内置语音合成的 rate（在原语种基准上按全局语速缩放） */
export function utteranceRate(lang: Language, speechRate: number): number {
  const base = lang === "fr" ? 0.85 : 0.95;
  return clampRate(base * (speechRate / NORMAL_SPEECH_RATE));
}

/** 后端 TTS 音频的播放速率（read-aloud-sf 不支持语速参数，用 playbackRate 实现） */
export function playbackRate(speechRate: number): number {
  return clampRate(speechRate / NORMAL_SPEECH_RATE);
}

function clampRate(r: number): number {
  return Math.min(2, Math.max(0.1, r));
}
