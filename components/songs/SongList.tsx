"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/components/AppStateProvider";
import { matchesLevel, type Song } from "@/lib/contentTypes";

/**
 * 儿歌库列表（PRD §7.4.1，Dev-Plan T3.3）：
 * 大卡片（emoji 场景 + 三语标题 + 学段徽标），按学段软切换过滤。
 */
export function SongList({ songs }: { songs: Song[] }) {
  const { t } = useI18n();
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];

  const list = useMemo(
    () => songs.filter((s) => matchesLevel(s.level, level)),
    [songs, level]
  );

  if (hidden.includes("song")) {
    return (
      <div className="text-center text-gray-400 py-10">
        {t("song.parentLocked")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-500">
        {t("song.count", { current: String(list.length), total: String(songs.length) })}
      </div>
      {list.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          {t("song.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {list.map((song) => (
            <Link
              key={song.id}
              href={`/songs/${song.id}`}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition"
            >
              <div className="text-4xl shrink-0" aria-hidden>
                {song.emoji || "🎵"}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-gray-800 truncate">
                  {song.title.zh}
                </div>
                <div className="text-xs text-gray-500 truncate">{song.title.fr}</div>
                <div className="text-xs text-gray-400 truncate">{song.title.en}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-semibold">
                    {t("song.allLevels")}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {t("song.linesCount", { n: String(song.lines.length) })}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
