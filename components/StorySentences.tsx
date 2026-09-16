"use client";

import { useCallback } from "react";
import PlayButton from "@/components/PlayButton";
import { usePlaylist, type LangMode } from "@/components/usePlaylist";
import { useAppState } from "@/components/AppStateProvider";
import type { Sentence } from "@/lib/parser";
import type { Language } from "@/lib/voiceConfig";
import { useI18n } from "@/lib/i18n";

/**
 * 故事逐句展示 + 连播（PRD §7.2.3，Dev-Plan T3.6）：
 * 与句子库共用 usePlaylist——逐句播放、当前句高亮、点击任意句跳转、再次点击停止。
 */
export function StorySentences({ sentences }: { sentences: Sentence[] }) {
  const { t } = useI18n();
  const { state } = useAppState();
  const speechRate = state?.settings.speechRate ?? 0.9;

  const buildItems = useCallback(
    (index: number, langMode: LangMode): { text: string; lang: Language }[] => {
      const s = sentences[index];
      if (!s) return [];
      if (langMode === "fr") return [{ text: s.fr, lang: "fr" }];
      return [
        { text: s.zh, lang: "zh" },
        { text: s.en, lang: "en" },
        { text: s.fr, lang: "fr" },
      ];
    },
    [sentences]
  );

  const playlist = usePlaylist({
    count: sentences.length,
    buildItems,
    gapMs: 600,
    speechRate,
  });

  return (
    <div className="space-y-4">
      {/* 连播控制 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-full bg-purple-50 p-0.5" role="group" aria-label="连播语言模式">
          {(
            [
              ["fr", t('story.frOnly')],
              ["all", t('story.threeLang')],
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
            "min-h-[44px] px-6 rounded-full text-sm font-semibold transition " +
            (playlist.playing
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : "bg-purple-600 text-white hover:bg-purple-700")
          }
          onClick={() => (playlist.playing ? playlist.stop() : playlist.start(0))}
          aria-label={playlist.playing ? t('story.stopStreaming') : t('story.startStreaming')}
        >
          {playlist.playing ? t('story.stopStreaming') : t('story.startStreaming')}
        </button>
      </div>

      {sentences.map((sentence, index) => {
        const active = playlist.activeIndex === index;
        return (
          <div
            key={index}
            onClick={() => playlist.toggle(index)}
            className={
              "bg-white rounded-2xl shadow-sm border p-5 transition-all cursor-pointer " +
              (active
                ? "border-purple-400 ring-2 ring-purple-200 bg-purple-50/60 shadow-md"
                : "border-gray-100 hover:shadow-md")
            }
            title={active ? t('story.clickStop') : t('story.clickPlayFrom')}
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-500 mt-0.5">
                  {t('story.chinese')}
                </span>
                <p className="text-gray-800 text-lg leading-relaxed flex-1">
                  {sentence.zh}
                </p>
                <div onClick={(e) => e.stopPropagation()}>
                  <PlayButton text={sentence.zh} lang="zh" size="sm" />
                </div>
              </div>
              <div className="border-t border-dashed border-gray-100" />
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-500 mt-0.5">
                  EN
                </span>
                <p className="text-gray-600 leading-relaxed flex-1">
                  {sentence.en}
                </p>
                <div onClick={(e) => e.stopPropagation()}>
                  <PlayButton text={sentence.en} lang="en" size="sm" />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-green-50 text-green-600 mt-0.5">
                  FR
                </span>
                <p className="text-gray-600 italic leading-relaxed flex-1">
                  {sentence.fr}
                </p>
                <div onClick={(e) => e.stopPropagation()}>
                  <PlayButton text={sentence.fr} lang="fr" size="sm" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
