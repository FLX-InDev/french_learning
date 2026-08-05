export const VOICE_CONFIG = {
  zh: {
    lang: "zh-CN",
    label: "中文",
    language: "中文",
  },
  en: {
    lang: "en-US",
    label: "English",
    language: "English",
  },
  fr: {
    lang: "fr-FR",
    label: "Français",
    language: "Français",
  },
} as const;

export type Language = keyof typeof VOICE_CONFIG;
