"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { KaraokePlayer } from "./songs/KaraokePlayer";
import type { Song } from "@/lib/contentTypes";

/**
 * 儿歌详情视图（Phase 6 T6-01）
 * 页面保持服务端组件（`generateStaticParams` + fs 数据读取），本组件只负责三语文案渲染。
 */
export function SongDetailView({ song }: { song: Song }) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <KaraokePlayer song={song} />
      {/* 无障碍/降级提示：音频播放依赖浏览器能力 */}
      <noscript>
        <p className="text-center text-sm text-gray-400">
          {t("page.song.jsRequired")}
        </p>
      </noscript>
      <p className="text-center text-xs text-gray-300">
        <Link href="/songs">{t("page.song.library")}</Link> · {t("page.song.ttsNote")}
      </p>
    </div>
  );
}
