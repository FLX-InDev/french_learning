"use client";

import { useCallback, useMemo } from "react";
import { useAppState } from "@/components/AppStateProvider";
import PlayButton from "@/components/PlayButton";
import { usePlaylist, type LangMode } from "@/components/usePlaylist";
import { matchesLevel } from "@/lib/contentTypes";
import type { Sentence } from "@/lib/parser";
import type { Language } from "@/lib/voiceConfig";

/**
 * 句子列表（软切换：按 AppState.profile.level 即时过滤，无需重载页面）
 * 保留 v1 的三语点读能力，并新增「连播」（PRD §7.2.3，Dev-Plan T3.6）：
 * 逐句顺序播放、当前句高亮、点击任意句跳转、再次点击停止。
 */
export function SentenceList({ sentences }: { sentences: Sentence[] }) {
  const { state } = useAppState();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];
  const speechRate = state?.settings.speechRate ?? 0.9;

  const list = useMemo(
    () => sentences.filter((s) => matchesLevel(s.level, level)),
    [sentences, level]
  );

  const buildItems = useCallback(
    (index: number, langMode: LangMode): { text: string; lang: Language }[] => {
      const s = list[index];
      if (!s) return [];
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

  if (hidden.includes("sentence")) {
    return (
      <div className="text-center text-gray-400 py-10">
        该内容已被家长关闭，可在家长中心重新开启。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-500">
          当前学段可见 {list.length} / {sentences.length} 句
        </div>
        {/* 连播控制（T3.6） */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-purple-50 p-0.5" role="group" aria-label="连播语言模式">
            {(
              [
                ["fr", "仅法语"],
                ["all", "三语轮读"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
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
            className={
              "min-h-[40px] px-4 rounded-full text-sm font-semibold transition " +
              (playlist.playing
                ? "bg-red-50 text-red-500 hover:bg-red-100"
                : "bg-purple-600 text-white hover:bg-purple-700")
            }
            onClick={() => (playlist.playing ? playlist.stop() : playlist.start(0))}
            aria-label={playlist.playing ? "停止连播" : "开始连播"}
          >
            {playlist.playing ? "■ 停止连播" : "▶ 连播"}
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          当前学段暂无句子，可在家长中心切换学段。
        </div>
      ) : (
        list.map((sentence, index) => {
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
              title={active ? "点击停止" : "点击从此句连播"}
            >
              <div className="flex items-start gap-3">
                <span
                  className={
                    "text-xs font-mono mt-1 w-8 shrink-0 text-right " +
                    (active ? "text-purple-500 font-bold" : "text-gray-300")
                  }
                >
                  {active && playlist.playing ? "♪" : index + 1}
                </span>
                <div className="flex-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                      中
                    </span>
                    <span className="text-gray-800">{sentence.zh}</span>
                    <PlayButton text={sentence.zh} lang="zh" size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">
                      EN
                    </span>
                    <span className="text-gray-600">{sentence.en}</span>
                    <PlayButton text={sentence.en} lang="en" size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">
                      FR
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
