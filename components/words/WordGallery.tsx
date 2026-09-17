"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAppState } from "@/components/AppStateProvider";
import { PopIn } from "@/components/celebrate";
import { RecordingPlayback } from "@/components/RecordingPlayback";
import { usePronunciationCheck } from "@/components/usePronunciationCheck";
import { ImageFallback } from "@/components/ImageFallback";
import { WORD_PLACEHOLDER, WORD_PLACEHOLDER_EMOJI } from "@/lib/imageAssets";
import {
  cancelSpeech,
  configureSpeech,
  pause,
  playSfx,
  speak,
} from "@/lib/audioManager";
import {
  collectionStats,
  upgradeWordProgress,
} from "@/lib/workspace";
import { matchesLevel, type Word } from "@/lib/contentTypes";
import type { WordStatus } from "@/lib/workspace";
import { useI18n } from "@/lib/i18n";

/**
 * 词汇图鉴与闪卡（PRD §7.6.1/§7.6.2/§7.6.5，Dev-Plan T5A.1/T5A.3/T5A.4/T5A.5）：
 * - 图鉴墙：分类 Tab + 学段软切换过滤，卡片 = emoji + 法语词 + 学过角标；
 * - 收集度：分类与整体「n/m」（wordProgress 四态任一即计入）；
 * - 闪卡 deck：翻卡（正面 emoji+点读 / 背面三语+点读+跟读+录音回放）；
 * - 磨耳朵：自动轮播模式（每张 ≈3s，三语轮读，标记 heard）；
 * - 单词跟读：复用 scorePronunciation 管线，及格线随学段，通过记 spoken；
 * - Firefox（无 ASR）隐藏跟读区块，图鉴其余功能可用（优雅降级）。
 */
export function WordGallery({ words }: { words: Word[] }) {
  const { state, update } = useAppState();
  const { t } = useI18n();
  const level = state?.profile.level ?? "L3";
  const hidden = state?.settings.hiddenContent ?? [];
  const speechRate = state?.settings.speechRate ?? 0.9;

  const [activeCat, setActiveCat] = useState<string>("__all");
  const [deckIndex, setDeckIndex] = useState<number | null>(null);
  const [face, setFace] = useState<"front" | "back">("front");
  const [autoplay, setAutoplay] = useState(false);
  const deckIndexRef = useRef<number | null>(null);
  deckIndexRef.current = deckIndex;

  const pr = usePronunciationCheck();
  useEffect(() => {
    configureSpeech(speechRate);
  }, [speechRate]);

  const pool = useMemo(
    () => words.filter((w) => matchesLevel(w.level, level)),
    [words, level]
  );
  const categories = useMemo(() => {
    const seen = new Set<string>();
    pool.forEach((w) => {
      if (w.category && !seen.has(w.category)) seen.add(w.category);
    });
    return Array.from(seen);
  }, [pool]);
  const list = useMemo(
    () =>
      activeCat === "__all"
        ? pool
        : pool.filter((w) => w.category === activeCat),
    [pool, activeCat]
  );

  const wp = state?.wordProgress ?? {};
  const overall = collectionStats(pool, wp);
  const catStat = useCallback(
    (cat: string) =>
      collectionStats(
        cat === "__all" ? pool : pool.filter((w) => w.category === cat),
        wp
      ),
    [pool, wp]
  );

  // 学段/内容变化时复位视图
  useEffect(() => {
    setActiveCat("__all");
    setDeckIndex(null);
    setAutoplay(false);
  }, [level]);

  const markProgress = useCallback(
    (id: string, status: WordStatus) => {
      update?.((s) => ({
        ...s,
        wordProgress: upgradeWordProgress(s.wordProgress, id, status),
      }));
    },
    [update]
  );

  // 磨耳朵自动轮播：三语轮读 + 标记 heard，每张 ≈3s（PRD §7.6.2）
  useEffect(() => {
    if (!autoplay || deckIndex === null || list.length === 0) return;
    let stopped = false;
    void (async () => {
      while (!stopped) {
        const i = deckIndexRef.current;
        if (i === null) break;
        const w = list[i];
        if (!w) break;
        await speak(w.zh, "zh");
        if (stopped) break;
        await speak(w.en, "en");
        if (stopped) break;
        await speak(w.fr, "fr");
        if (stopped) break;
        markProgress(w.id, "heard");
        await pause(800);
        if (stopped) break;
        setDeckIndex((i + 1) % list.length);
        await pause(1400);
      }
    })();
    return () => {
      stopped = true;
      cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, deckIndex === null, activeCat, list.length]);

  if (hidden.includes("word")) {
    return (
      <div className="text-center text-gray-400 py-10">
        {t('alphabet.parentLocked')}
      </div>
    );
  }

  function openDeck(i: number) {
    playSfx("tap");
    pr.reset();
    setFace("front");
    setDeckIndex(i);
  }
  function closeDeck() {
    setAutoplay(false);
    pr.reset();
    setDeckIndex(null);
  }
  function step(delta: 1 | -1) {
    if (deckIndex === null || list.length === 0) return;
    pr.reset();
    setFace("front");
    setDeckIndex((deckIndex + delta + list.length) % list.length);
  }

  const current = deckIndex !== null ? list[deckIndex] : null;

  return (
    <div className="space-y-5">
      {/* 收集度总览 */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-500">
          {t('words.currentLevel')} <b className="text-purple-600">{pool.length}</b> {t('words.words')} ·{" "}
          {categories.length} {t('words.categories')}
        </div>
        <div className="text-gray-400">
          {t('words.collected')}{" "}
          <b className="text-amber-500">
            {overall.collected}/{overall.total}
          </b>
        </div>
      </div>

      {/* 分类 Tab（横向滚动，含收集度） */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[["__all", t('words.all')], ...categories.map((c) => [c, c] as const)].map(
          ([key, label]) => {
            const stat = catStat(key);
            const on = activeCat === key;
            return (
              <button
                key={key}
                onClick={() => {
                  playSfx("tap");
                  setActiveCat(key);
                  setDeckIndex(null);
                  setAutoplay(false);
                }}
                aria-pressed={on}
                className={
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition min-h-[36px] " +
                  (on
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 text-purple-600")
                }
              >
                {label}（{stat.collected}/{stat.total}）
              </button>
            );
          }
        )}
      </div>

      {/* 图鉴墙 */}
      {list.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          {t('words.noCards')}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {list.map((w, i) => {
            const st = wp[w.id];
            return (
              <button
                key={w.id}
                onClick={() => openDeck(i)}
                className={
                  "bg-white rounded-2xl border-2 p-3 text-center transition hover:shadow-md hover:-translate-y-0.5 min-h-[88px] " +
                  (st
                    ? "border-green-200"
                    : "border-gray-100")
                }
                aria-label={`词卡 ${w.zh}（${w.fr}）${st ? t('words.hasLearned') : ''}`}
              >
                <ImageFallback
                  src={WORD_PLACEHOLDER}
                  alt={w.fr}
                  fallback={w.emoji || WORD_PLACEHOLDER_EMOJI}
                  size={48}
                  lazy
                />
                <div className="text-sm font-bold text-gray-800 mt-1 truncate">
                  {w.fr}
                </div>
                <div className="text-[10px] text-gray-400 truncate">{w.zh}</div>
                {st && (
                  <div className="text-[10px] text-green-500 mt-0.5">
                    {st === "spoken"
                      ? t('words.canRead')
                      : st === "correct"
                      ? t('words.answeredCorrect')
                      : st === "flipped"
                      ? t('words.flipped')
                      : t('words.heard')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 闪卡 deck 弹窗 */}
      {current && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-gray-800/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeck();
          }}
        >
          <PopIn className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-600 font-semibold truncate max-w-[60%]">
                {current.category || "词汇"} · {level}
              </span>
              <div className="flex items-center gap-2">
                {/* 磨耳朵开关（PRD §7.6.2：3s/张 三语轮读） */}
                <button
                  onClick={() => setAutoplay((v) => !v)}
                  aria-pressed={autoplay}
                  className={
                    "text-xs px-3 py-1.5 rounded-full font-semibold transition min-h-[36px] " +
                    (autoplay
                      ? "bg-pink-500 text-white animate-pulse"
                      : "bg-pink-50 text-pink-500")
                  }
                  title={t('words.autoplayTooltip')}
                >
                  {t('words.listenEar')}
                </button>
                <button
                  className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 text-lg"
                  onClick={closeDeck}
                  aria-label="关闭闪卡"
                >
                  ×
                </button>
              </div>
            </div>

            {/* 进度与翻页 */}
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
              <button
                className="min-h-[36px] px-3 rounded-full bg-gray-50 hover:bg-gray-100"
                onClick={() => step(-1)}
                aria-label={t('words.previous')}
              >
                {t('words.previous')}
              </button>
              <span>
                {(deckIndex ?? 0) + 1} / {list.length}
              </span>
              <button
                className="min-h-[36px] px-3 rounded-full bg-gray-50 hover:bg-gray-100"
                onClick={() => step(1)}
                aria-label={t('words.next')}
              >
                {t('words.next')}
              </button>
            </div>

            {face === "front" ? (
              <button
                onClick={() => {
                  markProgress(current.id, "flipped");
                  setFace("back");
                }}
                className="w-full py-12 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100 hover:border-purple-300 transition"
                aria-label={`${t('words.flip')} ${current.zh}`}
              >
                <ImageFallback
                  src={WORD_PLACEHOLDER}
                  alt={current.fr}
                  fallback={current.emoji || WORD_PLACEHOLDER_EMOJI}
                  size={96}
                />
                <div className="mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markProgress(current.id, "heard");
                      cancelSpeech();
                      void speak(current.fr, "fr");
                    }}
                    className="w-12 h-12 rounded-full bg-green-500 text-white text-lg hover:bg-green-600"
                    aria-label="播放法语"
                  >
                    ▶
                  </button>
                </div>
                <div className="text-xs text-gray-400 mt-3">{t('words.tapToFlip')}</div>
              </button>
            ) : (
              <div className="py-6 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100 px-4">
                <div className="text-4xl" aria-hidden>
                  {current.emoji || "🃏"}
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">{t('flashcard.langZh')}</span>
                    <span className="text-gray-800 font-semibold">{current.zh}</span>
                    <button
                      className="w-8 h-8 rounded-full bg-red-50 text-red-500 text-xs"
                      onClick={() => {
                        markProgress(current.id, "heard");
                        cancelSpeech();
                        void speak(current.zh, "zh");
                      }}
                      aria-label="播放中文"
                    >
                      ▶
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">EN</span>
                    <span className="text-gray-600">{current.en}</span>
                    <button
                      className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 text-xs"
                      onClick={() => {
                        markProgress(current.id, "heard");
                        cancelSpeech();
                        void speak(current.en, "en");
                      }}
                      aria-label="播放英语"
                    >
                      ▶
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">FR</span>
                    <span className="text-gray-600 italic">{current.fr}</span>
                    <button
                      className="w-8 h-8 rounded-full bg-green-50 text-green-600 text-xs"
                      onClick={() => {
                        markProgress(current.id, "heard");
                        cancelSpeech();
                        void speak(current.fr, "fr");
                      }}
                      aria-label="播放法语"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                {/* 单词跟读（T5A.3/T5A.4）：复用 scorePronunciation + 录音回放；无 ASR 时隐藏 */}
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
                          pr.start(current.fr, "fr", level, (_r, passed) => {
                            playSfx(passed ? "correct" : "encourage");
                            if (passed) markProgress(current.id, "spoken");
                          })
                        }
                        aria-label={t('words.readAlong')}
                      >
                        {pr.state === "recording" ? t('flashcard.recording') : t('words.readAlongBtn')}
                      </button>
                      <RecordingPlayback
                        recUrl={pr.recUrl}
                        onPlayOriginal={() => {
                          cancelSpeech();
                          void speak(current.fr, "fr");
                        }}
                      />
                    </div>
                    {pr.state === "done" && pr.result && (
                      <div className="mt-2 text-center text-sm">
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
                          {t('words.score', { score: String(pr.result.score) })}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">
                          {t('words.heardTranscript', { transcript: pr.result.transcript || "—" })}
                        </span>
                      </div>
                    )}
                    {(pr.state === "denied" || pr.state === "error") && (
                      <p className="mt-2 text-xs text-red-400 text-center">{pr.msg}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="text-center mt-3">
              <Link
                href="/alphabets"
                className="text-xs text-gray-300 hover:text-purple-400"
              >
                {t('words.practiceSpelling')} →
              </Link>
            </div>
          </PopIn>
        </div>
      )}
    </div>
  );
}
