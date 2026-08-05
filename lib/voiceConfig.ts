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
