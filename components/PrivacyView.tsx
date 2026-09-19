"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useI18n, localizedHref } from "@/lib/i18n";

/**
 * 隐私声明视图（Phase 6 T6-01）
 * 页面保留 `metadata` 导出（服务端组件），正文渲染下沉到本组件。
 * 条款正文已三语化；`**…**` 为加粗标记，由 `RichText` 渲染为 <strong>。
 */

/** 轻量富文本：把 `**强调**` 渲染为 <strong>（仅用于隐私条款正文） */
function RichText({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
      )}
    </>
  );
}

const CARDS = [
  {
    key: "noData",
    emoji: "🚫",
    box: "bg-green-50",
    title: "text-green-700",
    desc: "text-green-700/80",
  },
  {
    key: "localOnly",
    emoji: "💾",
    box: "bg-purple-50",
    title: "text-purple-700",
    desc: "text-purple-700/80",
  },
  {
    key: "noAds",
    emoji: "📺",
    box: "bg-amber-50",
    title: "text-amber-700",
    desc: "text-amber-700/80",
  },
  {
    key: "noLinks",
    emoji: "🔗",
    box: "bg-blue-50",
    title: "text-blue-700",
    desc: "text-blue-700/80",
  },
] as const;

const SECTIONS = ["s1", "s2", "s3", "s4"] as const;

export function PrivacyView() {
  const { t, locale } = useI18n();

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <header className="text-center">
        <div className="text-5xl">🛡️</div>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">{t("page.privacy.title")}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {t("page.privacy.subtitle")}
        </p>
      </header>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 text-sm text-gray-700 leading-relaxed">
        <div className="grid grid-cols-2 gap-3">
          {CARDS.map((c) => (
            <div key={c.key} className={`rounded-xl ${c.box} p-4 text-center`}>
              <div className="text-2xl">{c.emoji}</div>
              <div className={`font-bold ${c.title} mt-1`}>
                {t(`page.privacy.card.${c.key}.title`)}
              </div>
              <p className={`text-xs ${c.desc} mt-1`}>
                {t(`page.privacy.card.${c.key}.desc`)}
              </p>
            </div>
          ))}
        </div>

        {SECTIONS.map((s) => (
          <Fragment key={s}>
            <h2 className="font-bold text-gray-800 pt-2">
              {t(`page.privacy.${s}.title`)}
            </h2>
            <p>
              <RichText text={t(`page.privacy.${s}.body`)} />
            </p>
          </Fragment>
        ))}

        <p className="text-xs text-gray-400 pt-2 border-t border-dashed">
          {t("page.privacy.footnote")}
        </p>
      </section>

      <div className="text-center">
        <Link href={localizedHref(locale, "/")} className="btn-secondary inline-block">
          {t("page.privacy.backHome")}
        </Link>
      </div>
    </div>
  );
}
