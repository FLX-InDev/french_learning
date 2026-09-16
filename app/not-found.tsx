"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";

/** 404 兜底页（B6 工程加固）：保持产品语气，提供回首页出路 */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white/90 backdrop-blur rounded-3xl p-8 max-w-md w-full text-center shadow-xl">
        <div className="text-5xl">🔍</div>
        <h2 className="text-xl font-bold text-gray-800 mt-3">
          {t("notfound.title")}
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          {t("notfound.subtitle")}
        </p>
        <Link href="/" className="btn-primary mt-6 inline-block">
          {t("notfound.backHome")}
        </Link>
      </div>
    </div>
  );
}
