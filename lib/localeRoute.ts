import type { Locale } from "./workspace";

/**
 * 语言路由常量与纯函数（C1 方案①：/zh /en /fr 前缀）。
 * 独立于 `lib/i18n`（"use client" 模块），服务端（layout/generateStaticParams）也可安全导入。
 */
export const UI_LOCALES: Locale[] = ["zh", "en", "fr"];

/** 给站内路径加语言前缀：localizedHref('fr', '/math') → '/fr/math' */
export function localizedHref(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** 去掉 pathname 的语言前缀，得到站内原始路径：'/fr/math/race' → '/math/race' */
export function pathWithoutLocale(pathname: string | null): string {
  if (!pathname) return "/";
  const first = pathname.split("/")[1];
  if ((UI_LOCALES as string[]).includes(first)) {
    return pathname.slice(first.length + 1) || "/";
  }
  return pathname;
}
