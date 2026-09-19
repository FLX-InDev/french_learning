"use client";

import { useEffect } from "react";
import { cancelSpeech, configureSpeech, speak } from "@/lib/audioManager";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import type { Word } from "@/lib/contentTypes";

/**
 * 听音选图题卡（PRD §7.6.3 / F39，Phase 5A T5A.2）：
 * 播放法语词 → 从 2/3/4 张 emoji 大卡中选出（选项数随学段，由出题层决定）。
 * 进入题目自动播放一次；点击 ▶ 可重听；纯听音无文字提示（P-1 音频先行）。
 */
export function ListenPickQuizCard({
  word,
  options,
  selected,
  onSelect,
}: {
  word: Word;
  options: Word[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const { state } = useAppState();
  const { t } = useI18n();
  const speechRate = state?.settings.speechRate ?? 0.9;

  // 进入题目自动播放一次（word 变化即重播）
  useEffect(() => {
    configureSpeech(speechRate);
    cancelSpeech();
    void speak(word.fr, "fr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <button
          className="w-14 h-14 rounded-full bg-purple-600 text-white text-xl shrink-0 hover:bg-purple-700"
          onClick={() => {
            cancelSpeech();
            void speak(word.fr, "fr");
          }}
          aria-label={t("listenPick.replayAria", { n: String(options.length) })}
        >
          ▶
        </button>
        <span className="text-sm text-gray-500">{t("listenPick.hint")}</span>
      </div>

      <div
        className={
          "grid gap-3 " +
          (options.length <= 2
            ? "grid-cols-2 max-w-[320px] mx-auto"
            : options.length === 3
            ? "grid-cols-3 max-w-[440px] mx-auto"
            : "grid-cols-2 max-w-[440px] mx-auto")
        }
        role="group"
        aria-label={t("listenPick.optionsAria")}
      >
        {options.map((w, i) => (
          <button
            key={w.id}
            onClick={() => onSelect(i)}
            aria-pressed={selected === i}
            aria-label={t("listenPick.optionAria", { n: String(i + 1) })}
            className={
              "min-h-[96px] rounded-2xl border-2 p-3 transition select-none " +
              (selected === i
                ? "border-purple-500 bg-purple-50 ring-2 ring-purple-200"
                : "border-gray-100 bg-white hover:border-purple-300 active:scale-95")
            }
          >
            <div className="text-5xl" aria-hidden>
              {w.emoji || "❓"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
