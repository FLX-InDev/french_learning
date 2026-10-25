"use client";

import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useAppState } from "@/components/AppStateProvider";
import PlayButton from "@/components/PlayButton";
import { usePlaylist, type LangMode } from "@/components/usePlaylist";
import { matchesLevel } from "@/lib/contentTypes";
import type { Sentence } from "@/lib/parser";
import type { Language } from "@/lib/voiceConfig";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 20;

/**
 * 句子列表（软切换：按 AppState.profile.level 即时过滤，无需重载页面）
 * 保留 v1 的三语点读能力，并新增「连播」（PRD §7.2.3，Dev-Plan T3.6）：
 * 逐句顺序播放、当前句高亮、点击任意句跳转、再次点击停止。
 * Phase 5B T5B.4：新增场景过滤（scene 标注，对应 /life 10 节点）。
 */
export function SentenceList({ sentences }: { sentences: Sentence[] }) {
  const { t } = useI18n();
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];
  const speechRate = state?.settings.speechRate ?? 0.9;
  const [sceneFilter, setSceneFilter] = useState<string>("");

  // 场景列表（去重，排序）
  const scenes = useMemo(() => {
    const s = new Set(sentences.map((x) => x.scene).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [sentences]);

  const list = useMemo(
    () =>
      sentences.filter(
        (s) =>
          matchesLevel(s.level, level) &&
          (!sceneFilter || s.scene === sceneFilter)
      ),
    [sentences, level, sceneFilter]
  );

  if (hidden.includes("sentence")) {
    return (
      <div className="text-center text-gray-400 py-10">
        {t("sentence.parentLocked")}
      </div>
    );
  }

  return (
    <PaginatedSentences
      // Remount only when the filter changes: reset before rendering the new list,
      // and let usePlaylist's unmount cleanup cancel the old playback loop.
      key={`${level}:${sceneFilter}`}
      list={list}
      total={sentences.length}
      scenes={scenes}
      sceneFilter={sceneFilter}
      onSceneChange={setSceneFilter}
      speechRate={speechRate}
    />
  );
}

function PaginatedSentences({
  list,
  total,
  scenes,
  sceneFilter,
  onSceneChange,
  speechRate,
}: {
  list: Sentence[];
  total: number;
  scenes: string[];
  sceneFilter: string;
  onSceneChange: (scene: string) => void;
  speechRate: number;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(list.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, list.length);

  const buildItems = useCallback(
    (index: number, langMode: LangMode): { text: string; lang: Language }[] => {
      const s = list[index];
      if (!s) return [];
      // usePlaylist sets activeIndex before calling buildItems. Commit its page
      // before speech starts: old PlayButtons cancel browser speech on unmount.
      flushSync(() => setPage(Math.floor(index / PAGE_SIZE)));
      if (langMode === "fr") return [{ text: s.fr, lang: "fr" }];
      return [
        { text: s.zh, lang: "zh" },
        { text: s.en, lang: "en" },
        { text: s.fr, lang: "fr" },
      ];
    },
    [list]
  );

  const playlist = usePlaylist({
    count: list.length,
    buildItems,
    gapMs: 500,
    speechRate,
  });

  function changePage(nextPage: number) {
    playlist.stop();
    setPage(nextPage);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-500">
          {t("sentence.count", { current: String(list.length), total: String(total) })}
        </div>
        {/* 场景过滤 chips（T5B.4） */}
        {scenes.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSceneChange("")}
              aria-pressed={!sceneFilter}
              className={
                "text-[11px] px-2 py-1 rounded-full font-semibold transition min-h-[32px] " +
                (!sceneFilter ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600")
              }
            >
              {t("sentence.sceneAll")}
            </button>
            {scenes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSceneChange(sceneFilter === s ? "" : s)}
                aria-pressed={sceneFilter === s}
                className={
                  "text-[11px] px-2 py-1 rounded-full font-semibold transition min-h-[32px] " +
                  (sceneFilter === s
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 text-purple-600")
                }
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {/* 连播控制（T3.6） */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-purple-50 p-0.5" role="group" aria-label={t("story.autoplayGroup")}>
            {(
              [
                ["fr", t("sentence.langOnlyFr")],
                ["all", t("sentence.langAllThree")],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => playlist.setLangMode(mode)}
                aria-pressed={playlist.langMode === mode}
                className={
                  "text-xs px-3 py-1.5 rounded-full font-medium transition min-h-[36px] " +
                  (playlist.langMode === mode
                    ? "bg-purple-600 text-white"
                    : "text-purple-600")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={list.length === 0}
            className={
              "min-h-[40px] px-4 rounded-full text-sm font-semibold transition disabled:opacity-50 " +
              (playlist.playing
                ? "bg-red-50 text-red-500 hover:bg-red-100"
                : "bg-purple-600 text-white hover:bg-purple-700")
            }
            onClick={() => (playlist.playing ? playlist.stop() : playlist.start(pageStart))}
            aria-label={playlist.playing ? t("sentence.stopBroadcast") : t("sentence.startBroadcast")}
          >
            {playlist.playing ? t("sentence.stopBroadcastBtn") : t("sentence.startBroadcastBtn")}
          </button>
        </div>
      </div>

      <nav
        aria-label={t("sentence.paginationLabel")}
        className="flex flex-wrap items-center justify-center gap-3"
      >
        <button
          type="button"
          onClick={() => changePage(currentPage - 1)}
          disabled={currentPage === 0}
          aria-label={t("sentence.paginationPrevious")}
          className="min-h-[40px] rounded-full px-4 text-sm font-semibold text-purple-600 bg-purple-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"
        >
          {t("sentence.paginationPrevious")}
        </button>
        <span className="text-sm text-gray-500" role="status" aria-live="polite" aria-atomic="true">
          {t("sentence.paginationRange", {
            start: String(list.length === 0 ? 0 : pageStart + 1),
            end: String(pageEnd),
            total: String(list.length),
          })}
        </span>
        <button
          type="button"
          onClick={() => changePage(currentPage + 1)}
          disabled={currentPage === lastPage}
          aria-label={t("sentence.paginationNext")}
          className="min-h-[40px] rounded-full px-4 text-sm font-semibold text-purple-600 bg-purple-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"
        >
          {t("sentence.paginationNext")}
        </button>
      </nav>

      {list.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          {t("sentence.empty")}
        </div>
      ) : (
        list.slice(pageStart, pageEnd).map((sentence, pageIndex) => {
          const index = pageStart + pageIndex;
          const active = playlist.activeIndex === index;
          return (
            <div
              key={index}
              onClick={() => playlist.toggle(index)}
              className={
                "bg-white rounded-xl shadow-sm border p-4 transition-all cursor-pointer " +
                (active
                  ? "border-purple-400 ring-2 ring-purple-200 bg-purple-50/60 shadow-md"
                  : "border-gray-100 hover:shadow-md")
              }
              title={active ? t("sentence.clickStop") : t("sentence.clickPlayFrom")}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playlist.toggle(index);
                  }}
                  aria-label={`${t(active ? "sentence.clickStop" : "sentence.clickPlayFrom")}: ${index + 1}`}
                  aria-pressed={active}
                  className={
                    "text-xs font-mono min-h-[36px] w-8 shrink-0 text-right rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600 " +
                    (active ? "text-purple-500 font-bold" : "text-gray-300")
                  }
                >
                  {active && playlist.playing ? "♪" : index + 1}
                </button>
                <div className="flex-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                      {t("sentence.langZh")}
                    </span>
                    <span className="text-gray-800">{sentence.zh}</span>
                    <PlayButton text={sentence.zh} lang="zh" size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">
                      {t("sentence.langEn")}
                    </span>
                    <span className="text-gray-600">{sentence.en}</span>
                    <PlayButton text={sentence.en} lang="en" size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                      {t("sentence.langFr")}
                    </span>
                    <span className="text-gray-600 italic">{sentence.fr}</span>
                    <PlayButton text={sentence.fr} lang="fr" size="sm" />
                  </div>
                  {sentence.category && (
                    <div className="text-xs text-purple-500 pt-1">
                      #{sentence.category}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
