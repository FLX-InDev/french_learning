"use client";

import { cancelSpeech, configureSpeech, speak } from "@/lib/audioManager";
import { useAppState } from "@/components/AppStateProvider";
import type { AlphabetCard } from "@/lib/contentTypes";
import { useEffect, useState } from "react";

/**
 * 字母翻卡（PRD §7.5.2，Dev-Plan T3.1）：
 * 正面 = 大字母 + 代表词 emoji；翻面 = 三语代表词 + 例句 + 两种点读——
 * 「字母名」（A = /a/，读卡片语言）与「例词」（整词）可区分点读。
 * 翻面是本地 UI 状态；首次翻面时回调 onFirstFlip 记录 wordProgress = "flipped"。
 */
export function FlashCard({
  card,
  onFirstFlip,
  onClose,
}: {
  card: AlphabetCard;
  onFirstFlip?: () => void;
  onClose: () => void;
}) {
  const { state } = useAppState();
  const speechRate = state?.settings.speechRate ?? 0.9;
  const [face, setFace] = useState<"front" | "back">("front");

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
          {card.lang === "fr" ? "Français 法语" : "English 英语"}
        </span>
        <button
          className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 text-lg"
          onClick={onClose}
          aria-label="关闭字母卡"
        >
          ×
        </button>
      </div>

      {face === "front" ? (
        <button
          onClick={handleFlip}
          className="w-full py-14 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100 hover:border-purple-300 transition"
          aria-label={`翻面查看字母 ${card.letter}`}
        >
          <div className="text-8xl font-extrabold text-gray-800 tracking-wide">
            {card.letter}
          </div>
          <div className="text-5xl mt-3" aria-hidden>
            {card.emoji || "🔤"}
          </div>
          <div className="text-xs text-gray-400 mt-4">👆 点击翻面</div>
        </button>
      ) : (
        <div className="py-8 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100">
          <div className="text-5xl font-extrabold text-gray-800">{card.letter}</div>
          <div className="text-4xl mt-2" aria-hidden>
            {card.emoji || "🔤"}
          </div>
          <div className="mt-4 space-y-1.5 px-4">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">中</span>
              <span className="text-gray-800">{card.word.zh}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">EN</span>
              <span className="text-gray-600">{card.word.en}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">FR</span>
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
              aria-label={`播放字母名 ${letterName}`}
            >
              🔤 字母名
            </button>
            <button
              className="min-h-[48px] px-5 rounded-full bg-green-600 text-white text-sm font-bold hover:bg-green-700"
              onClick={() => play(card.word.fr, "fr")}
              aria-label={`播放例词 ${card.word.fr}`}
            >
              🍎 例词
            </button>
          </div>
          <div className="mt-3">
            <button
              className="text-xs text-gray-400 underline"
              onClick={() => play(card.word.zh, "zh")}
            >
              听中文（{card.word.zh}）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
