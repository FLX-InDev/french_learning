"use client";

import Link from "next/link";
import { useI18n, localizedHref } from "@/lib/i18n";
import { StorySentences } from "./StorySentences";
import { otherLocales } from "./TriTitle";
import type { Story } from "@/lib/parser";

/**
 * 故事详情视图（Phase 6 T6-01）
 * 页面保持服务端组件（`generateStaticParams` + fs 数据读取），本组件只负责三语文案渲染。
 */
export function StoryDetailView({ story }: { story: Story }) {
  const { t, locale } = useI18n();
  // 三语标题：zh 取 `##` 标题，en/fr 取组级 title_en/title_fr，缺省回落中文
  const triTitle = {
    zh: story.title,
    en: story.titleEn || story.title,
    fr: story.titleFr || story.title,
  };

  return (
    <div className="space-y-8">
      {/* Back Link */}
      <Link
        href={localizedHref(locale, "/stories")}
        className="inline-flex items-center gap-1 text-sm text-purple-500 hover:text-purple-700 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        {t("page.story.backToList")}
      </Link>

      {/* Story Header */}
      <div className="text-center">
        {/* 主标题随界面语言 + 副标题其余两语（h1 内不放 div，保持 HTML 合法与标题语义） */}
        <h1 className="text-3xl font-bold text-gray-800">{triTitle[locale]}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {otherLocales(locale)
            .map((l) => triTitle[l])
            .join(" · ")}
        </p>
        <p className="text-gray-400 mt-2">
          {t("page.story.lineCount", { n: String(story.sentences.length) })}
        </p>
      </div>

      {/* Story Content（客户端组件：三语点读 + 连播） */}
      <StorySentences sentences={story.sentences} />

      {/* Bottom Navigation */}
      <div className="text-center pt-4">
        <Link
          href={localizedHref(locale, "/stories")}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-medium hover:shadow-lg transition-shadow"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t("page.story.backToList")}
        </Link>
      </div>
    </div>
  );
}
