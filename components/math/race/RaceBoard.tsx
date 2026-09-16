"use client";

import { useI18n } from "@/lib/i18n";
import type { RaceRecord } from "@/lib/race";

/**
 * 限时赛本机排行榜（契约 D：`<RaceBoard records />`，纯展示）。
 * 不读写存储——数据由父组件传入（RaceGame）。
 */
export function RaceBoard({ records }: { records: RaceRecord[] }) {
  const { t } = useI18n();

  if (records.length === 0) {
    return (
      <p
        className="text-center text-sm text-gray-400 py-6"
        data-testid="race-board-empty"
      >
        {t("race.boardEmpty")}
      </p>
    );
  }

  return (
    <ol className="space-y-2" aria-label={t("race.boardTitle")}>
      {records.map((r, i) => (
        <li
          key={`${r.date}-${i}-${r.score}`}
          className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3"
        >
          <span
            className="w-9 text-center shrink-0"
            aria-label={`#${i + 1}`}
          >
            {i === 0 ? (
              <span className="text-xl">🥇</span>
            ) : i === 1 ? (
              <span className="text-xl">🥈</span>
            ) : i === 2 ? (
              <span className="text-xl">🥉</span>
            ) : (
              <span className="text-sm font-bold text-gray-400">#{i + 1}</span>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-extrabold text-gray-800 tabular-nums">
              {r.score}
            </div>
            <div className="text-[11px] text-gray-400 truncate">
              {t("race.boardMeta", {
                level: r.level,
                dur: String(r.durationSec),
                correct: String(r.correct),
                combo: String(r.bestCombo),
              })}
              {" · "}
              {r.date}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
