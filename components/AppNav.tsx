"use client";

/**
 * 全局导航（Phase 6 T6-01：从 app/layout.tsx 拆出，改为三语 `t()` 驱动）
 * 语言切换器在此挂载，保证全站任何页面均可切换界面语言。
 */

import Link from "next/link";
import { useI18n, localizedHref } from "@/lib/i18n";
import { I18nSwitcher } from "./I18nSwitcher";

const LINKS = [
  { href: "/sentences", key: "nav.sentences" },
  { href: "/stories", key: "nav.stories" },
  { href: "/alphabets", key: "nav.alphabets" },
  { href: "/songs", key: "nav.songs" },
  { href: "/math", key: "nav.math" },
  { href: "/logic", key: "nav.logic" },
  { href: "/workspace", key: "nav.workspace" },
  { href: "/parents", key: "nav.parents" },
] as const;

export function AppNav() {
  const { t, locale } = useI18n();

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-purple-100 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={localizedHref(locale, "/")}
          className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
        >
          {t("nav.brand")}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm font-medium">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={localizedHref(locale, l.href)}
              className="text-gray-600 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-full hover:bg-purple-50"
            >
              {t(l.key)}
            </Link>
          ))}
          <I18nSwitcher />
        </div>
      </div>
    </nav>
  );
}
