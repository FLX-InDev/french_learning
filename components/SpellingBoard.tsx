"use client";

import { useEffect, useMemo, useState } from "react";
import { cancelSpeech, configureSpeech, playSfx, speak } from "@/lib/audioManager";
import { useAppState } from "@/components/AppStateProvider";
import { useI18n } from "@/lib/i18n";
import {
  ACCENT_KEYS,
  isSpellingCorrect,
  scrambleTiles,
  splitTiles,
  type SpellingWord,
} from "@/lib/spelling";
import { mulberry32, seedFromString } from "@/lib/mathGenerator";
import { phonicsScriptFor, splitGraphemesFr, splitSyllablesFr } from "@/lib/phonics";
import type { Level } from "@/lib/levels";

/**
 * 拼词尝试卡（PRD §7.5.3–§7.5.4，Dev-Plan T3.2）
 *
 * 交互以点选为主路径（P-2：大瓦片 ≥48px；幼儿拖拽的等价点选路径）：
 * 点下方乱序瓦片 → 依序拼入答案槽；点答案槽末尾撤回；「⌫」清空重拼。
 * accent 提示盘：单词含该变音符时高亮，点击自动放置对应瓦片（P0 基础档）。
 *
 * 两种使用方式：
 * - 拼词游戏（/alphabets 页）：父组件传入新 word 即进入下一题；
 * - 每日挑战拼写题：传入 word + onResult，由挑战卷编排结算。
 */
export function SpellingAttempt({
  word,
  onResult,
  compact,
}: {
  word: SpellingWord;
  /** 结果回调（对/错各回调一次；父组件据此记错词/积分/推进） */
  onResult?: (correct: boolean) => void;
  compact?: boolean;
}) {
  const { state, update } = useAppState();
  const { t } = useI18n();
  const speechRate = state?.settings.speechRate ?? 0.9;
  const level = state?.profile.level ?? "L3";
  const [placed, setPlaced] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    configureSpeech(speechRate);
  }, [speechRate]);

  const target = useMemo(() => splitTiles(word.fr), [word.fr]);

  // 同一单词的乱序结果稳定（种子 = 单词 fr），刷新/重渲染不跳动
  const scrambled = useMemo(
    () => scrambleTiles(target, mulberry32(seedFromString("spell_" + word.fr))),
    [target, word.fr]
  );

  // 切换单词时重置
  useEffect(() => {
    setPlaced([]);
    setChecked(false);
  }, [word.id]);

  const correct =
    checked && isSpellingCorrect(placed.map((i) => scrambled[i]), word.fr);
  const full = placed.length === scrambled.length;

  function place(index: number) {
    if (checked || placed.includes(index)) return;
    setPlaced((p) => [...p, index]);
  }
  function undoLast() {
    if (checked) return;
    setPlaced((p) => p.slice(0, -1));
  }
  function clearAll() {
    if (checked) return;
    setPlaced([]);
  }
  /** accent 提示盘：自动放置第一个未使用且字符匹配的瓦片 */
  function placeAccent(acc: string) {
    if (checked) return;
    const idx = scrambled.findIndex(
      (t, i) => t === acc && !placed.includes(i)
    );
    if (idx >= 0) place(idx);
  }

  function check() {
    if (!full || checked) return;
    const ok = isSpellingCorrect(
      placed.map((i) => scrambled[i]),
      word.fr
    );
    setChecked(true);
    onResult?.(ok);
    playSfx(ok ? "correct" : "encourage"); // 音效触发矩阵（PRD §7.3）
    if (!ok) return;
    // 拼对：进度标记 correct（供图鉴收集度统计），并从错词队列移除
    if (update) {
      update((s) => ({
        ...s,
        wordProgress: { ...s.wordProgress, [word.id]: "correct" },
        misspelled: s.misspelled.filter((id) => id !== word.id),
      }));
    }
  }

  function retry() {
    setChecked(false);
    setPlaced([]);
  }

  function playWord() {
    cancelSpeech();
    void speak(word.fr, "fr");
  }

  const inWordAccents = useMemo(
    () => ACCENT_KEYS.filter((a) => target.includes(a)),
    [target]
  );

  return (
    <div
      className={
        "bg-white rounded-2xl border p-4 text-center " +
        (compact ? "border-gray-100" : "border-gray-100 shadow-sm")
      }
    >
      {/* 提示区：emoji + 中/英 + 点读（答案不提前剧透法语拼写） */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-5xl" aria-hidden>
          {word.emoji || "🔤"}
        </span>
        <div className="text-left">
          <div className="font-bold text-gray-800">{word.zh}</div>
          <div className="text-xs text-gray-400">{word.en}</div>
        </div>
        <button
          onClick={playWord}
          className="w-11 h-11 rounded-full bg-green-50 text-green-600 text-lg shrink-0 hover:bg-green-100"
          aria-label={t('spelling.playFrench')}
          title={t('spelling.playFrench')}
        >
          ▶
        </button>
      </div>

      {/* 答案槽 */}
      <div
        className={
          "flex flex-wrap justify-center gap-1.5 mt-4 " +
          (checked && !correct ? "animate-[shake_0.4s_ease]" : "")
        }
        role="group"
        aria-label={t('spelling.answerSlot')}
      >
        {scrambled.map((_, slot) => {
          const filledIdx = placed[slot];
          const ch = filledIdx !== undefined ? scrambled[filledIdx] : "";
          return (
            <button
              key={slot}
              onClick={undoLast}
              aria-label={ch ? t('spelling.position', { slot: String(slot + 1), ch }) : t('spelling.positionEmpty', { slot: String(slot + 1) })}
              className={
                "w-11 h-12 rounded-lg border-2 text-xl font-bold transition flex items-center justify-center " +
                (checked
                  ? correct
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-red-300 bg-red-50 text-red-600"
                  : filledIdx !== undefined
                  ? "border-purple-400 bg-purple-50 text-purple-700"
                  : "border-dashed border-gray-200 bg-gray-50 text-gray-300")
              }
            >
              {ch || "·"}
            </button>
          );
        })}
      </div>

      {/* 乱序瓦片 */}
      <div className="flex flex-wrap justify-center gap-2 mt-4" role="group" aria-label={t('spelling.tiles')}>
        {scrambled.map((ch, i) => {
          const used = placed.includes(i);
          return (
            <button
              key={i}
              onClick={() => place(i)}
              disabled={used || checked}
              aria-label={t('spelling.tile', { ch, used: used ? t('common.used') : '' })}
              className={
                "w-11 h-12 rounded-lg border-2 text-xl font-bold transition select-none " +
                (used
                  ? "border-gray-100 bg-gray-50 text-gray-200"
                  : "border-purple-200 bg-white text-gray-700 hover:border-purple-400 hover:bg-purple-50 active:scale-95")
              }
            >
              {ch}
            </button>
          );
        })}
      </div>

      {/* accent 提示盘（PRD §7.5.4：单词含变音符时高亮提示，点击自动放置） */}
      {inWordAccents.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <span className="text-[11px] text-gray-400 mr-1">{t('spelling.accentHint')}：</span>
          {ACCENT_KEYS.map((a) => {
            const has = inWordAccents.includes(a);
            return (
              <button
                key={a}
                onClick={() => placeAccent(a)}
                disabled={!has || checked}
                aria-label={has ? t('spelling.placeAccent', { a }) : t('spelling.noAccent', { a })}
                className={
                  "w-9 h-9 rounded-md border text-base font-bold transition " +
                  (has
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-gray-100 bg-gray-50 text-gray-200")
                }
              >
                {a}
              </button>
            );
          })}
        </div>
      )}

      {/* 操作区 */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {!checked ? (
          <>
            <button
              className="btn-secondary min-h-[44px]"
              onClick={clearAll}
              disabled={placed.length === 0}
              aria-label={t('spelling.clearRetry')}
            >
              ⌫ {t('spelling.retry')}
            </button>
            <button
              className="btn-primary min-h-[44px] min-w-[120px]"
              onClick={check}
              disabled={!full}
            >
              {full ? t('spelling.check') : t('spelling.remaining', { n: String(scrambled.length - placed.length) })}
            </button>
          </>
        ) : correct ? (
          <div className="text-green-600 font-bold">
            {t('spelling.spelledCorrectly', { fr: word.fr })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {t('spelling.correctSpelling')}: <b className="text-gray-800">{word.fr}</b>
              </span>
              <button className="btn-secondary min-h-[40px]" onClick={retry}>
                {t('spelling.tryAgain')}
              </button>
            </div>
            {/* T6-07 拼读接入：拼错后按学段派生体系（DG-1）给出音节/字素切分提示 */}
            <PhonicsBreakdown word={word.fr} level={level} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 拼读结构提示（Phase 6 T6-07 接入）：按学段派生体系（DG-1）展示切分块。
 * - L1–L3 → 音节（syllabique）；L4+ → 字素（mixte）；
 * - 单块词（无可切分）不渲染。
 */
export function PhonicsBreakdown({
  word,
  level,
}: {
  word: string;
  level: Level;
}) {
  const { t } = useI18n();
  const parts =
    phonicsScriptFor(level) === "syllabique"
      ? splitSyllablesFr(word)
      : splitGraphemesFr(word);
  if (parts.length < 2) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap mt-1">
      <span className="text-[11px] text-gray-400">{t("phonics.title")}：</span>
      {parts.map((p, i) => (
        <span
          key={i}
          className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-sm font-bold"
        >
          {p}
        </span>
      ))}
    </div>
  );
}
