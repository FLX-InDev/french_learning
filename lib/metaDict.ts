import type { Metadata } from "next";
import zh from "@/translations/zh.json";
import en from "@/translations/en.json";
import fr from "@/translations/fr.json";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./workspace";

/**
 * 服务端 metadata 三语字典（C1 方案①配套）：
 * `generateMetadata({ params })` 无法用客户端 `useI18n`，这里直接按 locale 查基础字典。
 * meta.* 键同时受 `check:i18n` 三语对齐校验。
 */
const DICTS: Record<Locale, Record<string, string>> = {
  zh: zh as Record<string, string>,
  en: en as Record<string, string>,
  fr: fr as Record<string, string>,
};

export function pageMeta(locale: string, key: string): Metadata {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const d = DICTS[l];
  const meta: Metadata = { title: d[`${key}.title`] };
  if (d[`${key}.desc`]) meta.description = d[`${key}.desc`];
  return meta;
}
