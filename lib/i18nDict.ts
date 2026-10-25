/**
 * 界面文案字典（纯 TS，无 React 依赖）
 *
 * 从 `lib/i18n.tsx` 拆出：聚合基础 chrome（`translations/<locale>.json`）+
 * 已登记模块（`lib/i18nModules.ts`），供 Provider、lib 纯函数（如
 * `lib/pronunciation.ts` 的反馈文案）与测试环境共同使用。
 */

import { DEFAULT_LOCALE, type Locale } from "./workspace";
import { moduleDictionaries } from "./i18nModules";

import zhBase from "@/translations/zh.json";
import enBase from "@/translations/en.json";
import frBase from "@/translations/fr.json";

export type Translations = Record<string, string>;

/** 基础界面 chrome（导航/页脚/各页面文案） */
const BASE: Record<Locale, Translations> = {
  zh: zhBase as Translations,
  en: enBase as Translations,
  fr: frBase as Translations,
};

function buildDictionary(locale: Locale): Translations {
  return { ...BASE[locale], ...moduleDictionaries(locale) };
}

const DICTIONARIES: Record<Locale, Translations> = {
  zh: buildDictionary("zh"),
  en: buildDictionary("en"),
  fr: buildDictionary("fr"),
};

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function translate(
  key: string,
  vars: Record<string, string> | undefined,
  locale: Locale
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return interpolate(dict[key] ?? key, vars);
}
