"use client";

/** 全局页脚（Phase 6 T6-01：从 app/layout.tsx 拆出，改为三语 `t()` 驱动） */

import Link from "next/link";
import { useI18n, localizedHref } from "@/lib/i18n";

export function AppFooter() {
  const { t, locale } = useI18n();

  return (
    <footer className="text-center py-8 text-sm text-gray-400">
      <p>{t("footer.brand")}</p>
      <p className="mt-1">
        {t("footer.tagline")}{" "}
        <Link href={localizedHref(locale, "/privacy")} className="hover:text-purple-500 underline">
          {t("footer.privacy")}
        </Link>
      </p>
    </footer>
  );
}
