"use client";

import { useI18n } from "@/lib/i18n";

/**
 * 页面标题区（Phase 6 T6-01）
 *
 * 背景：承载内容的数据读取（`lib/parser.ts` 依赖 `fs`）必须留在服务端组件，
 * 因此把需要 `t()` 的标题/副标题下沉到本客户端组件，避免在 RSC 中调用 Hook。
 *
 * 说明：标题文案由字典提供（zh 值本身自带 emoji），不再重复渲染 emoji，
 * 修掉了旧代码 `📖 {t("nav.stories")}` 造成的双 emoji 问题。
 */
export function PageHeader({
  titleKey,
  descKey,
  descVars,
  big = false,
}: {
  titleKey: string;
  descKey?: string;
  descVars?: Record<string, string>;
  /** 大标题样式（stories / sentences 使用 text-3xl） */
  big?: boolean;
}) {
  const { t } = useI18n();

  return (
    <header className="text-center">
      <h1
        className={
          big
            ? "text-3xl font-bold text-gray-800"
            : "text-2xl font-bold text-gray-800"
        }
      >
        {t(titleKey)}
      </h1>
      {descKey && (
        <p className={big ? "text-gray-500 mt-2" : "text-sm text-gray-400 mt-1"}>
          {t(descKey, descVars)}
        </p>
      )}
    </header>
  );
}
