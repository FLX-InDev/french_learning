"use client";

import { cancelSpeech, configureSpeech, playSfx, speak } from "@/lib/audioManager";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/components/AppStateProvider";
import { RecordingPlayback } from "@/components/RecordingPlayback";
import { usePronunciationCheck } from "@/components/usePronunciationCheck";
import type { AlphabetCard } from "@/lib/contentTypes";
import { useEffect, useState } from "react";

/**
 * 字母翻卡（PRD §7.5.2，Dev-Plan T3.1；T5A.3 扩展单词跟读）：
 * 正面 = 大字母 + 代表词 emoji；翻面 = 三语代表词 + 例句 + 两种点读——
 * 「字母名」（A = /a/，读卡片语言）与「例词」（整词）可区分点读。
 * 例词跟读复用 scorePronunciation 管线（及格线随学段），通过回调 onSpoken 记进度。
 * 翻面是本地 UI 状态；首次翻面时回调 onFirstFlip 记录 wordProgress = "flipped"。
 */
export function FlashCard({
  card,
  onFirstFlip,
  onSpoken,
  onClose,
}: {
  card: AlphabetCard;
  onFirstFlip?: () => void;
  /** 例词跟读及格后回调（记 wordProgress spoken） */
  onSpoken?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { state } = useAppState();
  const speechRate = state?.settings.speechRate ?? 0.9;
  const level = state?.profile.level ?? "L3";
  const [face, setFace] = useState<"front" | "back">("front");
  const pr = usePronunciationCheck();

  useEffect(() => {
    configureSpeech(speechRate);
  }, [speechRate]);

  function play(text: string, lang: "fr" | "en" | "zh") {
    cancelSpeech();
    void speak(text, lang);
  }

  function handleFlip() {
    if (face === "front") {
      onFirstFlip?.();
      setFace("back");
    } else {
      setFace("front");
    }
  }

  const letterName = card.letter.charAt(0);

  return (
    <div className="text-center select-none">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-600 font-semibold">
          {card.lang === "fr" ? t("flashcard.langFrench") : t("flashcard.langEnglish")}
        </span>
        <button
          className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 text-lg"
          onClick={onClose}
          aria-label={t("flashcard.close")}
        >
          ×
        </button>
      </div>

      {face === "front" ? (
        <button
          onClick={handleFlip}
          className="w-full py-14 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100 hover:border-purple-300 transition"
          aria-label={t("flashcard.flipAria", { letter: card.letter })}
        >
          <div className="text-8xl font-extrabold text-gray-800 tracking-wide">
            {card.letter}
          </div>
          <div className="text-5xl mt-3" aria-hidden>
            {card.emoji || "🔤"}
          </div>
          <div className="text-xs text-gray-400 mt-4">{t("flashcard.flipHint")}</div>
        </button>
      ) : (
        <div className="py-8 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100">
          <div className="text-5xl font-extrabold text-gray-800">{card.letter}</div>
          <div className="text-4xl mt-2" aria-hidden>
            {card.emoji || "🔤"}
          </div>
          <div className="mt-4 space-y-1.5 px-4">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">{t("flashcard.langZh")}</span>
              <span className="text-gray-800">{card.word.zh}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">{t("sentence.langEn")}</span>
              <span className="text-gray-600">{card.word.en}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">{t("sentence.langFr")}</span>
              <span className="text-gray-600 italic">{card.word.fr}</span>
            </div>
          </div>
          {card.example && (
            <p className="text-xs text-gray-400 mt-3 px-6">
              {card.example.zh}
              <br />
              {card.example.fr}
            </p>
          )}
          {/* 两种点读：字母名 vs 例词（PRD §7.5.2 验收项） */}
          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              className="min-h-[48px] px-5 rounded-full bg-purple-600 text-white text-sm font-bold hover:bg-purple-700"
              onClick={() => play(letterName, card.lang)}
              aria-label={t("flashcard.playLetterNameAria", { name: letterName })}
            >
              {t("flashcard.letterName")}
            </button>
            <button
              className="min-h-[48px] px-5 rounded-full bg-green-600 text-white text-sm font-bold hover:bg-green-700"
              onClick={() => play(card.word.fr, "fr")}
              aria-label={t("flashcard.playExampleAria", { word: card.word.fr })}
            >
              {t("flashcard.exampleWord")}
            </button>
          </div>
          <div className="mt-3">
            <button
              className="text-xs text-gray-400 underline"
              onClick={() => play(card.word.zh, "zh")}
            >
              {t("flashcard.listenZh", { word: card.word.zh })}
            </button>
          </div>

          {/* 例词跟读（T5A.3）：复用 scorePronunciation，及格线随学段；无 ASR 时隐藏 */}
          {pr.asrSupported && (
            <div className="mt-4 pt-3 border-t border-dashed border-purple-100">
              <div className="flex items-center justify-center gap-2">
                <button
                  className={
                    "min-h-[44px] px-5 rounded-full text-sm font-bold transition " +
                    (pr.state === "recording"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-purple-600 text-white hover:bg-purple-700")
                  }
                  onClick={() =>
                    pr.start(card.word.fr, "fr", level, (_r, passed) => {
                      playSfx(passed ? "correct" : "encourage");
                      if (passed) onSpoken?.();
                    })
                  }
                  aria-label={t("flashcard.readAlong")}
                >
                  {pr.state === "recording" ? t("flashcard.recording") : t("flashcard.readAlong")}
                </button>
                <RecordingPlayback
                  recUrl={pr.recUrl}
                  onPlayOriginal={() => play(card.word.fr, "fr")}
                />
              </div>
              {pr.state === "done" && pr.result && (
                <p className="mt-2 text-sm text-center">
                  <span
                    className={
                      "font-extrabold " +
                      (pr.result.score >= 70
                        ? "text-green-600"
                        : pr.result.score >= 50
                        ? "text-amber-500"
                        : "text-orange-500")
                    }
                  >
                    {t("flashcard.score", { score: String(pr.result.score) })}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {t("flashcard.heard", { transcript: pr.result.transcript || "—" })}
                  </span>
                </p>
              )}
              {(pr.state === "denied" || pr.state === "error") && (
                <p className="mt-2 text-xs text-red-400 text-center">{pr.msg}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
