"use client";

/**
 * 界面三语 i18n 核心（Phase 6 T6-01，PRD §7.13.8 / Dev-Plan §11.3 M13）
 *
 * 设计要点：
 * - 语言状态唯一真源 = `AppState.settings.locale`（持久化，刷新保持）；
 * - 字典聚合 = 基础 chrome（`translations/<locale>.json`）+ 各功能模块
 *   （`translations/modules/<locale>/<module>.json`，见 `lib/i18nModules.ts`）；
 * - JSON 一律用 ESM `import`（禁止 `require(...).default`——JSON 模块没有 `.default`）；
 * - 挂载后同步 `<html lang>`；
 * - 必须位于 `AppStateProvider` 之内（依赖 `useAppState`）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useAppState } from "@/components/AppStateProvider";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./workspace";
import { moduleDictionaries } from "./i18nModules";

import zhBase from "@/translations/zh.json";
import enBase from "@/translations/en.json";
import frBase from "@/translations/fr.json";

export type { Locale };
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

function translate(
  key: string,
  vars: Record<string, string> | undefined,
  locale: Locale
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return interpolate(dict[key] ?? key, vars);
}

type I18nCtx = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string>) => string;
  setLocale: (locale: Locale) => void;
  /** 兼容保留：模块级字典已同步加载，恒为 true */
  ready: boolean;
};

const I18nContext = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { state, update } = useAppState();

  const stored = state?.settings.locale;
  const locale: Locale = isLocale(stored) ? stored : DEFAULT_LOCALE;

  // <html lang> 随语言变化（服务端静态 zh，挂载后由客户端纠正，不产生 hydration 差异）
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next)) return;
      update((s) => ({ ...s, settings: { ...s.settings, locale: next } }));
    },
    [update]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => translate(key, vars, locale),
    [locale]
  );

  const value = useMemo<I18nCtx>(
    () => ({ locale, t, setLocale, ready: true }),
    [locale, t, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 无 Provider 时的降级上下文（与 `useAppState` 的「未就绪降级」策略保持一致） */
const FALLBACK: I18nCtx = {
  locale: DEFAULT_LOCALE,
  t: (key, vars) => translate(key, vars, DEFAULT_LOCALE),
  setLocale: () => {},
  ready: true,
};

export function useI18n(): I18nCtx {
  return useContext(I18nContext) ?? FALLBACK;
}
