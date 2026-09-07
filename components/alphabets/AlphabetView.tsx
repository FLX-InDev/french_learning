"use client";

import { useMemo, useRef, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { FlashCard } from "@/components/FlashCard";
import { SpellingAttempt } from "@/components/SpellingBoard";
import { PopIn } from "@/components/celebrate";
import { playSfx } from "@/lib/audioManager";
import { addPoints } from "@/lib/workspace";
import {
  buildSpellingPool,
  type SpellingWord,
} from "@/lib/spelling";
import type { AlphabetCard, Word } from "@/lib/contentTypes";

/**
 * 字母表页客户端视图（PRD §7.5.1，Dev-Plan T3.1 + T3.2）：
 * - 法语 / 英语 Tab，26×2 字母卡网格，点卡进入翻卡（FlashCard）；
 * - 翻卡进度（wordProgress: flipped）按语言统计；
 * - 下方「拼词游戏」：题源 = 词卡 + 字母代表词（按学段过滤），
 *   拼对 +2 积分并记 wordProgress correct；拼错记入 misspelled（每日挑战优先重现）。
 */
export function AlphabetView({
  alphabets,
  words,
}: {
  alphabets: AlphabetCard[];
  words: Word[];
}) {
  const { state, update } = useAppState();
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [openId, setOpenId] = useState<string | null>(null);
  const [spellIdx, setSpellIdx] = useState(0);
  const [spellResult, setSpellResult] = useState<null | boolean>(null);
  const recordedRef = useRef(false);

  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];

  const cards = useMemo(
    () => alphabets.filter((a) => a.lang === lang),
    [alphabets, lang]
  );
  const flippedCount = cards.filter(
    (a) => state?.wordProgress[`alpha_${a.id}`] === "flipped"
  ).length;

  // 拼词池：按当前学段过滤；轮换取词（学段/内容变化时重置游标）
  const spellPool = useMemo(
    () => buildSpellingPool(words, alphabets, level),
    [words, alphabets, level]
  );
  const spellWord: SpellingWord | undefined =
    spellPool.length > 0 ? spellPool[spellIdx % spellPool.length] : undefined;

  if (hidden.includes("alphabet")) {
    return (
      <div className="text-center text-gray-400 py-10">
        该内容已被家长关闭，可在家长中心重新开启。
      </div>
    );
  }

  const openCard = cards.find((a) => a.id === openId) || null;

  function handleSpellResult(correct: boolean) {
    if (!recordedRef.current) {
      recordedRef.current = true;
      setSpellResult(correct);
      if (update && spellWord) {
        if (correct) {
          // +2 积分：拼词来源（wordProgress correct 与 misspelled 清理由 SpellingAttempt 完成）
          update((s) => ({ ...s, points: addPoints(s.points, 2, "拼对单词") }));
        } else {
          // 拼错：记入 misspelled 队列，下次每日挑战优先重现（PRD §7.5.5）
          update((s) => ({
            ...s,
            misspelled: [
              spellWord.id,
              ...s.misspelled.filter((id) => id !== spellWord.id),
            ].slice(0, 20),
          }));
        }
      }
    }
  }

  function nextWord() {
    recordedRef.current = false;
    setSpellResult(null);
    setSpellIdx((i) => i + 1);
  }

  return (
    <div className="space-y-8">
      {/* 语言 Tab */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-full bg-purple-50 p-1" role="tablist" aria-label="字母表语言">
          {(
            [
              ["fr", "Français 法语"],
              ["en", "English 英语"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={lang === key}
              onClick={() => {
                setLang(key);
                setOpenId(null);
              }}
              className={
                "px-4 py-2 rounded-full text-sm font-semibold transition min-h-[40px] " +
                (lang === key ? "bg-purple-600 text-white" : "text-purple-600")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">
          已翻卡 {flippedCount} / {cards.length}
        </div>
      </div>

      {/* 字母卡网格 */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
        {cards.map((a) => {
          const learned = state?.wordProgress[`alpha_${a.id}`] === "flipped";
          return (
            <button
              key={a.id}
              onClick={() => {
                playSfx("tap"); // 点按音效（默认关，家长中心可开）
                setOpenId(a.id);
              }}
              className={
                "bg-white rounded-2xl border-2 p-3 text-center transition hover:shadow-md hover:-translate-y-0.5 min-h-[72px] " +
                (learned ? "border-green-200" : "border-gray-100")
              }
              aria-label={`字母 ${a.letter}，${a.word.zh}`}
            >
              <div className="text-2xl font-extrabold text-gray-800">{a.letter}</div>
              <div className="text-xl mt-1" aria-hidden>
                {a.emoji}
              </div>
              {learned && (
                <div className="text-[10px] text-green-500 mt-0.5">✓ 学过</div>
              )}
            </button>
          );
        })}
      </div>

      {/* 拼词游戏 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            🧩 拼词游戏
          </h2>
          <span className="text-xs text-gray-400">题库 {spellPool.length} 词</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          看图听音，点选字母瓦片拼出法语单词；拼错的词会在「每日挑战」里再次出现。
        </p>
        {spellWord ? (
          <>
            <SpellingAttempt key={spellWord.id + "_" + spellIdx} word={spellWord} onResult={handleSpellResult} />
            {spellResult !== null && (
              <div className="text-center mt-3">
                <button className="btn-primary min-w-[140px] min-h-[44px]" onClick={nextWord}>
                  下一个词 →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-gray-400 py-6">
            当前学段暂无可用拼词（需要 3–7 个字母的词卡）。
          </div>
        )}
      </section>

      {/* 翻卡弹窗 */}
      {openCard && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-gray-800/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenId(null);
          }}
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <PopIn>
              <FlashCard
                key={openCard.id}
                card={openCard}
                onFirstFlip={() => {
                  update?.((s) => ({
                    ...s,
                    wordProgress: {
                      ...s.wordProgress,
                      [`alpha_${openCard.id}`]: "flipped",
                    },
                  }));
                }}
                onClose={() => setOpenId(null)}
              />
            </PopIn>
          </div>
        </div>
      )}
    </div>
  );
}
