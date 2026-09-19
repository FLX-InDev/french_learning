"use client";

import { useI18n, UI_LOCALES, type Locale } from "@/lib/i18n";

/**
 * 三语内容标题（content-fix §C2 裁决）：
 * 主标题 = 界面语言 `tri[locale]`，副标题 = 其余两语
 * （zh → en·fr；en → zh·fr；fr → zh·en）。
 * 释义/译文行（B1–B4、C5）不受影响，仍保持三语对照。
 */
export function otherLocales(locale: Locale): [Locale, Locale] {
  const rest = UI_LOCALES.filter((l) => l !== locale);
  return [rest[0], rest[1]];
}

type TriLike = { zh: string; en: string; fr: string };

export function TriTitle({
  tri,
  mainClass = "font-bold text-gray-800",
  subClass = "text-xs text-gray-400",
}: {
  tri: TriLike;
  mainClass?: string;
  subClass?: string;
}) {
  const { locale } = useI18n();
  const [o1, o2] = otherLocales(locale);
  return (
    <>
      <div className={mainClass}>{tri[locale]}</div>
      <div className={subClass}>
        {tri[o1]} · {tri[o2]}
      </div>
    </>
  );
}
